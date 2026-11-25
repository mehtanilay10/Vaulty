import { Suspense } from "react";
import { auth } from "@/auth";
import { getUserVaultData } from "@/lib/credentials-data";
import { PasswordsClient } from "@/components/passwords/PasswordsClient";

export const metadata = {
  title: "Credentials Dashboard | Vaulty",
  description: "Secure, client-side encrypted credentials and password manager.",
};

export default async function CredentialsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const data = await getUserVaultData(session.user.id);

  return (
    <>
      <Suspense fallback={null}>
        <PasswordsClient
          hasVault={data.hasVault}
          hasRecoverySetup={data.hasRecoverySetup}
          initialAppCredentials={data.appCredentials}
          initialBankCredentials={data.bankCredentials}
          mode="dashboard"
        />
      </Suspense>
    </>
  );
}
