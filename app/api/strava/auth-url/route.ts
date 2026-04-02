import { getStravaAuthorizeUrl } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ ok: true, url: getStravaAuthorizeUrl() });
  } catch (error) {
    return Response.json({ ok: false, message: (error as Error).message }, { status: 400 });
  }
}
