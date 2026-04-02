import { getTodayCalendar } from "@/lib/calendar";

export const dynamic = "force-dynamic";

export async function GET() {
  const calendar = await getTodayCalendar();
  return Response.json(calendar);
}
