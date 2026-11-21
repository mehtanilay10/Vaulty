import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withoutPin } from "@/lib/wealth";
import { StatementImportClient } from "./StatementImportClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export default async function StatementImportPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const accounts = await prisma.wealthAccount.findMany({
    where: { ownerId: session.user.id },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Wealth", href: "/wealth" },
          { label: "Import statement" },
        ]}
      />
      <StatementImportClient accounts={JSON.parse(JSON.stringify(accounts.map(withoutPin)))} />
    </>
  );
}
