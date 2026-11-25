import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TransactionsClient } from "./TransactionsClient";

export default async function WealthTransactionsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const transactions = await prisma.wealthTransaction.findMany({
    where: {
      account: { ownerId: session.user.id },
    },
    include: {
      account: {
        select: {
          id: true,
          name: true,
          type: true,
        },
      },
    },
    orderBy: { date: "desc" },
    take: 200,
  });

  return (
    <>
      <TransactionsClient transactions={JSON.parse(JSON.stringify(transactions))} />
    </>
  );
}
