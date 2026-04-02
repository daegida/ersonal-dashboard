import { addRunningEntry, getDashboardSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await getDashboardSnapshot();
  return Response.json({ runs: snapshot.runs, runningSummary: snapshot.runningSummary });
}

export async function POST(request: Request) {
  const body = await request.json();
  const date = String(body.date || "");
  const distanceKm = Number(body.distanceKm);
  const durationMinutes = Number(body.durationMinutes);
  const avgPaceSeconds =
    body.avgPaceSeconds !== undefined && body.avgPaceSeconds !== null && body.avgPaceSeconds !== ""
      ? Number(body.avgPaceSeconds)
      : Math.round((durationMinutes * 60) / distanceKm);

  if (!date || !Number.isFinite(distanceKm) || !Number.isFinite(durationMinutes) || distanceKm <= 0 || durationMinutes <= 0) {
    return Response.json(
      { ok: false, message: "날짜, 거리, 시간을 올바르게 입력해 주세요." },
      { status: 400 }
    );
  }

  await addRunningEntry({
    date,
    distanceKm,
    durationMinutes,
    avgPaceSeconds,
    note: body.note ? String(body.note) : null
  });

  const snapshot = await getDashboardSnapshot();
  return Response.json({ ok: true, runs: snapshot.runs, runningSummary: snapshot.runningSummary });
}
