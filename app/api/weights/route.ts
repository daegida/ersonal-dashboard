import { getWeights, upsertWeightEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ weights: await getWeights() });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const rawDate = String(body.date || "").trim();
    const date = rawDate.replace(/\.\s*/g, "-").replace(/-$/, "");
    const targetWeight =
      body.targetWeight === "" || body.targetWeight === null || body.targetWeight === undefined
        ? null
        : Number(body.targetWeight);
    const actualWeight =
      body.actualWeight === "" || body.actualWeight === null || body.actualWeight === undefined
        ? null
        : Number(body.actualWeight);

    if (!date) {
      return Response.json({ ok: false, message: "날짜를 입력해 주세요." }, { status: 400 });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return Response.json({ ok: false, message: "날짜 형식이 올바르지 않습니다." }, { status: 400 });
    }

    if (targetWeight !== null && !Number.isFinite(targetWeight)) {
      return Response.json({ ok: false, message: "계획 몸무게를 숫자로 입력해 주세요." }, { status: 400 });
    }

    if (actualWeight !== null && !Number.isFinite(actualWeight)) {
      return Response.json({ ok: false, message: "실적 몸무게를 숫자로 입력해 주세요." }, { status: 400 });
    }

    if (targetWeight === null && actualWeight === null) {
      return Response.json({ ok: false, message: "계획 또는 실적 몸무게 중 하나는 입력해 주세요." }, { status: 400 });
    }

    await upsertWeightEntry({
      date,
      targetWeight,
      actualWeight
    });

    return Response.json({ ok: true, message: "몸무게 기록을 저장했습니다.", weights: await getWeights() });
  } catch (error) {
    return Response.json(
      { ok: false, message: `몸무게 저장 중 오류가 발생했습니다. ${(error as Error).message}` },
      { status: 500 }
    );
  }
}
