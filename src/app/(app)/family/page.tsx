import { auth } from "@/auth";
import { getFamilyOverview } from "@/lib/family-service";
import { FamilyClient } from "@/components/family/FamilyClient";
import { FamilyErrorBoundary } from "@/components/family/FamilyErrorBoundary";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default async function FamilyPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const overview = await getFamilyOverview(session.user.id);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Family" }]} />
      <FamilyErrorBoundary>
        <FamilyClient overview={overview} />
      </FamilyErrorBoundary>
    </>
  );
}
