import { getDashboardSnapshot } from "@/lib/db";
import { importStravaRuns } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await importStravaRuns();
    const snapshot = await getDashboardSnapshot();
    return Response.json({
      ok: true,
      message: `Strava 러닝 ${result.imported}개를 가져왔고 ${result.skipped}개는 건너뛰었습니다.`,
      result,
      runs: snapshot.runs,
      runningSummary: snapshot.runningSummary
    });
  } catch (error) {
    return Response.json({ ok: false, message: (error as Error).message }, { status: 400 });
  }
}
