import { getWeather } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET() {
  const weather = await getWeather();
  return Response.json(weather);
}
