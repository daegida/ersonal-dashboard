import fs from "node:fs";
import path from "node:path";
import { CalendarResponse } from "./types";

const cacheDir = path.join(process.cwd(), "storage");
const cachePath = path.join(cacheDir, "calendar-cache.json");

function toKstDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    start: `${parts.year}-${parts.month}-${parts.day}T00:00:00+09:00`,
    end: `${parts.year}-${parts.month}-${parts.day}T23:59:59+09:00`
  };
}

async function getAccessToken() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  });

  if (redirectUri) {
    body.set("redirect_uri", redirectUri);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Google token error: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.access_token as string;
}

type CalendarSource = {
  id: string;
  name: string;
};

function isWithinToday(value: string | null | undefined, start: string, end: string) {
  if (!value) return false;
  const time = new Date(value).getTime();
  return time >= new Date(start).getTime() && time <= new Date(end).getTime();
}

async function fetchSelectedCalendarSources(token: string): Promise<CalendarSource[]> {
  const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
    headers: {
      authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Google Calendar list error: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const items = Array.isArray(json.items) ? json.items : [];

  return items
    .filter((item: Record<string, unknown>) => item.hidden !== true && item.selected !== false)
    .map((item: Record<string, unknown>) => ({
      id: String(item.id ?? ""),
      name: String(item.summaryOverride ?? item.summary ?? item.id ?? "")
    }))
    .filter((item: CalendarSource) => item.id);
}

async function resolveCalendarSources(token: string): Promise<CalendarSource[]> {
  const configured = process.env.GOOGLE_CALENDAR_ID
    ?.split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (configured && configured.length > 0 && !configured.includes("all") && !configured.includes("primary")) {
    return configured.map((id) => ({ id, name: id }));
  }

  return fetchSelectedCalendarSources(token);
}

export async function getTodayCalendar(): Promise<CalendarResponse> {
  const { date, start, end } = toKstDateParts();
  const token = await getAccessToken().catch(() => null);

  if (!token) {
    return readCacheOrDemo(date, "Google Calendar 인증값이 없어 예시 일정 또는 저장된 일정을 표시 중입니다.");
  }
  let calendarSources: CalendarSource[];

  try {
    calendarSources = await resolveCalendarSources(token);
  } catch {
    const fallbackId = process.env.GOOGLE_CALENDAR_ID || "primary";
    calendarSources = [{ id: fallbackId, name: fallbackId }];
  }

  try {
    const responses = await Promise.all(
      calendarSources.map(async (calendarSource) => {
        const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarSource.id)}/events`);
        url.searchParams.set("timeMin", start);
        url.searchParams.set("timeMax", end);
        url.searchParams.set("singleEvents", "true");
        url.searchParams.set("orderBy", "startTime");
        url.searchParams.set("maxResults", "20");

        const response = await fetch(url, {
          headers: {
            authorization: `Bearer ${token}`
          },
          cache: "no-store"
        });

        if (!response.ok) {
          const message = await response.text();
          if (response.status === 403) {
            throw new Error(`403:${message}`);
          }
          throw new Error(`Google Calendar error: ${response.status} ${message}`);
        }

        const json = await response.json();
        return (json.items ?? []).map((item: Record<string, unknown>) => {
          const startValue =
            (item.start as { dateTime?: string; date?: string })?.dateTime ??
            (item.start as { date?: string })?.date ??
            "";
          const endValue =
            (item.end as { dateTime?: string; date?: string })?.dateTime ??
            (item.end as { date?: string })?.date ??
            "";
          const isAllDay = !String(startValue).includes("T");

          const description = String(item.description ?? "");
          const lowerName = calendarSource.name.toLowerCase();
          const isTask =
            lowerName.includes("task") ||
            lowerName.includes("할 일") ||
            description.includes("tasks.google.com/task/");

          return {
            id: `${calendarSource.id}:${String(item.id ?? "")}`,
            title: String(item.summary ?? "제목 없음"),
            start: String(startValue),
            end: String(endValue),
            isAllDay,
            calendarId: calendarSource.id,
            calendarName: calendarSource.name,
            isTask
          };
        });
      })
    );

    const events = responses
      .flat()
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .slice(0, 20);

    let tasksNote: string | undefined;

    try {
      const taskListResponse = await fetch("https://tasks.googleapis.com/tasks/v1/users/@me/lists", {
        headers: {
          authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      if (taskListResponse.ok) {
        const taskListsJson = await taskListResponse.json();
        const taskLists = Array.isArray(taskListsJson.items) ? taskListsJson.items : [];

        const taskResponses = await Promise.all(
          taskLists.map(async (taskList: Record<string, unknown>) => {
            const taskListId = String(taskList.id ?? "");
            const taskListTitle = String(taskList.title ?? "Tasks");

            if (!taskListId) return [];

            const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`);
            url.searchParams.set("showCompleted", "false");
            url.searchParams.set("showDeleted", "false");
            url.searchParams.set("showHidden", "false");
            url.searchParams.set("dueMin", start);
            url.searchParams.set("dueMax", end);
            url.searchParams.set("maxResults", "50");

            const response = await fetch(url, {
              headers: {
                authorization: `Bearer ${token}`
              },
              cache: "no-store"
            });

            if (!response.ok) {
              return [];
            }

            const json = await response.json();
            const items = Array.isArray(json.items) ? json.items : [];

            return items
              .filter((item: Record<string, unknown>) => {
                const status = String(item.status ?? "");
                const due = typeof item.due === "string" ? item.due : null;
                return status !== "completed" && isWithinToday(due, start, end);
              })
              .map((item: Record<string, unknown>) => {
                const due = typeof item.due === "string" ? item.due : start;

                return {
                  id: `task:${taskListId}:${String(item.id ?? "")}`,
                  title: String(item.title ?? "할 일"),
                  start: due,
                  end: due,
                  isAllDay: true,
                  calendarId: taskListId,
                  calendarName: taskListTitle,
                  isTask: true
                };
              });
          })
        );

        events.push(...taskResponses.flat());
        events.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
      } else if (taskListResponse.status === 403 || taskListResponse.status === 401) {
        tasksNote = "Google Tasks 권한이 없어 일정형 할 일은 아직 표시되지 않습니다.";
      }
    } catch {
      tasksNote = "Google Tasks를 불러오지 못해 캘린더 일정만 표시 중입니다.";
    }

    return {
      source: "google-calendar",
      generatedAt: new Date().toISOString(),
      date,
      events,
      note: tasksNote
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("403:")) {
      return readCacheOrDemo(date, "현재 Google 토큰에 일정 읽기 권한이 없어 저장된 오늘 일정으로 표시 중입니다.");
    }
    throw error;
  }
}

function readCacheOrDemo(date: string, note: string): CalendarResponse {
  try {
    if (fs.existsSync(cachePath)) {
      const raw = fs.readFileSync(cachePath, "utf8");
      const parsed = JSON.parse(raw) as CalendarResponse;
      if (parsed.date === date) {
        return {
          ...parsed,
          note
        };
      }
    }
  } catch {
    // Ignore cache read failures and fall back to demo data.
  }

  return {
    source: "demo",
    generatedAt: new Date().toISOString(),
    date,
    events: [
      { id: "demo-1", title: "팀 체크인", start: `${date}T10:00:00+09:00`, end: `${date}T10:30:00+09:00`, isAllDay: false },
      { id: "demo-2", title: "운동", start: `${date}T20:00:00+09:00`, end: `${date}T20:40:00+09:00`, isAllDay: false }
    ],
    note
  };
}
