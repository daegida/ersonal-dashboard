import { saveStravaTokenFromCode } from "@/lib/strava";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const scope = url.searchParams.get("scope");
  const error = url.searchParams.get("error");

  if (error) {
    return Response.redirect(new URL(`/?notice=${encodeURIComponent(`Strava 연결 실패: ${error}`)}`, url.origin));
  }

  if (!code) {
    return Response.redirect(new URL(`/?notice=${encodeURIComponent("Strava 인증 코드가 없습니다.")}`, url.origin));
  }

  try {
    await saveStravaTokenFromCode(code);
    const message = scope?.includes("activity:read") ? "Strava 연결 완료" : "Strava 연결은 됐지만 활동 읽기 권한이 없습니다.";
    return Response.redirect(new URL(`/?notice=${encodeURIComponent(message)}`, url.origin));
  } catch (err) {
    return Response.redirect(new URL(`/?notice=${encodeURIComponent(`Strava 연결 실패: ${(err as Error).message}`)}`, url.origin));
  }
}
