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

export async function getTodayCalendar(): Promise<CalendarResponse> {
  const { date, start, end } = toKstDateParts();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const token = await getAccessToken().catch(() => null);

  if (!token) {
    return readCacheOrDemo(date, "Google Calendar 인증값이 없어 예시 일정 또는 저장된 일정을 표시 중입니다.");
  }

  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", start);
  url.searchParams.set("timeMax", end);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "10");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const message = await response.text();
    if (response.status === 403) {
      return readCacheOrDemo(date, "현재 Google 토큰에 일정 읽기 권한이 없어 저장된 오늘 일정으로 표시 중입니다.");
    }
    throw new Error(`Google Calendar error: ${response.status} ${message}`);
  }

  const json = await response.json();
  const events = (json.items ?? []).map((item: Record<string, unknown>) => {
    const startValue = (item.start as { dateTime?: string; date?: string })?.dateTime ?? (item.start as { date?: string })?.date ?? "";
    const endValue = (item.end as { dateTime?: string; date?: string })?.dateTime ?? (item.end as { date?: string })?.date ?? "";
    const isAllDay = !String(startValue).includes("T");

    return {
      id: String(item.id ?? ""),
      title: String(item.summary ?? "제목 없음"),
      start: String(startValue),
      end: String(endValue),
      isAllDay
    };
  });

  return {
    source: "google-calendar",
    generatedAt: new Date().toISOString(),
    date,
    events
  };
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
