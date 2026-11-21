"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { PasswordCard } from "@/components/passwords/PasswordCard";
import { usePasswordVault } from "@/lib/password-context";
import { useVaultAutoUnlock } from "@/lib/use-vault-auto-unlock";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  decryptFamilyPrivateKey,
  ensureFamilyKeyPair,
  rotateFamilyKeyPair,
  unwrapVaultKeyWithPrivateKey,
} from "@/lib/family-crypto";
import type { Credential } from "@/types/credentials";
import { Building2, Globe, KeyRound, Lock, ShieldCheck, User } from "lucide-react";

interface SharedCredentialData {
  id: string;
  vaultId: string;
  name: string;
  username: string;
  url?: string | null;
  password?: string | null;
  netbankPassword?: string | null;
  atmPin?: string | null;
  upiPin?: string | null;
  mobileAppPin?: string | null;
  mobileTransactionPin?: string | null;
  isFavorite: boolean;
  icon?: string | null;
  iconColor?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FamilyCredentialGroup {
  membershipId: string;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
  } | null;
  vaultId: string | null;
  wrappedKey: string | null;
  keyVersion: number | null;
  keyUpdatedAt: string | null;
  appCredentials: SharedCredentialData[];
  bankCredentials: SharedCredentialData[];
}

type KeyState = "idle" | "locked" | "preparing" | "ready" | "error";

function ownerName(group: FamilyCredentialGroup) {
  return group.owner?.name || group.owner?.email || "Family member";
}

export function FamilyCredentialsClient({
  hasVault,
  initialGroups,
}: {
  hasVault: boolean;
  initialGroups: FamilyCredentialGroup[];
}) {
  const { isUnlocked, encryptionKey } = usePasswordVault();
  const { appUnlocked } = useVaultAutoUnlock();

  const [groups] = useState(initialGroups);
  const [ownerKeys, setOwnerKeys] = useState<Record<string, CryptoKey>>({});
  const [failedMemberships, setFailedMemberships] = useState<string[]>([]);
  const [keyState, setKeyState] = useState<KeyState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const anyWrappedKey = groups.some((group) => !!group.wrappedKey);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!hasVault) {
      setKeyState("idle");
      return;
    }

    if (!anyWrappedKey) {
      setKeyState("idle");
      return;
    }

    if (!appUnlocked) {
      setKeyState("locked");
      return;
    }

    if (!isUnlocked || !encryptionKey) {
      setKeyState("locked");
      return;
    }

    let cancelled = false;
    setKeyState("preparing");
    setErrorMessage(null);

    const prepare = async () => {
      try {
        const headers = csrfHeaders({ "Content-Type": "application/json" });
        const keyData = await ensureFamilyKeyPair(encryptionKey, headers);

        if (!keyData?.encryptedPrivateKey || !keyData.privateKeyIv) {
          throw new Error("Your family key is not available.");
        }

        let privateKey;
        try {
          privateKey = await decryptFamilyPrivateKey(
            keyData.encryptedPrivateKey,
            keyData.privateKeyIv,
            encryptionKey,
          );
        } catch {
          // The private key was encrypted with an old master password. Rotate
          // it; owners will re-wrap their keys on their next Family visit.
          const rotated = await rotateFamilyKeyPair(encryptionKey, headers);
          if (!rotated?.encryptedPrivateKey || !rotated.privateKeyIv) {
            throw new Error("Could not rotate your family key.");
          }
          privateKey = await decryptFamilyPrivateKey(
            rotated.encryptedPrivateKey,
            rotated.privateKeyIv,
            encryptionKey,
          );
        }

        const unwrapped: Record<string, CryptoKey> = {};
        const failed: string[] = [];

        for (const group of groups) {
          if (!group.wrappedKey) continue;
          try {
            unwrapped[group.membershipId] = await unwrapVaultKeyWithPrivateKey(
              group.wrappedKey,
              privateKey,
            );
          } catch (error) {
            console.error("Failed to unwrap family credential key:", error);
            failed.push(group.membershipId);
          }
        }

        if (!cancelled) {
          setOwnerKeys(unwrapped);
          setFailedMemberships(failed);
          setKeyState("ready");
        }
      } catch (error) {
        console.error("Failed to prepare family credential keys:", error);
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Could not prepare the secure credential keys.",
          );
          setKeyState("error");
        }
      }
    };

    prepare();

    return () => {
      cancelled = true;
    };
  }, [anyWrappedKey, hasVault, appUnlocked, isUnlocked, encryptionKey, groups]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return (
    <>
      <PageHeader
        eyebrow="Family shared"
        title="Credentials"
        description="Credentials shared by your family are decrypted only in your browser. The server, AI features and other users never receive plaintext passwords or keys."
        icon={<KeyRound className="h-5 w-5" />}
        actions={
          <Link
            href="/family"
            className="btn btn-secondary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
          >
            Manage family
          </Link>
        }
      />

      <div className="mt-6 space-y-4">
        {groups.length === 0 && (
          <Card>
            <EmptyState
              icon={<KeyRound className="h-6 w-6" />}
              title="No family credentials shared"
              description="When a family member shares their Credentials module, their encrypted credentials will appear here."
              action={
                <Link
                  href="/family"
                  className="btn btn-primary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
                >
                  Go to Family
                </Link>
              }
            />
          </Card>
        )}

        {groups.length > 0 && !hasVault && (
          <Alert variant="warning">
            You need your own credential vault to decrypt family-shared credentials.{" "}
            <Link href="/credentials" className="font-semibold underline">
              Set up a vault
            </Link>{" "}
            first, then return here.
          </Alert>
        )}

        {keyState === "locked" && (
          <Alert variant="info">
            Unlock your credential vault to decrypt family-shared credentials. The keys stay in
            memory only while your vault is unlocked.
          </Alert>
        )}

        {keyState === "preparing" && (
          <Card className="flex items-center justify-center gap-3 p-8 text-[13px] text-text-muted">
            <LoadingSpinner />
            Preparing end-to-end encryption keys...
          </Card>
        )}

        {keyState === "error" && (
          <Alert variant="danger">
            {errorMessage || "Could not prepare the secure credential keys."}
          </Alert>
        )}

        {groups.map((group) => {
          const ownerKey = ownerKeys[group.membershipId];
          const failed = failedMemberships.includes(group.membershipId);
          const apps: Credential[] = group.appCredentials.map((credential) => ({
            ...credential,
            type: "APP" as const,
          }));
          const banks: Credential[] = group.bankCredentials.map((credential) => ({
            ...credential,
            type: "BANK" as const,
          }));

          return (
            <section key={group.membershipId} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="info" className="gap-1">
                  <User className="h-3 w-3" />
                  Owner: {ownerName(group)}
                </Badge>
                <Badge variant="default" className="gap-1">
                  <Lock className="h-3 w-3" />
                  Read-only
                </Badge>
                {ownerKey && (
                  <Badge variant="success" className="gap-1">
                    <ShieldCheck className="h-3 w-3" />
                    Decrypted locally
                  </Badge>
                )}
              </div>

              {!group.wrappedKey && (
                <Alert variant="warning">
                  {ownerName(group)} has not finished sharing the secure credential key yet. Ask
                  them to open the Family page while their vault is unlocked.
                </Alert>
              )}

              {group.wrappedKey && !ownerKey && keyState !== "preparing" && (
                <Alert variant={failed ? "danger" : "info"}>
                  {failed
                    ? "This credential key could not be decrypted. The owner may need to refresh sharing from their Family page."
                    : "Waiting for the secure credential key. Unlock your vault and refresh this page."}
                </Alert>
              )}

              {ownerKey && (
                <div className="space-y-4">
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
                      <Globe className="h-3.5 w-3.5" />
                      App credentials
                      <Badge variant="default">{apps.length}</Badge>
                    </div>
                    {apps.length === 0 ? (
                      <Card className="p-4 text-[12px] text-text-muted">
                        No app credentials shared.
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {apps.map((credential) => (
                          <PasswordCard
                            key={credential.id}
                            credential={credential}
                            type="APP"
                            encryptionKey={ownerKey}
                            readOnly
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-text-secondary">
                      <Building2 className="h-3.5 w-3.5" />
                      Bank credentials
                      <Badge variant="default">{banks.length}</Badge>
                    </div>
                    {banks.length === 0 ? (
                      <Card className="p-4 text-[12px] text-text-muted">
                        No bank credentials shared.
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 gap-3">
                        {banks.map((credential) => (
                          <PasswordCard
                            key={credential.id}
                            credential={credential}
                            type="BANK"
                            encryptionKey={ownerKey}
                            readOnly
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
