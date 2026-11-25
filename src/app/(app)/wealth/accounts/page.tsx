import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withoutPin } from "@/lib/wealth";
import { AccountsClient } from "./AccountsClient";

export default async function AccountsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await prisma.wealthAccount.findMany({
    where: { ownerId: session.user.id },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <>
      <Suspense fallback={null}>
        <AccountsClient accounts={JSON.parse(JSON.stringify(accounts.map(withoutPin)))} />
      </Suspense>
    </>
  );
}
