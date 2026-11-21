import { prisma } from "@/lib/prisma";
import type { Credential } from "@/types/credentials";

export async function getUserVaultData(userId: string) {
  const vault = await prisma.passwordVault.findUnique({
    where: { userId },
    include: {
      appCredentials: { orderBy: { createdAt: "desc" } },
      bankCredentials: { orderBy: { createdAt: "desc" } },
    },
  });

  const appCredentials: Credential[] =
    vault?.isConfigured && vault.appCredentials
      ? JSON.parse(JSON.stringify(vault.appCredentials))
      : [];
  const bankCredentials: Credential[] =
    vault?.isConfigured && vault.bankCredentials
      ? JSON.parse(JSON.stringify(vault.bankCredentials))
      : [];

  return {
    hasVault: Boolean(vault?.isConfigured),
    hasRecoverySetup: Boolean(vault?.recoveryKeyHash && vault?.recoveryEncryptedKEK),
    appCredentials,
    bankCredentials,
  };
}
