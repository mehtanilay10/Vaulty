import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withoutPin } from "@/lib/wealth";
import { notFound } from "next/navigation";
import { AccountDetailClient } from "@/app/(app)/wealth/accounts/[accountId]/AccountDetailClient";

export default async function FamilyWealthAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { accountId } = await params;

  const account = await prisma.wealthAccount.findUnique({
    where: { id: accountId },
    include: { transactions: { orderBy: { date: "desc" }, take: 20 } },
  });

  if (!account) {
    notFound();
  }

  // Verify family access: the viewer must be a member with shareWealth from this owner.
  const membership = await prisma.familyMembership.findFirst({
    where: {
      memberId: session.user.id,
      ownerId: account.ownerId,
      shareWealth: true,
    },
  });

  if (!membership && account.ownerId !== session.user.id) {
    notFound();
  }

  const readOnly = account.ownerId !== session.user.id;

  const familyOwner = await prisma.user.findUnique({
    where: { id: account.ownerId },
    select: { id: true, name: true, email: true },
  });

  return (
    <AccountDetailClient
      account={JSON.parse(JSON.stringify(withoutPin(account)))}
      readOnly={readOnly}
      familyOwner={familyOwner}
    />
  );
}
