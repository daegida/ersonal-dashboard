import { addWatchlistItem, deleteWatchlistItem, getWatchlist } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ watchlist: await getWatchlist() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const symbol = String(body.symbol || "").trim();
  const name = String(body.name || "").trim();
  const market = String(body.market || "KOSPI").trim();

  if (!symbol || !name) {
    return Response.json({ ok: false, message: "종목코드와 종목명을 입력해 주세요." }, { status: 400 });
  }

  try {
    await addWatchlistItem({ symbol, name, market });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        message: (error as Error).message.includes("UNIQUE")
          ? "이미 추가된 종목입니다."
          : "관심종목 저장 중 오류가 발생했습니다."
      },
      { status: 400 }
    );
  }

  return Response.json({ ok: true, watchlist: await getWatchlist() });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));

  if (!id) {
    return Response.json({ ok: false, message: "삭제할 항목 ID가 필요합니다." }, { status: 400 });
  }

  await deleteWatchlistItem(id);
  return Response.json({ ok: true, watchlist: await getWatchlist() });
}
