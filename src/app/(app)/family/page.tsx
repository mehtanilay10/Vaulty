import { auth } from "@/auth";
import { getFamilyOverview } from "@/lib/family-service";
import { FamilyClient } from "@/components/family/FamilyClient";
import { FamilyErrorBoundary } from "@/components/family/FamilyErrorBoundary";

export default async function FamilyPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const overview = await getFamilyOverview(session.user.id);

  return (
    <>
      <FamilyErrorBoundary>
        <FamilyClient overview={overview} />
      </FamilyErrorBoundary>
    </>
  );
}
