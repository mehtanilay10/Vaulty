import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { calculateWealthSummary, withoutPin } from "@/lib/wealth";
import { WealthClient } from "./WealthClient";

export default async function WealthPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await prisma.wealthAccount.findMany({
    where: { ownerId: session.user.id },
    include: {
      _count: { select: { transactions: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  const activeAccounts = accounts.filter((account) => account.status === "ACTIVE");
  const { summary, breakdown, currency } = calculateWealthSummary(activeAccounts);

  return (
    <>
      <WealthClient
        summary={{ ...summary, currency }}
        breakdown={breakdown}
        accounts={JSON.parse(JSON.stringify(accounts.map(withoutPin)))}
      />
    </>
  );
}
