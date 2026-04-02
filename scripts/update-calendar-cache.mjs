import fs from "node:fs";
import path from "node:path";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function todayInSeoul() {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const date = formatter.format(new Date());
  return {
    date,
    start: `${date}T00:00:00+09:00`,
    end: `${date}T23:59:59+09:00`
  };
}

async function getAccessToken() {
  const params = new URLSearchParams({
    client_id: requireEnv("GOOGLE_CLIENT_ID"),
    client_secret: requireEnv("GOOGLE_CLIENT_SECRET"),
    refresh_token: requireEnv("GOOGLE_REFRESH_TOKEN"),
    grant_type: "refresh_token"
  });

  if (process.env.GOOGLE_REDIRECT_URI) {
    params.set("redirect_uri", process.env.GOOGLE_REDIRECT_URI);
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });

  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  return json.access_token;
}

async function main() {
  const { date, start, end } = todayInSeoul();
  const token = await getAccessToken();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || "primary";
  const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
  url.searchParams.set("timeMin", start);
  url.searchParams.set("timeMax", end);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", "10");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error(`Calendar request failed: ${response.status} ${await response.text()}`);
  }

  const json = await response.json();
  const payload = {
    source: "google-calendar-cache",
    generatedAt: new Date().toISOString(),
    date,
    events: (json.items ?? []).map((item) => ({
      id: String(item.id ?? ""),
      title: String(item.summary ?? "제목 없음"),
      start: item.start?.dateTime ?? item.start?.date ?? "",
      end: item.end?.dateTime ?? item.end?.date ?? "",
      isAllDay: !String(item.start?.dateTime ?? "").includes("T")
    }))
  };

  const storageDir = path.join(process.cwd(), "storage");
  fs.mkdirSync(storageDir, { recursive: true });
  fs.writeFileSync(path.join(storageDir, "calendar-cache.json"), JSON.stringify(payload, null, 2));
  console.log(`Saved ${payload.events.length} events for ${date}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
