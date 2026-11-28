"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton, CommandBarDivider } from "@/components/ui/CommandBar";
import { Button } from "@/components/ui/Button";
import { Tabs, Tab } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { Select } from "@/components/ui/Select";
import dynamic from "next/dynamic";
import { PasswordCard } from "@/components/passwords/PasswordCard";

const VaultSetupModal = dynamic(
  () => import("@/components/passwords/VaultSetupModal").then((mod) => mod.VaultSetupModal),
  { ssr: false },
);
const PasswordForm = dynamic(
  () => import("@/components/passwords/PasswordForm").then((mod) => mod.PasswordForm),
  { ssr: false },
);
const RecoverySetupModal = dynamic(
  () => import("@/components/passwords/RecoverySetupModal").then((mod) => mod.RecoverySetupModal),
  { ssr: false },
);
import { AuthenticatorCard } from "@/components/passwords/AuthenticatorCard";
import { QRScannerModal, type Scanned2FAAccount } from "@/components/passwords/QRScannerModal";
import { encryptEnvelopeWithKey } from "@/lib/envelope-crypto";
import {
  Lock,
  Plus,
  Globe,
  Star,
  Search,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  Camera,
} from "lucide-react";
import { usePasswordVault } from "@/lib/password-context";
import { useAppLock } from "@/components/app-lock/AppLockProvider";
import { deriveKey } from "@/lib/crypto";
import { decryptEnvelopeWithKey, isEnvelopeEncryption } from "@/lib/envelope-crypto";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import { Credential } from "@/types/credentials";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import {
  getStoredPinHash,
  wrapCryptoKey,
  unwrapCryptoKey,
  getStoredWrappedVaultKey,
  storeWrappedVaultKey,
  hashPin,
} from "@/lib/key-wrap";

interface PasswordsClientProps {
  hasVault: boolean;
  hasRecoverySetup?: boolean;
  initialAppCredentials: Credential[];
  initialBankCredentials: Credential[];
  mode?: "dashboard" | "account" | "bank" | "authenticator";
}

interface SearchMetadata {
  name: string;
  username: string;
  url: string;
}

export function PasswordsClient({
  hasVault: initialHasVault,
  hasRecoverySetup: initialHasRecoverySetup = false,
  initialAppCredentials,
  initialBankCredentials,
  mode = "dashboard",
}: PasswordsClientProps) {
  const { isUnlocked: vaultUnlocked, encryptionKey, unlockVault, vaultSalt } = usePasswordVault();

  const {
    status: appLockStatus,
    enabled: appLockEnabled,
    lock: lockApp,
    hasPin: appLockHasPin,
  } = useAppLock();
  const { toast, confirmAction } = useFeedback();

  const appUnlocked = appLockStatus === "unlocked" || !appLockEnabled;

  const [hasVault, setHasVault] = useState(initialHasVault);
  const [hasRecoverySetup, setHasRecoverySetup] = useState(initialHasRecoverySetup);

  const [appCredentials, setAppCredentials] = useState<Credential[]>(initialAppCredentials);
  const [bankCredentials, setBankCredentials] = useState<Credential[]>(initialBankCredentials);
  const [decryptedMetadata, setDecryptedMetadata] = useState<Record<string, SearchMetadata>>({});
  const [isSetupModalOpen, setIsSetupModalOpen] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formType, setFormType] = useState<"APP" | "BANK">(mode === "bank" ? "BANK" : "APP");
  const [editingCredential, setEditingCredential] = useState<Credential | null>(null);
  const [currentTab, setCurrentTab] = useState<"account" | "bank" | "authenticator">(
    mode === "bank" ? "bank" : mode === "authenticator" ? "authenticator" : "account",
  );
  const [activeTab, setActiveTab] = useState<"APP" | "BANK">(mode === "bank" ? "BANK" : "APP");
  const [isQRScannerOpen, setIsQRScannerOpen] = useState(false);
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "accessed">("recent");
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Authenticator accounts (credentials with totpSecret)
  const authenticatorCredentials = useMemo(() => {
    return appCredentials.filter((c) =>
      Boolean((c as unknown as { totpSecret?: string | null }).totpSecret),
    );
  }, [appCredentials]);

  // Inline unlock state when vault key is not in memory
  const [unlockMethod, setUnlockMethod] = useState<"pin" | "master">("pin");
  const [inlinePin, setInlinePin] = useState("");
  const [inlinePassword, setInlinePassword] = useState("");
  const [showInlinePassword, setShowInlinePassword] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [isInlineUnlocking, setIsInlineUnlocking] = useState(false);
  const [isAutoUnlocking, setIsAutoUnlocking] = useState(false);

  const refreshCredentials = useCallback(async () => {
    if (!vaultUnlocked) return;

    try {
      const [appRes, bankRes] = await Promise.all([
        fetch("/api/passwords/app"),
        fetch("/api/passwords/bank"),
      ]);

      if (appRes.ok) {
        const appData = await appRes.json();
        setAppCredentials(appData.credentials || []);
      }

      if (bankRes.ok) {
        const bankData = await bankRes.json();
        setBankCredentials(bankData.credentials || []);
      }
    } catch (error) {
      console.error("Error refreshing credentials:", error);
    }
  }, [vaultUnlocked]);

  // Auto-unlock vault if the user is already authenticated/unlocked in this session
  useEffect(() => {
    if (vaultUnlocked || !appUnlocked) return;
    const pinHash = getStoredPinHash();
    let wrapped = getStoredWrappedVaultKey();

    const tryAutoUnlock = async () => {
      setIsAutoUnlocking(true);
      try {
        if (!wrapped) {
          try {
            const res = await fetch("/api/user/app-lock");
            if (res.ok) {
              const data = await res.json();
              if (data?.wrappedKey) {
                wrapped = data.wrappedKey;
                storeWrappedVaultKey(data.wrappedKey);
              }
            }
          } catch {}
        }

        if (pinHash && wrapped) {
          const key = await unwrapCryptoKey(pinHash, wrapped);
          unlockVault(key, "", "");
          setTimeout(async () => {
            await refreshCredentials();
          }, 50);
          return;
        }
      } catch (err) {
        console.warn("Vault auto-unlock attempted but requires explicit entry:", err);
      } finally {
        setIsAutoUnlocking(false);
      }
    };

    tryAutoUnlock();
  }, [vaultUnlocked, appUnlocked, unlockVault, refreshCredentials]);

  const searchParams = useSearchParams();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode === "bank") {
      setCurrentTab("bank");
      setActiveTab("BANK");
      setFormType("BANK");
    } else if (mode === "authenticator") {
      setCurrentTab("authenticator");
    } else {
      setCurrentTab("account");
      setActiveTab("APP");
      setFormType("APP");
    }
  }, [mode]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "BANK" || tabParam === "bank") {
      setCurrentTab("bank");
      setActiveTab("BANK");
      setFormType("BANK");
    } else if (tabParam === "AUTH" || tabParam === "authenticator") {
      setCurrentTab("authenticator");
    } else if (tabParam === "APP" || tabParam === "account" || tabParam === "app") {
      setCurrentTab("account");
      setActiveTab("APP");
      setFormType("APP");
    }
    const action = searchParams.get("action");
    if (action === "new") {
      if (tabParam === "AUTH" || tabParam === "authenticator" || mode === "authenticator") {
        setCurrentTab("authenticator");
        setIsQRScannerOpen(true);
      } else {
        const targetType = tabParam === "BANK" || mode === "bank" ? "BANK" : "APP";
        setCurrentTab(targetType === "BANK" ? "bank" : "account");
        setActiveTab(targetType);
        setFormType(targetType);
        setEditingCredential(null);
        setIsFormOpen(true);
      }
    }
  }, [searchParams, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Decrypt credential metadata (name, username, url) in memory for search, display, and sorting.
  useEffect(() => {
    if (!vaultUnlocked || !encryptionKey) return;

    const initialize = async () => {
      const meta: Record<string, SearchMetadata> = {};
      for (const cred of [...appCredentials, ...bankCredentials]) {
        try {
          const item: SearchMetadata = { name: "", username: "", url: "" };

          if (cred.name) {
            if (isEnvelopeEncryption(cred.name)) {
              item.name = await decryptEnvelopeWithKey(JSON.parse(cred.name), encryptionKey);
            } else {
              item.name = cred.name;
            }
          }

          if (cred.username) {
            if (isEnvelopeEncryption(cred.username)) {
              item.username = await decryptEnvelopeWithKey(
                JSON.parse(cred.username),
                encryptionKey,
              );
            } else {
              item.username = cred.username;
            }
          }

          if (cred.url) {
            if (isEnvelopeEncryption(cred.url)) {
              item.url = await decryptEnvelopeWithKey(JSON.parse(cred.url), encryptionKey);
            } else {
              item.url = cred.url;
            }
          }

          meta[cred.id] = item;
        } catch {
          meta[cred.id] = { name: "", username: "", url: "" };
        }
      }
      setDecryptedMetadata(meta);
    };

    initialize();
  }, [vaultUnlocked, encryptionKey, appCredentials, bankCredentials]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const handleSetupComplete = async (masterPassword: string, salt: string) => {
    const key = await deriveKey(masterPassword, salt);
    unlockVault(key, salt, masterPassword);
    setHasVault(true);

    const pinHash = getStoredPinHash();
    if (pinHash) {
      try {
        const wrapped = await wrapCryptoKey(pinHash, key);
        storeWrappedVaultKey(wrapped);
        await fetch("/api/user/app-lock", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ wrappedKey: wrapped }),
        }).catch(() => {});
      } catch (wrapErr) {
        console.error("Failed to wrap vault key with PIN hash:", wrapErr);
      }
    }

    setTimeout(async () => {
      await refreshCredentials();
    }, 100);
  };

  const handleAddCredential = useCallback((type: "APP" | "BANK") => {
    setFormType(type);
    setEditingCredential(null);
    setIsFormOpen(true);
  }, []);

  // Keyboard shortcuts:
  //   /        -> focus credentials search
  //   mod+n    -> open add credential form
  //   Escape   -> close open modals (handled by Blade/Modal)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.isContentEditable;

      if (isTyping) return;

      if (event.key === "/") {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if ((event.key === "n" || event.key === "N") && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        handleAddCredential(activeTab);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, handleAddCredential]);

  const handleEditCredential = (credential: Credential, type: "APP" | "BANK") => {
    setFormType(type);
    setEditingCredential(credential);
    setIsFormOpen(true);
  };

  const handleDeleteCredential = async (id: string, type: "APP" | "BANK") => {
    const confirmed = await confirmAction({
      title: "Delete credential?",
      description: `Delete this ${type === "APP" ? "app" : "bank"} credential permanently? This cannot be undone.`,
      confirmLabel: "Delete credential",
      tone: "danger",
    });
    if (!confirmed) return;

    try {
      const endpoint = type === "APP" ? `/api/passwords/app/${id}` : `/api/passwords/bank/${id}`;
      const response = await fetch(endpoint, {
        method: "DELETE",
        headers: csrfHeaders(),
      });

      if (!response.ok) {
        throw new Error("Failed to delete credential");
      }

      await refreshCredentials();
    } catch (error) {
      console.error("Error deleting credential:", error);
      toast("Failed to delete credential.", "error");
    }
  };

  const handleToggleFavorite = async (id: string, type: "APP" | "BANK", isFavorite: boolean) => {
    try {
      const endpoint = type === "APP" ? `/api/passwords/app/${id}` : `/api/passwords/bank/${id}`;
      const response = await fetch(endpoint, {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        // The card already computes the next value; send it as-is.
        body: JSON.stringify({ isFavorite }),
      });
      if (!response.ok) throw new Error("Failed to update favorite");
      await refreshCredentials();
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      toast("Failed to update favorite.", "error");
    }
  };

  const handleInlinePinUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inlinePin.length !== 4) {
      setInlineError("PIN must be exactly 4 digits.");
      return;
    }
    setInlineError("");
    setIsInlineUnlocking(true);

    try {
      const pinHash = await hashPin(inlinePin);
      let wrapped = getStoredWrappedVaultKey();

      if (!wrapped) {
        const res = await fetch("/api/user/app-lock");
        if (res.ok) {
          const data = await res.json();
          if (data?.wrappedKey) {
            wrapped = data.wrappedKey;
            storeWrappedVaultKey(data.wrappedKey);
          }
        }
      }

      if (!wrapped) {
        throw new Error(
          "No wrapped credential key found on this device. Please unlock with master password once to sync.",
        );
      }

      const key = await unwrapCryptoKey(pinHash, wrapped);
      unlockVault(key, "", "");
      setInlinePin("");
      setTimeout(async () => {
        await refreshCredentials();
      }, 50);
    } catch (err) {
      setInlineError(
        err instanceof Error ? err.message : "Incorrect PIN or failed to decrypt credentials.",
      );
    } finally {
      setIsInlineUnlocking(false);
    }
  };

  const handleInlineUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inlinePassword) return;
    setInlineError("");
    setIsInlineUnlocking(true);

    try {
      const res = await fetch("/api/passwords/unlock", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ masterPassword: inlinePassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Incorrect master password.");
      }

      const key = await deriveKey(inlinePassword, data.encryptionSalt, data.kdfIterations);
      unlockVault(key, data.encryptionSalt, inlinePassword);

      // If user has a PIN configured on this device or in their account, wrap the newly derived key so PIN unlock keeps working across devices
      const pinHash = getStoredPinHash();
      if (pinHash) {
        try {
          const wrapped = await wrapCryptoKey(pinHash, key);
          storeWrappedVaultKey(wrapped);
          await fetch("/api/user/app-lock", {
            method: "POST",
            headers: csrfHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ wrappedKey: wrapped }),
          }).catch(() => {});
        } catch (wrapErr) {
          console.error("Failed to wrap vault key with PIN hash:", wrapErr);
        }
      }

      setInlinePassword("");
      setTimeout(async () => {
        await refreshCredentials();
      }, 50);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Failed to unlock vault.");
    } finally {
      setIsInlineUnlocking(false);
    }
  };

  const handleFormSave = async () => {
    await refreshCredentials();
    setIsFormOpen(false);
    setEditingCredential(null);
  };

  const credentials = activeTab === "APP" ? appCredentials : bankCredentials;

  const filteredCredentials = credentials.filter((cred) => {
    if (showFavorites && !cred.isFavorite) return false;
    if (debouncedSearch.trim()) {
      const q = debouncedSearch.trim().toLowerCase();
      const meta = decryptedMetadata[cred.id];
      const name = (meta?.name || cred.name || "").toLowerCase();
      const username = (meta?.username || cred.username || "").toLowerCase();
      const url = (meta?.url || cred.url || "").toLowerCase();
      return name.includes(q) || username.includes(q) || url.includes(q);
    }
    return true;
  });

  const sortedCredentials = [...filteredCredentials].sort((a, b) => {
    if (sortBy === "name") {
      const nameA = (decryptedMetadata[a.id]?.name || a.name || "").toLowerCase();
      const nameB = (decryptedMetadata[b.id]?.name || b.name || "").toLowerCase();
      return nameA.localeCompare(nameB);
    }
    if (sortBy === "accessed") {
      const timeA = a.lastAccessedAt ? new Date(a.lastAccessedAt).getTime() : 0;
      const timeB = b.lastAccessedAt ? new Date(b.lastAccessedAt).getTime() : 0;
      return timeB - timeA;
    }
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeB - timeA;
  });

  // Show setup modal if no vault exists
  if (!hasVault) {
    return (
      <>
        <PageHeader
          title="Credentials"
          actions={
            <Button onClick={() => setIsSetupModalOpen(true)}>
              <Lock className="h-4 w-4" />
              Set up vault
            </Button>
          }
        />
        <div className="mt-8">
          <EmptyState
            icon={<Lock className="h-6 w-6" />}
            title="No credential vault found"
            description="Create a credential vault to start storing your logins securely. All data is encrypted client-side before storage."
            action={
              <Button onClick={() => setIsSetupModalOpen(true)}>
                <Lock className="h-4 w-4" />
                Create credential vault
              </Button>
            }
          />
        </div>
        <VaultSetupModal
          isOpen={isSetupModalOpen}
          onClose={() => setIsSetupModalOpen(false)}
          onSetupComplete={handleSetupComplete}
        />
      </>
    );
  }

  // Reusable inline unlock form
  const renderInlineUnlockForm = (isCard = true) => {
    const hasPinAvailable =
      appLockHasPin || (typeof window !== "undefined" && !!getStoredPinHash());
    const isPinMode = unlockMethod === "pin" && hasPinAvailable;

    const content = (
      <>
        {hasPinAvailable && (
          <div className="mb-4 flex rounded-lg border border-border-subtle bg-surface-muted/60 p-0.5">
            <button
              type="button"
              onClick={() => {
                setUnlockMethod("pin");
                setInlineError("");
              }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
                unlockMethod === "pin"
                  ? "bg-surface text-text-primary shadow-fluent-2"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              Unlock with PIN
            </button>
            <button
              type="button"
              onClick={() => {
                setUnlockMethod("master");
                setInlineError("");
              }}
              className={cn(
                "flex-1 rounded-md py-1.5 text-xs font-semibold transition-colors",
                unlockMethod === "master"
                  ? "bg-surface text-text-primary shadow-fluent-2"
                  : "text-text-muted hover:text-text-primary",
              )}
            >
              Master password
            </button>
          </div>
        )}

        {isPinMode ? (
          <form onSubmit={handleInlinePinUnlock} className="space-y-4">
            {inlineError && (
              <Alert variant="danger">
                <p className="text-xs">{inlineError}</p>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="inline-unlock-pin">4-digit App Lock PIN</Label>
              <Input
                id="inline-unlock-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={inlinePin}
                onChange={(e) => setInlinePin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="••••"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              {appLockEnabled ? (
                <Button size="sm" variant="ghost" type="button" onClick={lockApp}>
                  Return to App Lock
                </Button>
              ) : (
                <div />
              )}
              <Button
                size="sm"
                type="submit"
                disabled={isInlineUnlocking || inlinePin.length !== 4}
              >
                <Lock className="h-4 w-4" />
                {isInlineUnlocking ? "Unlocking…" : "Unlock vault"}
              </Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleInlineUnlock} className="space-y-4">
            {inlineError && (
              <Alert variant="danger">
                <p className="text-xs">{inlineError}</p>
              </Alert>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="inline-unlock-password">Master password</Label>
              <div className="relative">
                <Input
                  id="inline-unlock-password"
                  type={showInlinePassword ? "text" : "password"}
                  value={inlinePassword}
                  onChange={(e) => setInlinePassword(e.target.value)}
                  placeholder="Enter your master password"
                  className="pr-10"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowInlinePassword(!showInlinePassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  title={showInlinePassword ? "Hide password" : "Show password"}
                  aria-label={showInlinePassword ? "Hide password" : "Show password"}
                >
                  {showInlinePassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2">
              {appLockEnabled ? (
                <Button size="sm" variant="ghost" type="button" onClick={lockApp}>
                  Return to App Lock
                </Button>
              ) : (
                <div />
              )}
              <Button size="sm" type="submit" disabled={isInlineUnlocking || !inlinePassword}>
                <Lock className="h-4 w-4" />
                {isInlineUnlocking ? "Unlocking…" : "Unlock vault"}
              </Button>
            </div>
          </form>
        )}
      </>
    );

    return isCard ? <div className="card mt-5 p-5">{content}</div> : content;
  };

  // If vault exists but app is locked, show nothing (AppLockScreen handles the lock).
  if (!appUnlocked) {
    return null;
  }

  const handleScanned2FA = async (account: Scanned2FAAccount) => {
    if (!encryptionKey) {
      toast("Please unlock your vault first to save your 2-step account.", "info");
      return;
    }

    try {
      const encryptedSecret = await encryptEnvelopeWithKey(account.secret, encryptionKey);
      const encryptedPassword = await encryptEnvelopeWithKey("", encryptionKey);

      const res = await fetch("/api/passwords/app", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: account.issuer || "2-Step Account",
          username: account.account || "Account",
          password: encryptedPassword,
          totpSecret: encryptedSecret,
          icon: "shield",
          iconColor: "#0078d4",
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save 2-step account");
      }

      await refreshCredentials();
      toast(`${account.issuer} added to Authenticator!`, "success");
      setCurrentTab("authenticator");
    } catch (err) {
      console.error("Error saving 2-step account:", err);
      toast("Failed to save 2-step account.", "error");
    }
  };

  const pageTitle =
    currentTab === "authenticator"
      ? "Authenticator"
      : currentTab === "bank"
        ? "Bank Passwords"
        : "App Passwords";
  const switchToTab = (tab: "account" | "bank" | "authenticator") => {
    setCurrentTab(tab);
    if (tab === "account") {
      setActiveTab("APP");
      setFormType("APP");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/credentials?tab=APP");
      }
    } else if (tab === "bank") {
      setActiveTab("BANK");
      setFormType("BANK");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/credentials?tab=BANK");
      }
    } else if (tab === "authenticator") {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/credentials?tab=AUTH");
      }
    }
  };

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <PageHeader title={pageTitle} icon={<Lock className="h-5 w-5" />} />

        <CommandBar>
          {currentTab === "authenticator" ? (
            <CommandBarButton
              primary
              icon={<Camera className="mr-1 h-3.5 w-3.5 text-white" />}
              onClick={() => setIsQRScannerOpen(true)}
            >
              Scan QR Code
            </CommandBarButton>
          ) : (
            <CommandBarButton
              primary
              icon={<Plus className="mr-1 h-3.5 w-3.5 text-white" />}
              onClick={() => handleAddCredential(activeTab)}
            >
              Add {activeTab === "BANK" ? "Bank" : "App"} Credential
            </CommandBarButton>
          )}
          <CommandBarDivider />
          <CommandBarButton
            icon={
              hasRecoverySetup ? (
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
              ) : (
                <Key className="h-3.5 w-3.5" />
              )
            }
            onClick={() => setIsRecoveryModalOpen(true)}
            title={
              hasRecoverySetup
                ? "Recovery key configured. Click to view or regenerate."
                : "Set up offline recovery"
            }
          >
            {hasRecoverySetup ? "Recovery active" : "Set up recovery"}
          </CommandBarButton>
        </CommandBar>
      </div>

      <div>
        <Tabs>
          <Tab
            value="account"
            active={currentTab === "account"}
            onClick={() => switchToTab("account")}
          >
            <span>App Pass</span>
            <span className="ml-1.5 rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[11px] tabular-nums font-normal text-text-muted">
              {appCredentials.length}
            </span>
          </Tab>
          <Tab value="bank" active={currentTab === "bank"} onClick={() => switchToTab("bank")}>
            <span>Bank Pass</span>
            <span className="ml-1.5 rounded-full bg-surface-muted px-2 py-0.5 font-mono text-[11px] tabular-nums font-normal text-text-muted">
              {bankCredentials.length}
            </span>
          </Tab>
          <Tab
            value="authenticator"
            active={currentTab === "authenticator"}
            onClick={() => switchToTab("authenticator")}
          >
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-brand" />
              Authenticator
            </span>
            <span className="ml-1.5 rounded-full bg-brand-subtle px-2 py-0.5 font-mono text-[11px] tabular-nums font-semibold text-brand">
              {authenticatorCredentials.length}
            </span>
          </Tab>
        </Tabs>
      </div>

      {currentTab === "authenticator" ? (
        isAutoUnlocking ? (
          <div className="flex flex-col items-center justify-center space-y-2 p-12">
            <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-brand" />
            <span className="text-xs text-text-muted">Unlocking authenticator…</span>
          </div>
        ) : !vaultUnlocked ? (
          <Card className="mx-auto mt-4 max-w-md p-6 sm:p-7">
            <div className="mb-5 space-y-1.5 text-center">
              <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl border border-brand/20 bg-brand-subtle text-brand">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-semibold text-text-primary">Unlock Authenticator</h4>
              <p className="text-xs text-text-muted">
                Enter your PIN or master password to decrypt your 2-step verification codes.
              </p>
            </div>
            {renderInlineUnlockForm(false)}
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="toolbar-surface flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="relative min-w-[200px] max-w-sm flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <Input
                  id="search-authenticator"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search 2-step accounts..."
                  className="h-8 pl-9 pr-3 text-[12px]"
                />
              </div>

              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => setIsQRScannerOpen(true)}>
                  <Camera className="mr-1 h-3.5 w-3.5" />
                  Scan QR Code
                </Button>
              </div>
            </div>

            {authenticatorCredentials.length === 0 ? (
              <EmptyState
                icon={<ShieldCheck className="h-7 w-7 text-brand" />}
                title="No 2-Step Accounts Configured"
                description="Scan a QR code from Microsoft, Google, GitHub, Amazon, or other accounts to set up this app as your 2-step verification authenticator."
                action={
                  <Button onClick={() => setIsQRScannerOpen(true)}>
                    <Camera className="mr-1.5 h-4 w-4" />
                    Scan QR Code
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {authenticatorCredentials
                  .filter((cred) => {
                    if (!searchQuery.trim()) return true;
                    const q = searchQuery.toLowerCase();
                    return (
                      cred.name.toLowerCase().includes(q) || cred.username.toLowerCase().includes(q)
                    );
                  })
                  .map((cred) => (
                    <AuthenticatorCard
                      key={cred.id}
                      credential={cred}
                      encryptionKey={encryptionKey!}
                      onEdit={() => handleEditCredential(cred, "APP")}
                      onDelete={() => handleDeleteCredential(cred.id, "APP")}
                    />
                  ))}
              </div>
            )}
          </div>
        )
      ) : isAutoUnlocking ? (
        <div className="flex flex-col items-center justify-center space-y-2 p-12">
          <div className="h-7 w-7 animate-spin rounded-full border-b-2 border-brand" />
          <span className="text-xs text-text-muted">Unlocking credential vault…</span>
        </div>
      ) : !vaultUnlocked ? (
        <Card className="mx-auto mt-4 max-w-md p-6 sm:p-7">
          <div className="mb-5 space-y-1.5 text-center">
            <div className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl border border-brand/20 bg-brand-subtle text-brand">
              <Lock className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-semibold text-text-primary">
              Unlock {activeTab === "APP" ? "App Logins" : "Bank Credentials"}
            </h4>
            <p className="text-xs text-text-muted">
              Enter your PIN or master password to decrypt and view your credentials.
            </p>
          </div>
          {renderInlineUnlockForm(false)}
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="toolbar-surface flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[200px] max-w-xs flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
                <Input
                  id="search"
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, username, URL..."
                  className="h-8 pl-9 pr-3 text-[12px]"
                />
              </div>
              <Label
                htmlFor="favorites-toggle"
                className="flex cursor-pointer select-none items-center gap-1.5 text-xs text-text-muted hover:text-text-primary"
              >
                <input
                  id="favorites-toggle"
                  type="checkbox"
                  checked={showFavorites}
                  onChange={(e) => setShowFavorites(e.target.checked)}
                  className="rounded border-border-subtle bg-surface accent-[var(--brand)]"
                />
                <Star className="h-3.5 w-3.5 fill-current text-warning" />
                <span>Favorites only</span>
              </Label>
            </div>
            <div className="w-40 shrink-0">
              <Select
                id="sort-credentials"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "accessed")}
                className="h-8 py-1 text-[12px]"
              >
                <option value="recent">Recently added</option>
                <option value="name">Name (A–Z)</option>
                <option value="accessed">Recently accessed</option>
              </Select>
            </div>
          </div>

          <div>
            {sortedCredentials.length === 0 ? (
              <Card className="p-0">
                <EmptyState
                  icon={<Globe className="h-6 w-6" />}
                  title={showFavorites ? "No favorite credentials" : "No credentials yet"}
                  description={
                    showFavorites
                      ? "Star credentials to see them here."
                      : "Add your first credential to get started."
                  }
                  action={
                    <Button onClick={() => handleAddCredential(activeTab)}>
                      <Plus className="h-4 w-4" />
                      Add {activeTab === "APP" ? "App" : "Bank"} Credential
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {sortedCredentials.map((cred) => (
                  <PasswordCard
                    key={cred.id}
                    credential={cred}
                    type={activeTab}
                    encryptionKey={encryptionKey!}
                    onEdit={() => handleEditCredential(cred, activeTab)}
                    onDelete={() => handleDeleteCredential(cred.id, activeTab)}
                    onFavoriteToggle={(id, isFavorite) =>
                      handleToggleFavorite(id, activeTab, isFavorite)
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <RecoverySetupModal
        isOpen={isRecoveryModalOpen}
        onClose={() => setIsRecoveryModalOpen(false)}
        encryptionKey={encryptionKey!}
        onComplete={() => {
          setIsRecoveryModalOpen(false);
          setHasRecoverySetup(true);
        }}
      />

      <PasswordForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false);
          setEditingCredential(null);
        }}
        credentialType={formType}
        encryptionKey={encryptionKey!}
        vaultSalt={vaultSalt}
        onSave={handleFormSave}
        editingCredential={editingCredential}
      />

      <QRScannerModal
        isOpen={isQRScannerOpen}
        onClose={() => setIsQRScannerOpen(false)}
        onScanned={handleScanned2FA}
      />
    </div>
  );
}
