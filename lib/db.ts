import fs from "node:fs";
import path from "node:path";
import { DashboardSnapshot, RunningEntry, RunningSummary, WeightEntry, WatchlistItem } from "./types";

const storageDir = path.join(process.cwd(), "storage");
const dbPath = path.join(storageDir, "dashboard.sqlite");
type DbInstance = {
  pragma: (value: string) => void;
  exec: (sql: string) => void;
  prepare: (sql: string) => {
    all: (...args: unknown[]) => unknown[];
    get: (...args: unknown[]) => unknown;
    run: (...args: unknown[]) => unknown;
  };
};

declare global {
  // eslint-disable-next-line no-var
  var __personalDashboardDb__: DbInstance | undefined;
}

type WeightRow = Omit<WeightEntry, "diff">;

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

function calcRunningSummary(rows: RunningEntry[]): RunningSummary {
  if (rows.length === 0) {
    return { totalDistanceKm: 0, averagePaceSeconds: null };
  }

  const totalDistanceKm = rows.reduce((sum, row) => sum + row.distanceKm, 0);
  const totalSeconds = rows.reduce((sum, row) => sum + row.durationMinutes * 60, 0);

  return {
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    averagePaceSeconds: totalDistanceKm > 0 ? Math.round(totalSeconds / totalDistanceKm) : null
  };
}

function mapWeightRows(rows: WeightRow[]): WeightEntry[] {
  return rows.map((row) => ({
    ...row,
    diff:
      row.targetWeight !== null && row.actualWeight !== null
        ? Number((row.actualWeight - row.targetWeight).toFixed(1))
        : null
  }));
}

function ensureStorageDir() {
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }
}

function getLocalDb() {
  ensureStorageDir();
  if (!globalThis.__personalDashboardDb__) {
    // Delay loading better-sqlite3 so Supabase deployments do not depend on the local DB driver at runtime.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require("better-sqlite3") as new (filename: string, options?: { timeout?: number }) => DbInstance;
    globalThis.__personalDashboardDb__ = new BetterSqlite3(dbPath, { timeout: 5000 });
  }

  const db = globalThis.__personalDashboardDb__;
  globalThis.__personalDashboardDb__ = db;
  db.pragma("journal_mode = WAL");
  return db;
}

function initLocal() {
  const db = getLocalDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      market TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS weight_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL UNIQUE,
      target_weight REAL,
      actual_weight REAL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS running_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL,
      distance_km REAL NOT NULL,
      duration_minutes REAL NOT NULL,
      avg_pace_seconds INTEGER NOT NULL,
      note TEXT,
      source TEXT NOT NULL DEFAULT 'manual',
      external_id TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const runningColumns = db.prepare("PRAGMA table_info(running_entries)").all() as Array<{ name: string }>;
  const hasSource = runningColumns.some((column) => column.name === "source");
  const hasExternalId = runningColumns.some((column) => column.name === "external_id");

  if (!hasSource) {
    db.exec("ALTER TABLE running_entries ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'");
  }

  if (!hasExternalId) {
    db.exec("ALTER TABLE running_entries ADD COLUMN external_id TEXT");
  }

  const watchCount = db.prepare("SELECT COUNT(*) as count FROM watchlist_items").get() as { count: number };
  if (watchCount.count === 0) {
    const insert = db.prepare("INSERT INTO watchlist_items (symbol, name, market) VALUES (?, ?, ?)");
    insert.run("005930", "삼성전자", "KOSPI");
    insert.run("035420", "NAVER", "KOSPI");
    insert.run("247540", "에코프로비엠", "KOSDAQ");
  }

  const weightCount = db.prepare("SELECT COUNT(*) as count FROM weight_entries").get() as { count: number };
  if (weightCount.count === 0) {
    const insert = db.prepare(
      "INSERT INTO weight_entries (entry_date, target_weight, actual_weight) VALUES (?, ?, ?)"
    );
    const today = new Date();

    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const label = date.toISOString().slice(0, 10);
      const target = 72.5 - i * 0.05;
      const actual = target + (i % 4 === 0 ? 0.3 : i % 3 === 0 ? -0.2 : 0.1);
      insert.run(label, Number(target.toFixed(1)), Number(actual.toFixed(1)));
    }
  }

  const runCount = db.prepare("SELECT COUNT(*) as count FROM running_entries").get() as { count: number };
  if (runCount.count === 0) {
    const insert = db.prepare(
      "INSERT INTO running_entries (entry_date, distance_km, duration_minutes, avg_pace_seconds, note, source, external_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const seeds = [
      ["2026-03-08", 8.2, 47, 344, "가볍게 템포런"],
      ["2026-03-12", 5.0, 31, 372, "회복주"],
      ["2026-03-16", 10.1, 58, 345, "한강 러닝"],
      ["2026-03-22", 12.4, 72, 348, "주말 롱런"],
      ["2026-03-28", 6.5, 38, 351, "야간 러닝"],
      ["2026-04-01", 7.1, 41, 346, "월간 스타트"]
    ] as const;

    for (const seed of seeds) {
      insert.run(...seed, "manual", null);
    }
  }
}

function getLocalWatchlist(): WatchlistItem[] {
  const db = getLocalDb();
  return db
    .prepare("SELECT id, symbol, name, market FROM watchlist_items ORDER BY created_at ASC")
    .all() as WatchlistItem[];
}

function addLocalWatchlistItem(input: { symbol: string; name: string; market: string }) {
  const db = getLocalDb();
  db.prepare("INSERT INTO watchlist_items (symbol, name, market) VALUES (?, ?, ?)")
    .run(input.symbol.trim(), input.name.trim(), input.market.trim().toUpperCase());
}

function deleteLocalWatchlistItem(id: number) {
  const db = getLocalDb();
  db.prepare("DELETE FROM watchlist_items WHERE id = ?").run(id);
}

function getLocalWeights(): WeightEntry[] {
  const db = getLocalDb();
  const rows = db
    .prepare(
      `SELECT
        id,
        entry_date as date,
        target_weight as targetWeight,
        actual_weight as actualWeight
      FROM weight_entries
      ORDER BY entry_date DESC
      LIMIT 30`
    )
    .all() as WeightRow[];

  return mapWeightRows(rows);
}

function upsertLocalWeightEntry(input: { date: string; targetWeight: number | null; actualWeight: number | null }) {
  const db = getLocalDb();
  db.prepare(
    `INSERT INTO weight_entries (entry_date, target_weight, actual_weight, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(entry_date) DO UPDATE SET
       target_weight = excluded.target_weight,
       actual_weight = excluded.actual_weight,
       updated_at = CURRENT_TIMESTAMP`
  ).run(input.date, input.targetWeight, input.actualWeight);
}

function getLocalRunningEntries(): RunningEntry[] {
  const db = getLocalDb();
  return db
    .prepare(
      `SELECT
        id,
        entry_date as date,
        distance_km as distanceKm,
        duration_minutes as durationMinutes,
        avg_pace_seconds as avgPaceSeconds,
        note,
        source,
        external_id as externalId
      FROM running_entries
      ORDER BY entry_date DESC, id DESC
      LIMIT 40`
    )
    .all() as RunningEntry[];
}

function addLocalRunningEntry(input: {
  date: string;
  distanceKm: number;
  durationMinutes: number;
  avgPaceSeconds: number;
  note: string | null;
  source?: string;
  externalId?: string | null;
}) {
  const db = getLocalDb();
  db.prepare(
    `INSERT INTO running_entries (entry_date, distance_km, duration_minutes, avg_pace_seconds, note, source, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.date,
    input.distanceKm,
    input.durationMinutes,
    input.avgPaceSeconds,
    input.note,
    input.source ?? "manual",
    input.externalId ?? null
  );
}

function hasLocalRunningEntryByExternal(source: string, externalId: string) {
  const db = getLocalDb();
  const row = db
    .prepare("SELECT id FROM running_entries WHERE source = ? AND external_id = ? LIMIT 1")
    .get(source, externalId) as { id?: number } | undefined;

  return Boolean(row?.id);
}

function deleteLocalRunningEntriesBefore(input: { source: string; date: string }) {
  const db = getLocalDb();
  db.prepare("DELETE FROM running_entries WHERE source = ? AND entry_date < ?").run(input.source, input.date);
}

function deleteLocalRunningEntriesByDistance(input: { source: string; maxDistanceKm: number }) {
  const db = getLocalDb();
  db.prepare("DELETE FROM running_entries WHERE source = ? AND distance_km < ?").run(input.source, input.maxDistanceKm);
}

let localInitialized = false;

function ensureLocalInit() {
  if (!localInitialized) {
    initLocal();
    localInitialized = true;
  }
}

async function ensureSupabaseSeeds() {
  const watchlist = await supabaseRequest<WatchlistItem[]>("watchlist_items?select=id");
  if (watchlist.length === 0) {
    await supabaseRequest("watchlist_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify([
        { symbol: "005930", name: "삼성전자", market: "KOSPI" },
        { symbol: "035420", name: "NAVER", market: "KOSPI" },
        { symbol: "247540", name: "에코프로비엠", market: "KOSDAQ" }
      ])
    });
  }

  const weightRows = await supabaseRequest<Array<{ id: number }>>("weight_entries?select=id&limit=1");
  if (weightRows.length === 0) {
    const today = new Date();
    const seeds: Array<{ entry_date: string; target_weight: number; actual_weight: number }> = [];
    for (let i = 13; i >= 0; i -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - i);
      const label = date.toISOString().slice(0, 10);
      const target = 72.5 - i * 0.05;
      const actual = target + (i % 4 === 0 ? 0.3 : i % 3 === 0 ? -0.2 : 0.1);
      seeds.push({
        entry_date: label,
        target_weight: Number(target.toFixed(1)),
        actual_weight: Number(actual.toFixed(1))
      });
    }
    await supabaseRequest("weight_entries", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify(seeds)
    });
  }
}

let supabaseSeeded = false;

async function ensureSupabaseReady() {
  if (!supabaseSeeded) {
    await ensureSupabaseSeeds();
    supabaseSeeded = true;
  }
}

export async function getWatchlist(): Promise<WatchlistItem[]> {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    return supabaseRequest<WatchlistItem[]>("watchlist_items?select=id,symbol,name,market&order=created_at.asc");
  }

  ensureLocalInit();
  return getLocalWatchlist();
}

export async function addWatchlistItem(input: { symbol: string; name: string; market: string }) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    await supabaseRequest("watchlist_items", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        symbol: input.symbol.trim(),
        name: input.name.trim(),
        market: input.market.trim().toUpperCase()
      })
    });
    return;
  }

  ensureLocalInit();
  addLocalWatchlistItem(input);
}

export async function deleteWatchlistItem(id: number) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    await supabaseRequest(`watchlist_items?id=eq.${id}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return;
  }

  ensureLocalInit();
  deleteLocalWatchlistItem(id);
}

export async function getWeights(): Promise<WeightEntry[]> {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    const rows = await supabaseRequest<WeightRow[]>(
      "weight_entries?select=id,date:entry_date,targetWeight:target_weight,actualWeight:actual_weight&order=entry_date.desc&limit=30"
    );
    return mapWeightRows(rows);
  }

  ensureLocalInit();
  return getLocalWeights();
}

export async function upsertWeightEntry(input: {
  date: string;
  targetWeight: number | null;
  actualWeight: number | null;
}) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    await supabaseRequest("weight_entries?on_conflict=entry_date", {
      method: "POST",
      headers: {
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({
        entry_date: input.date,
        target_weight: input.targetWeight,
        actual_weight: input.actualWeight,
        updated_at: new Date().toISOString()
      })
    });
    return;
  }

  ensureLocalInit();
  upsertLocalWeightEntry(input);
}

export async function getRunningEntries(): Promise<RunningEntry[]> {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    return supabaseRequest<RunningEntry[]>(
      "running_entries?select=id,date:entry_date,distanceKm:distance_km,durationMinutes:duration_minutes,avgPaceSeconds:avg_pace_seconds,note,source,externalId:external_id&order=entry_date.desc,id.desc&limit=40"
    );
  }

  ensureLocalInit();
  return getLocalRunningEntries();
}

export async function addRunningEntry(input: {
  date: string;
  distanceKm: number;
  durationMinutes: number;
  avgPaceSeconds: number;
  note: string | null;
  source?: string;
  externalId?: string | null;
}) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    await supabaseRequest("running_entries", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        entry_date: input.date,
        distance_km: input.distanceKm,
        duration_minutes: input.durationMinutes,
        avg_pace_seconds: input.avgPaceSeconds,
        note: input.note,
        source: input.source ?? "manual",
        external_id: input.externalId ?? null
      })
    });
    return;
  }

  ensureLocalInit();
  addLocalRunningEntry(input);
}

export async function hasRunningEntryByExternal(source: string, externalId: string) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    const rows = await supabaseRequest<Array<{ id: number }>>(
      `running_entries?select=id&source=eq.${encodeURIComponent(source)}&external_id=eq.${encodeURIComponent(externalId)}&limit=1`
    );
    return rows.length > 0;
  }

  ensureLocalInit();
  return hasLocalRunningEntryByExternal(source, externalId);
}

export async function deleteRunningEntriesBefore(input: { source: string; date: string }) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    await supabaseRequest(
      `running_entries?source=eq.${encodeURIComponent(input.source)}&entry_date=lt.${encodeURIComponent(input.date)}`,
      {
        method: "DELETE",
        headers: { Prefer: "return=minimal" }
      }
    );
    return;
  }

  ensureLocalInit();
  deleteLocalRunningEntriesBefore(input);
}

export async function deleteRunningEntriesByDistance(input: { source: string; maxDistanceKm: number }) {
  if (isSupabaseEnabled()) {
    await ensureSupabaseReady();
    await supabaseRequest(`running_entries?source=eq.${encodeURIComponent(input.source)}&distance_km=lt.${input.maxDistanceKm}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" }
    });
    return;
  }

  ensureLocalInit();
  deleteLocalRunningEntriesByDistance(input);
}

export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const [watchlist, weights, runs] = await Promise.all([getWatchlist(), getWeights(), getRunningEntries()]);

  const today = new Date();
  const todayLabel = today.toISOString().slice(0, 10);

  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));

  const monthPrefix = todayLabel.slice(0, 7);
  const yearPrefix = todayLabel.slice(0, 4);

  const runAscending = [...runs].reverse();
  const weekRuns = runAscending.filter((run) => run.date >= weekStart.toISOString().slice(0, 10));
  const monthRuns = runAscending.filter((run) => run.date.startsWith(monthPrefix));
  const yearRuns = runAscending.filter((run) => run.date.startsWith(yearPrefix));

  return {
    watchlist,
    weights,
    runs,
    runningSummary: {
      week: calcRunningSummary(weekRuns),
      month: calcRunningSummary(monthRuns),
      year: calcRunningSummary(yearRuns)
    }
  };
}
