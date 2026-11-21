"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
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
import {
  Lock,
  Plus,
  Globe,
  Building2,
  Star,
  Search,
  Key,
  ShieldCheck,
  Eye,
  EyeOff,
  ArrowRight,
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
  mode?: "dashboard" | "account" | "bank";
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
  const [currentTab, setCurrentTab] = useState<"overview" | "account" | "bank">(
    mode === "bank" ? "bank" : mode === "account" ? "account" : "overview",
  );
  const [activeTab, setActiveTab] = useState<"APP" | "BANK">(mode === "bank" ? "BANK" : "APP");
  const [showFavorites, setShowFavorites] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "name" | "accessed">("recent");
  const [isRecoveryModalOpen, setIsRecoveryModalOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Inline unlock state when vault key is not in memory
  const [unlockMethod, setUnlockMethod] = useState<"pin" | "master">("pin");
  const [inlinePin, setInlinePin] = useState("");
  const [inlinePassword, setInlinePassword] = useState("");
  const [showInlinePassword, setShowInlinePassword] = useState(false);
  const [inlineError, setInlineError] = useState("");
  const [isInlineUnlocking, setIsInlineUnlocking] = useState(false);

  const searchParams = useSearchParams();

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (mode === "bank") {
      setCurrentTab("bank");
      setActiveTab("BANK");
      setFormType("BANK");
    } else if (mode === "account") {
      setCurrentTab("account");
      setActiveTab("APP");
      setFormType("APP");
    } else {
      setCurrentTab("overview");
    }
  }, [mode]);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (tabParam === "BANK" || tabParam === "bank") {
      setCurrentTab("bank");
      setActiveTab("BANK");
      setFormType("BANK");
    } else if (tabParam === "APP" || tabParam === "account" || tabParam === "app") {
      setCurrentTab("account");
      setActiveTab("APP");
      setFormType("APP");
    }
    const action = searchParams.get("action");
    if (action === "new") {
      const targetType = tabParam === "BANK" || mode === "bank" ? "BANK" : "APP";
      setCurrentTab(targetType === "BANK" ? "bank" : "account");
      setActiveTab(targetType);
      setFormType(targetType);
      setEditingCredential(null);
      setIsFormOpen(true);
    }
  }, [searchParams, mode]);
  /* eslint-enable react-hooks/set-state-in-effect */

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

  // Recent credentials across both Apps and Banks for dashboard
  const recentCredentials = useMemo(() => {
    const list: Array<{ cred: Credential; type: "APP" | "BANK" }> = [
      ...appCredentials.map((c) => ({ cred: c, type: "APP" as const })),
      ...bankCredentials.map((c) => ({ cred: c, type: "BANK" as const })),
    ];
    return list
      .sort((a, b) => new Date(b.cred.createdAt).getTime() - new Date(a.cred.createdAt).getTime())
      .slice(0, 6);
  }, [appCredentials, bankCredentials]);

  // Show setup modal if no vault exists
  if (!hasVault) {
    return (
      <>
        <PageHeader
          eyebrow="Credential vault"
          title="Credentials"
          description="Store your app and bank credentials securely with client-side encryption."
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

  const pageTitle =
    currentTab === "overview"
      ? "Credentials Dashboard"
      : currentTab === "bank"
        ? "Bank Credentials"
        : "App Logins";
  const pageDescription =
    currentTab === "overview"
      ? "Your application logins and bank portal accounts are protected with client-side envelope encryption."
      : currentTab === "bank"
        ? "Your bank netbanking portals, customer IDs, and transaction credentials."
        : "Your web and application passwords, protected with client-side envelope encryption.";

  const switchToTab = (tab: "overview" | "account" | "bank") => {
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
    } else {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/credentials");
      }
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Credential Vault"
        title={pageTitle}
        description={pageDescription}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setIsRecoveryModalOpen(true)}
              title={
                hasRecoverySetup
                  ? "Recovery key configured. Click to view or regenerate."
                  : "Set up offline recovery"
              }
            >
              {hasRecoverySetup ? (
                <>
                  <ShieldCheck className="h-4 w-4 text-success" />
                  Recovery active
                </>
              ) : (
                <>
                  <Key className="h-4 w-4" />
                  Set up recovery
                </>
              )}
            </Button>
            <Button onClick={() => handleAddCredential(activeTab)}>
              <Plus className="h-4 w-4" />
              Add {activeTab === "BANK" ? "Bank" : "App"} Credential
            </Button>
          </>
        }
      />

      <div className="mt-4 mb-6">
        <Tabs>
          <Tab
            value="overview"
            active={currentTab === "overview"}
            onClick={() => switchToTab("overview")}
          >
            Overview
          </Tab>
          <Tab
            value="account"
            active={currentTab === "account"}
            onClick={() => switchToTab("account")}
          >
            <span>App Logins</span>
            <span className="ml-1.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-normal text-text-muted">
              {appCredentials.length}
            </span>
          </Tab>
          <Tab value="bank" active={currentTab === "bank"} onClick={() => switchToTab("bank")}>
            <span>Bank Accounts</span>
            <span className="ml-1.5 rounded-full bg-surface-muted px-1.5 py-0.5 text-[11px] font-normal text-text-muted">
              {bankCredentials.length}
            </span>
          </Tab>
        </Tabs>
      </div>

      {currentTab === "overview" ? (
        <>
          {/* 4 Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              className="cursor-pointer"
              onClick={() => switchToTab("account")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") switchToTab("account");
              }}
            >
              <Card className="p-4.5 hover:border-brand/40 transition-all">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      App Accounts
                    </span>
                    <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Globe className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-text-primary">{appCredentials.length}</p>
                  <span className="text-xs text-brand font-medium inline-flex items-center gap-1 hover:underline">
                    View all app logins <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Card>
            </div>

            <div
              className="cursor-pointer"
              onClick={() => switchToTab("bank")}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") switchToTab("bank");
              }}
            >
              <Card className="p-4.5 hover:border-brand/40 transition-all">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                      Bank Credentials
                    </span>
                    <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                      <Building2 className="h-4 w-4" />
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-text-primary">{bankCredentials.length}</p>
                  <span className="text-xs text-brand font-medium inline-flex items-center gap-1 hover:underline">
                    View all bank portals <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Card>
            </div>

            <Card className="p-4.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Encryption
                </span>
                <div className="h-8 w-8 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <ShieldCheck className="h-4 w-4" />
                </div>
              </div>
              <p className="text-xl font-bold text-text-primary">AES-256-GCM</p>
              <span className="text-xs text-text-muted block">Client-side envelope v2</span>
            </Card>

            <Card className="p-4.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                  Offline Recovery
                </span>
                <div className="h-8 w-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <Key className="h-4 w-4" />
                </div>
              </div>
              <p className="text-xl font-bold text-text-primary">
                {hasRecoverySetup ? "Configured" : "Action Needed"}
              </p>
              <span className="text-xs text-text-muted block">
                {hasRecoverySetup ? "Zero-knowledge re-key ready" : "Protect against lockout"}
              </span>
            </Card>
          </div>

          {/* 2 Navigation & Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
            <Card className="p-5 sm:p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                    <Globe className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-base font-semibold text-text-primary">App & Web Accounts</h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Store user credentials, usernames, passwords, service URLs, and two-factor secrets
                  for digital accounts.
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle">
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => switchToTab("account")}
                >
                  View App Logins ({appCredentials.length})
                </Button>
                <Button size="sm" onClick={() => handleAddCredential("APP")} className="text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New App Credential
                </Button>
              </div>
            </Card>

            <Card className="p-5 sm:p-6 flex flex-col justify-between space-y-4">
              <div className="space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                    <Building2 className="h-4.5 w-4.5" />
                  </div>
                  <h3 className="text-base font-semibold text-text-primary">
                    Bank & Netbanking Accounts
                  </h3>
                </div>
                <p className="text-xs text-text-muted leading-relaxed">
                  Safely store bank customer IDs, netbanking user IDs, online financial access
                  credentials, and transaction passwords.
                </p>
              </div>
              <div className="flex items-center justify-between gap-2 pt-3 border-t border-border-subtle">
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  onClick={() => switchToTab("bank")}
                >
                  View Bank Logins ({bankCredentials.length})
                </Button>
                <Button size="sm" onClick={() => handleAddCredential("BANK")} className="text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New Bank Credential
                </Button>
              </div>
            </Card>
          </div>

          {/* Quick Access / Recent Logins Section */}
          <div className="mt-8 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-text-primary">Quick Access Logins</h3>
                <p className="text-xs text-text-muted">
                  {vaultUnlocked
                    ? "Recently added credentials and starred logins."
                    : "Unlock vault to preview credentials."}
                </p>
              </div>
              {vaultUnlocked && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => switchToTab("account")}
                  >
                    All Apps
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => switchToTab("bank")}
                  >
                    All Banks
                  </Button>
                </div>
              )}
            </div>

            {!vaultUnlocked ? (
              <Card className="p-6 max-w-md mx-auto">
                <div className="text-center space-y-1 mb-4">
                  <div className="h-10 w-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mx-auto mb-2">
                    <Lock className="h-5 w-5" />
                  </div>
                  <h4 className="text-sm font-semibold text-text-primary">
                    Unlock Vault for Quick Access
                  </h4>
                  <p className="text-xs text-text-muted">
                    Enter your PIN or master password to preview credentials directly on this
                    dashboard.
                  </p>
                </div>
                {renderInlineUnlockForm(false)}
              </Card>
            ) : recentCredentials.length === 0 ? (
              <EmptyState
                icon={<Globe className="h-6 w-6" />}
                title="No credentials stored yet"
                description="Add your first app or bank credential to get started."
                action={
                  <Button onClick={() => handleAddCredential("APP")}>
                    <Plus className="h-4 w-4" />
                    Add App Credential
                  </Button>
                }
              />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {recentCredentials.map(
                  ({ cred, type }: { cred: Credential; type: "APP" | "BANK" }) => (
                    <PasswordCard
                      key={cred.id}
                      credential={cred}
                      type={type}
                      encryptionKey={encryptionKey!}
                      onEdit={() => handleEditCredential(cred, type)}
                      onDelete={() => handleDeleteCredential(cred.id, type)}
                      onFavoriteToggle={(id, isFavorite) =>
                        handleToggleFavorite(id, type, isFavorite)
                      }
                    />
                  ),
                )}
              </div>
            )}
          </div>
        </>
      ) : !vaultUnlocked ? (
        <Card className="p-6 max-w-md mx-auto mt-4">
          <div className="text-center space-y-1 mb-4">
            <div className="h-10 w-10 rounded-2xl bg-brand/10 text-brand flex items-center justify-center mx-auto mb-2">
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
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Label
              htmlFor="favorites-toggle"
              className="text-xs text-text-muted flex items-center gap-1 cursor-pointer select-none"
            >
              <input
                id="favorites-toggle"
                type="checkbox"
                checked={showFavorites}
                onChange={(e) => setShowFavorites(e.target.checked)}
                className="rounded border-border-subtle bg-surface text-text-primary focus:ring-brand"
              />
              <Star className="h-3.5 w-3.5 fill-current text-text-muted" />
              <span>Favorites only</span>
            </Label>
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-text-muted" />
              <Input
                id="search"
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search name, username, URL..."
                className="h-8 pl-9 pr-3 text-[12px]"
              />
            </div>
            <div className="w-36 shrink-0">
              <Select
                id="sort-credentials"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as "recent" | "name" | "accessed")}
                className="h-8 text-[12px] py-1"
              >
                <option value="recent">Recently added</option>
                <option value="name">Name (A–Z)</option>
                <option value="accessed">Recently accessed</option>
              </Select>
            </div>
          </div>

          <div className="mt-3">
            {sortedCredentials.length === 0 ? (
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
    </>
  );
}
