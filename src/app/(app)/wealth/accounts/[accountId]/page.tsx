import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withoutPin } from "@/lib/wealth";
import { notFound } from "next/navigation";
import { AccountDetailClient } from "./AccountDetailClient";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { accountId } = await params;

  const [account, totalTransactions] = await Promise.all([
    prisma.wealthAccount.findFirst({
      where: { id: accountId, ownerId: session.user.id },
      include: {
        transactions: {
          orderBy: { date: "desc" },
          take: 25,
        },
      },
    }),
    prisma.wealthTransaction.count({
      where: { accountId },
    }),
  ]);

  if (!account) {
    notFound();
  }

  return (
    <AccountDetailClient
      account={JSON.parse(JSON.stringify(withoutPin(account)))}
      initialTotal={totalTransactions}
    />
  );
}
