import { getMarketOverview } from "@/lib/market";

export const dynamic = "force-dynamic";

export async function GET() {
  const market = await getMarketOverview();
  return Response.json(market);
}
