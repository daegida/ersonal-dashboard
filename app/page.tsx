import { Dashboard } from "@/components/dashboard";
import { getDashboardSnapshot } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Page() {
  const snapshot = await getDashboardSnapshot();

  return <Dashboard initialData={snapshot} />;
}
