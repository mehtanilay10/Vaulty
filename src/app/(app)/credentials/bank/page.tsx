import { Suspense } from "react";
import { auth } from "@/auth";
import { getUserVaultData } from "@/lib/credentials-data";
import { PasswordsClient } from "@/components/passwords/PasswordsClient";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";

export const metadata = {
  title: "Bank Credentials | Vaulty",
  description: "Stored bank netbanking portals and customer accounts.",
};

export default async function BankCredentialsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getUserVaultData(session.user.id);

  return (
    <>
      <Breadcrumbs
        items={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Credentials", href: "/credentials" },
          { label: "Bank Credentials" },
        ]}
      />
      <Suspense fallback={null}>
        <PasswordsClient
          hasVault={data.hasVault}
          hasRecoverySetup={data.hasRecoverySetup}
          initialAppCredentials={data.appCredentials}
          initialBankCredentials={data.bankCredentials}
          mode="bank"
        />
      </Suspense>
    </>
  );
}
