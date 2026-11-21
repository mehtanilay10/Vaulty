"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Blade } from "@/components/ui/Blade";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Eye, EyeOff, KeyRound, Mail, ShieldCheck, HelpCircle } from "lucide-react";
import { deriveKey, generateSalt, validateMasterPassword } from "@/lib/crypto";
import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/constants";
import {
  encryptEnvelopeWithKey,
  decryptEnvelopeWithKey,
  isEnvelopeEncryption,
  type EncryptionEnvelope,
} from "@/lib/envelope-crypto";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { usePasswordVault } from "@/lib/password-context";
import {
  getStoredPinHash,
  wrapCryptoKey,
  storeWrappedVaultKey,
  clearWrappedVaultKey,
} from "@/lib/key-wrap";
import { RecoverySetupModal } from "@/components/passwords/RecoverySetupModal";
import type { Credential } from "@/types/credentials";

const APP_FIELDS = ["name", "url", "username", "password"] as const;
const BANK_FIELDS = [
  "name",
  "username",
  "netbankPassword",
  "atmPin",
  "upiPin",
  "mobileAppPin",
  "mobileTransactionPin",
] as const;

async function reencryptField(
  value: unknown,
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newSalt?: string,
): Promise<string | null> {
  if (typeof value !== "string" || value.length === 0) return null;

  if (isEnvelopeEncryption(value)) {
    const parsed = JSON.parse(value) as EncryptionEnvelope;
    const plaintext = await decryptEnvelopeWithKey(parsed, oldKey);
    const envelope = await encryptEnvelopeWithKey(plaintext, newKey, newSalt);
    return JSON.stringify(envelope);
  }

  return null;
}

async function buildPayload(
  credentials: Credential[],
  fields: readonly string[],
  oldKey: CryptoKey,
  newKey: CryptoKey,
  newSalt?: string,
) {
  return Promise.all(
    credentials.map(async (credential) => {
      const record = credential as unknown as Record<string, unknown>;
      const payload: Record<string, unknown> = {
        id: credential.id,
        icon: credential.icon ?? null,
        iconColor: credential.iconColor ?? null,
      };

      for (const field of fields) {
        payload[field] = await reencryptField(record[field], oldKey, newKey, newSalt);
      }

      return payload;
    }),
  );
}

export function MasterPasswordManager({ hasVault }: { hasVault: boolean }) {
  const { confirmAction } = useFeedback();
  const { encryptionKey, unlockVault } = usePasswordVault();

  const [isOpen, setIsOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSendingReset, setIsSendingReset] = useState(false);

  // Recovery setup state
  const [hasRecoverySetup, setHasRecoverySetup] = useState<boolean | null>(null);
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const [isUnlockForRecoveryOpen, setIsUnlockForRecoveryOpen] = useState(false);
  const [recoveryUnlockPassword, setRecoveryUnlockPassword] = useState("");
  const [showRecoveryUnlockPassword, setShowRecoveryUnlockPassword] = useState(false);
  const [recoveryDerivedKey, setRecoveryDerivedKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    if (!hasVault) return;
    fetch("/api/passwords/recovery/verify")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.hasRecoverySetup === "boolean") {
          setHasRecoverySetup(data.hasRecoverySetup);
        }
      })
      .catch(() => {});
  }, [hasVault]);

  const resetForm = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setShowCurrent(false);
    setShowNew(false);
    setError("");
  };

  const closeModal = () => {
    if (isSubmitting) return;
    setIsOpen(false);
    resetForm();
  };

  const handleOpenRecovery = () => {
    setError("");
    setStatus("");
    if (encryptionKey) {
      setRecoveryDerivedKey(encryptionKey);
      setIsRecoveryModalOpen(true);
    } else {
      setRecoveryUnlockPassword("");
      setIsUnlockForRecoveryOpen(true);
    }
  };

  const handleUnlockForRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryUnlockPassword) return;
    setIsSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/passwords/unlock", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ masterPassword: recoveryUnlockPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Incorrect master password.");
      }

      const key = await deriveKey(
        recoveryUnlockPassword,
        data.encryptionSalt,
        data.kdfIterations || CURRENT_PBKDF2_ITERATIONS,
      );
      unlockVault(key, data.encryptionSalt, recoveryUnlockPassword);
      setRecoveryDerivedKey(key);
      setIsUnlockForRecoveryOpen(false);
      setRecoveryUnlockPassword("");
      setIsRecoveryModalOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock vault.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setStatus("");

    const validation = validateMasterPassword(newPassword);
    if (!validation.isValid) {
      setError(validation.errors.join(". "));
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New master passwords do not match.");
      return;
    }

    if (newPassword === currentPassword) {
      setError("New master password must be different from the current one.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Verify current password and get salt
      const unlockRes = await fetch("/api/passwords/unlock", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ masterPassword: currentPassword }),
      });

      if (!unlockRes.ok) {
        const data = await unlockRes.json().catch(() => ({}));
        throw new Error(data.error || "Current master password is incorrect.");
      }

      const unlockData = await unlockRes.json();
      const currentSalt = unlockData.encryptionSalt;
      const currentIterations = unlockData.kdfIterations || CURRENT_PBKDF2_ITERATIONS;

      const oldKey = await deriveKey(currentPassword, currentSalt, currentIterations);
      const newSalt = await generateSalt();
      const newKey = await deriveKey(newPassword, newSalt, CURRENT_PBKDF2_ITERATIONS);

      const [appRes, bankRes] = await Promise.all([
        fetch("/api/passwords/app"),
        fetch("/api/passwords/bank"),
      ]);

      if (!appRes.ok || !bankRes.ok) {
        throw new Error("Failed to load existing credentials for re-encryption.");
      }

      const appData = await appRes.json();
      const bankData = await bankRes.json();
      const appCredentials = (appData.credentials || []) as Credential[];
      const bankCredentials = (bankData.credentials || []) as Credential[];

      const reencryptedApps = await buildPayload(
        appCredentials,
        APP_FIELDS,
        oldKey,
        newKey,
        newSalt,
      );
      const reencryptedBanks = await buildPayload(
        bankCredentials,
        BANK_FIELDS,
        oldKey,
        newKey,
        newSalt,
      );

      const changeRes = await fetch("/api/passwords/change-master-password", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          currentMasterPassword: currentPassword,
          newMasterPassword: newPassword,
          newEncryptionSalt: newSalt,
          appCredentials: reencryptedApps,
          bankCredentials: reencryptedBanks,
        }),
      });

      if (!changeRes.ok) {
        const data = await changeRes.json().catch(() => ({}));
        throw new Error(data.error || "Failed to change master password.");
      }

      unlockVault(newKey, newSalt, newPassword);
      setHasRecoverySetup(false);

      // Wrap newly derived key with user's PIN if configured and sync to server
      const pinHash = getStoredPinHash();
      if (pinHash) {
        try {
          const wrapped = await wrapCryptoKey(pinHash, newKey);
          storeWrappedVaultKey(wrapped);
          await fetch("/api/user/app-lock", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ wrappedKey: wrapped }),
          }).catch(() => {});
        } catch (wrapErr) {
          console.error("Failed to wrap vault key after master password change:", wrapErr);
        }
      } else {
        clearWrappedVaultKey();
      }

      setStatus(
        "Master password changed and all credentials re-encrypted successfully. Since your master password changed, please set up recovery again with your new master password.",
      );
      closeModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change master password.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestReset = async () => {
    if (
      !(await confirmAction({
        title: "Request a master-password reset?",
        description:
          "If this vault contains encrypted credentials, you will be prompted to provide your offline recovery key and security questions to safely re-encrypt your saved data with your new master password.",
        confirmLabel: "Send reset link",
      }))
    )
      return;

    setIsSendingReset(true);
    setStatus("");
    setError("");

    try {
      const res = await fetch("/api/passwords/reset/request", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to send reset email.");
      }

      setStatus("Password reset email sent. Check your inbox for instructions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to request password reset.");
    } finally {
      setIsSendingReset(false);
    }
  };

  if (!hasVault) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[13px] font-semibold text-text-primary">No credential vault yet</p>
          <p className="mt-0.5 text-xs text-text-muted">
            Create a credential vault to start storing logins securely with client-side encryption.
          </p>
        </div>
        <Link href="/credentials">
          <Button size="sm" className="shrink-0">
            <KeyRound className="h-4 w-4" />
            Set up vault
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {status && (
        <Alert variant="success">
          <ShieldCheck className="h-4 w-4 shrink-0" />
          <span className="text-xs">{status}</span>
        </Alert>
      )}

      {error && !isOpen && !isUnlockForRecoveryOpen && (
        <Alert variant="danger">
          <span className="text-xs">{error}</span>
        </Alert>
      )}

      {/* 1. Master Password Change */}
      <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-text-primary">Vault encryption key</p>
          <p className="mt-0.5 max-w-lg text-xs text-text-muted">
            Changing your master password re-encrypts every app and bank credential. Anyone you
            shared the vault with will need the new password.
          </p>
        </div>
        <Button
          className="shrink-0"
          onClick={() => {
            setError("");
            setStatus("");
            setIsOpen(true);
          }}
        >
          <KeyRound className="h-4 w-4" />
          Change password
        </Button>
      </div>

      {/* 2. Security Questions & Recovery Key */}
      <div className="flex flex-col gap-4 rounded-lg border border-border-subtle bg-surface-muted p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold text-text-primary">
              Security questions & recovery key
            </p>
            {hasRecoverySetup !== null && (
              <Badge variant={hasRecoverySetup ? "success" : "warning"}>
                {hasRecoverySetup ? "Configured" : "Not configured"}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 max-w-lg text-xs text-text-muted">
            Configure your 64-character offline recovery key and 3 security questions. If you ever
            forget your master password, they allow you to recover and re-encrypt your saved
            credentials without losing any data.
          </p>
        </div>
        <Button
          variant={hasRecoverySetup ? "secondary" : "primary"}
          className="shrink-0"
          onClick={handleOpenRecovery}
        >
          <HelpCircle className="h-4 w-4" />
          {hasRecoverySetup ? "Update recovery" : "Set up recovery"}
        </Button>
      </div>

      {/* 3. Email Reset Link */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between pt-1">
        <p className="text-[11px] leading-relaxed text-text-muted">
          Forgot your master password? A reset link can be emailed to begin recovery.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={handleRequestReset}
          disabled={isSendingReset}
        >
          <Mail className="h-3.5 w-3.5" />
          {isSendingReset ? "Sending..." : "Email reset link"}
        </Button>
      </div>

      {/* Change Password Blade */}
      <Blade
        open={isOpen}
        onClose={closeModal}
        title="Change master password"
        description="Verify your current password, then choose a new one."
        icon={<KeyRound className="h-5 w-5" />}
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" form="change-master-password-form" disabled={isSubmitting}>
              {isSubmitting ? "Re-encrypting..." : "Change password"}
            </Button>
          </>
        }
      >
        <form
          id="change-master-password-form"
          onSubmit={handleChangePassword}
          className="space-y-4"
        >
          <Alert variant="info">
            <p className="text-xs">
              Your credentials are decrypted locally and re-encrypted with the new key before
              anything is saved.
            </p>
          </Alert>

          <div className="space-y-2">
            <Label htmlFor="currentMasterPassword">Current master password</Label>
            <div className="relative">
              <Input
                id="currentMasterPassword"
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your current master password"
                className="pr-10"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="newMasterPassword">New master password</Label>
            <div className="relative">
              <Input
                id="newMasterPassword"
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Create a strong master password"
                className="pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                aria-label={showNew ? "Hide password" : "Show password"}
              >
                {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-text-muted">
              Minimum 8 characters with uppercase, lowercase, number, and special character.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmMasterPassword">Confirm new master password</Label>
            <Input
              id="confirmMasterPassword"
              type={showNew ? "text" : "password"}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your new master password"
              required
            />
          </div>

          {error && (
            <Alert variant="danger">
              <p className="text-xs">{error}</p>
            </Alert>
          )}
        </form>
      </Blade>

      {/* Unlock Dialog for Recovery Setup (when vault is locked) */}
      <Modal
        open={isUnlockForRecoveryOpen}
        onClose={() => setIsUnlockForRecoveryOpen(false)}
        title="Unlock Vault for Recovery Setup"
      >
        <form onSubmit={handleUnlockForRecovery} className="space-y-4">
          <p className="text-xs text-text-muted">
            Enter your master password to unlock your encryption key and configure your offline
            recovery key and security questions.
          </p>

          <div className="space-y-2">
            <Label htmlFor="recoveryUnlockPassword">Master Password</Label>
            <div className="relative">
              <Input
                id="recoveryUnlockPassword"
                type={showRecoveryUnlockPassword ? "text" : "password"}
                value={recoveryUnlockPassword}
                onChange={(e) => setRecoveryUnlockPassword(e.target.value)}
                placeholder="Enter your master password"
                className="pr-10"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowRecoveryUnlockPassword(!showRecoveryUnlockPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
              >
                {showRecoveryUnlockPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <Alert variant="danger">
              <p className="text-xs">{error}</p>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setIsUnlockForRecoveryOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Unlocking..." : "Unlock & Continue"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Recovery Setup Modal */}
      {recoveryDerivedKey && (
        <RecoverySetupModal
          isOpen={isRecoveryModalOpen}
          onClose={() => setIsRecoveryModalOpen(false)}
          encryptionKey={recoveryDerivedKey}
          onComplete={() => {
            setHasRecoverySetup(true);
            setStatus("Recovery key and security questions updated successfully.");
            setIsRecoveryModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
