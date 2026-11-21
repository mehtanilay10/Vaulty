import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { TransactionsClient } from "./TransactionsClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

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
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Wealth", href: "/wealth" },
          { label: "Transactions" },
        ]}
      />
      <TransactionsClient transactions={JSON.parse(JSON.stringify(transactions))} />
    </>
  );
}
