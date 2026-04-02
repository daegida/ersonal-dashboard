import { getWeights, upsertWeightEntry } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ weights: await getWeights() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const date = String(body.date || "");
  const targetWeight = body.targetWeight === "" || body.targetWeight === null ? null : Number(body.targetWeight);
  const actualWeight = body.actualWeight === "" || body.actualWeight === null ? null : Number(body.actualWeight);

  if (!date) {
    return Response.json({ ok: false, message: "날짜를 입력해 주세요." }, { status: 400 });
  }

  if (targetWeight === null && actualWeight === null) {
    return Response.json({ ok: false, message: "계획 또는 실적 몸무게 중 하나는 입력해 주세요." }, { status: 400 });
  }

  await upsertWeightEntry({
    date,
    targetWeight,
    actualWeight
  });

  return Response.json({ ok: true, weights: await getWeights() });
}
