import { getStravaStatus } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getStravaStatus());
}
