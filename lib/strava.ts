import fs from "node:fs";
import path from "node:path";
import { addRunningEntry, deleteRunningEntriesBefore, deleteRunningEntriesByDistance, hasRunningEntryByExternal } from "./db";
import { StravaStatusResponse } from "./types";

type StravaToken = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  athlete?: {
    id?: number;
  };
};

const storageDir = path.join(process.cwd(), "storage");
const tokenPath = path.join(storageDir, "strava-token.json");

function isSupabaseEnabled() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY가 비어 있습니다.");
  }

  return { url, serviceRoleKey };
}

async function supabaseRequest<T>(pathWithQuery: string, init?: RequestInit): Promise<T> {
  const { url, serviceRoleKey } = getSupabaseConfig();
  const response = await fetch(`${url}/rest/v1/${pathWithQuery}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      authorization: `Bearer ${serviceRoleKey}`,
      "content-type": "application/json",
      ...(init?.headers ?? {})
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

function ensureStorageDir() {
  fs.mkdirSync(storageDir, { recursive: true });
}

function getConfig() {
  return {
    clientId: process.env.STRAVA_CLIENT_ID || "",
    clientSecret: process.env.STRAVA_CLIENT_SECRET || "",
    redirectUri: process.env.STRAVA_REDIRECT_URI || "http://localhost:3000/api/strava/callback"
  };
}

async function readToken(): Promise<StravaToken | null> {
  if (isSupabaseEnabled()) {
    const rows = await supabaseRequest<Array<{ value: StravaToken }>>(
      "integration_tokens?select=value&provider=eq.strava&limit=1"
    );
    return rows[0]?.value ?? null;
  }

  try {
    if (!fs.existsSync(tokenPath)) return null;
    return JSON.parse(fs.readFileSync(tokenPath, "utf8")) as StravaToken;
  } catch {
    return null;
  }
}

async function writeToken(token: StravaToken) {
  if (isSupabaseEnabled()) {
    await supabaseRequest("integration_tokens?on_conflict=provider", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        provider: "strava",
        value: token,
        updated_at: new Date().toISOString()
      })
    });
    return;
  }

  ensureStorageDir();
  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2));
}

async function exchangeToken(body: URLSearchParams) {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Strava token error: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as StravaToken;
}

export async function getStravaStatus(): Promise<StravaStatusResponse> {
  const token = await readToken();
  return {
    connected: Boolean(token?.refresh_token),
    athleteId: token?.athlete?.id ? String(token.athlete.id) : null,
    note: token?.refresh_token ? undefined : "아직 Strava 연결이 없습니다."
  };
}

export function getStravaAuthorizeUrl() {
  const { clientId, redirectUri } = getConfig();
  if (!clientId) {
    throw new Error("STRAVA_CLIENT_ID가 비어 있습니다.");
  }

  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", "read,activity:read_all");

  return url.toString();
}

export async function saveStravaTokenFromCode(code: string) {
  const { clientId, clientSecret } = getConfig();
  if (!clientId || !clientSecret) {
    throw new Error("Strava 앱 설정이 비어 있습니다.");
  }

  const token = await exchangeToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code"
    })
  );

  await writeToken(token);
}

async function getValidAccessToken() {
  const token = await readToken();
  const { clientId, clientSecret } = getConfig();

  if (!token?.refresh_token || !clientId || !clientSecret) {
    throw new Error("Strava 연결 정보가 부족합니다.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (token.access_token && token.expires_at > now + 120) {
    return token.access_token;
  }

  const refreshed = await exchangeToken(
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token
    })
  );

  await writeToken(refreshed);
  return refreshed.access_token;
}

export async function importStravaRuns() {
  const accessToken = await getValidAccessToken();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  startDate.setHours(0, 0, 0, 0);
  const after = Math.floor(startDate.getTime() / 1000);
  const minDate = startDate.toISOString().slice(0, 10);
  const url = new URL("https://www.strava.com/api/v3/athlete/activities");
  url.searchParams.set("after", String(after));
  url.searchParams.set("per_page", "50");
  url.searchParams.set("page", "1");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Strava activities error: ${response.status} ${await response.text()}`);
  }

  const activities = (await response.json()) as Array<Record<string, unknown>>;
  const runs = activities.filter((activity) => String(activity.type) === "Run");
  await deleteRunningEntriesBefore({ source: "strava", date: minDate });
  await deleteRunningEntriesByDistance({ source: "strava", maxDistanceKm: 3 });

  let imported = 0;
  let skipped = 0;

  for (const activity of runs) {
    const externalId = String(activity.id);
    if (await hasRunningEntryByExternal("strava", externalId)) {
      skipped += 1;
      continue;
    }

    const distanceKm = Number(activity.distance ?? 0) / 1000;
    const durationMinutes = Number(activity.moving_time ?? 0) / 60;
    const avgPaceSeconds = distanceKm > 0 ? Math.round(Number(activity.moving_time ?? 0) / distanceKm) : 0;
    const startDateValue = String(activity.start_date_local ?? activity.start_date ?? "");
    const date = startDateValue.slice(0, 10);

    if (!date || distanceKm < 3 || durationMinutes <= 0 || avgPaceSeconds <= 0) {
      skipped += 1;
      continue;
    }

    await addRunningEntry({
      date,
      distanceKm: Number(distanceKm.toFixed(2)),
      durationMinutes: Number(durationMinutes.toFixed(1)),
      avgPaceSeconds,
      note: String(activity.name ?? "Strava Run"),
      source: "strava",
      externalId
    });

    imported += 1;
  }

  return { imported, skipped, totalRuns: runs.length, minDate };
}
