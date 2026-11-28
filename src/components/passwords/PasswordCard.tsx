"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Eye,
  EyeOff,
  Copy,
  Check,
  Edit,
  Trash2,
  Globe,
  Building2,
  Star,
  ChevronRight,
  ShieldCheck,
  Lock,
  User,
  ExternalLink,
} from "lucide-react";
import { csrfHeaders } from "@/lib/csrf-client";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import {
  decryptEnvelopeWithKey,
  isEnvelopeEncryption,
  type EncryptionEnvelope,
} from "@/lib/envelope-crypto";
import { Credential } from "@/types/credentials";
import { generateTOTP, getTOTPRemainingSeconds } from "@/lib/totp";

interface PasswordCardProps {
  credential: Credential;
  type: "APP" | "BANK";
  encryptionKey: CryptoKey;
  onEdit?: () => void;
  onDelete?: () => void;
  onFavoriteToggle?: (id: string, isFavorite: boolean) => void;
  readOnly?: boolean;
}

const ICONS: Record<string, React.ElementType> = {
  lock: Lock,
  user: User,
  globe: Globe,
  building: Building2,
  shield: ShieldCheck,
  star: Star,
  // PascalCase aliases for backward compatibility
  Lock,
  User,
  Globe,
  Building2,
  ShieldCheck,
  Star,
};

function formatLastAccessed(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = Date.now();
    const diffSec = Math.floor((now - date.getTime()) / 1000);
    if (diffSec < 60) return "just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}d ago`;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date);
  } catch {
    return dateStr;
  }
}

export function PasswordCard({
  credential,
  type,
  encryptionKey,
  onEdit,
  onDelete,
  onFavoriteToggle,
  readOnly = false,
}: PasswordCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFields, setShowFields] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [decryptedData, setDecryptedData] = useState<Record<string, string>>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isFavorite, setIsFavorite] = useState(!!credential.isFavorite);
  const [lastAccessedAt, setLastAccessedAt] = useState<string | null>(
    credential.lastAccessedAt || null,
  );
  const [totpCode, setTotpCode] = useState<string>("");
  const [totpRemaining, setTotpRemaining] = useState<number>(30);
  const [copiedTOTP, setCopiedTOTP] = useState(false);
  const copyTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const { toast } = useFeedback();

  // Cancel pending clipboard-reset timers when the card unmounts.
  useEffect(() => {
    const timeouts = copyTimeoutsRef.current;
    return () => {
      for (const timeout of timeouts) clearTimeout(timeout);
      timeouts.clear();
    };
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!isExpanded || !decryptedData.totpSecret) {
      setTotpCode("");
      return;
    }

    let isMounted = true;

    const updateTOTP = async () => {
      try {
        const remaining = getTOTPRemainingSeconds(30);
        if (isMounted) setTotpRemaining(remaining);
        const code = await generateTOTP(decryptedData.totpSecret);
        if (isMounted) setTotpCode(code);
      } catch (err) {
        console.error("Failed to generate TOTP code:", err);
      }
    };

    void updateTOTP();
    const interval = setInterval(() => {
      void updateTOTP();
    }, 1000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isExpanded, decryptedData.totpSecret]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleCopyTOTP = async () => {
    if (!totpCode) return;
    try {
      await navigator.clipboard.writeText(totpCode);
      void recordActivity("COPY");
      setCopiedTOTP(true);
      const timeout = setTimeout(() => {
        copyTimeoutsRef.current.delete(timeout);
        setCopiedTOTP(false);
      }, 2000);
      copyTimeoutsRef.current.add(timeout);
      toast("Verification code copied to clipboard", "success");
    } catch (err) {
      console.error("Failed to copy TOTP code to clipboard:", err);
      toast("Clipboard access was unavailable. Please copy the code manually.", "error");
    }
  };

  const handleToggleFavorite = async () => {
    if (readOnly || !onFavoriteToggle) return;
    const next = !isFavorite;
    setIsFavorite(next);
    try {
      await onFavoriteToggle(credential.id, next);
    } catch (err) {
      setIsFavorite(!next);
      console.error("Failed to toggle favorite:", err);
    }
  };

  const recordActivity = async (action: "VIEW" | "COPY") => {
    try {
      const auditAction = readOnly ? (action === "COPY" ? "FAMILY_COPY" : "FAMILY_VIEW") : action;
      const response = await fetch("/api/passwords/audit", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ credentialId: credential.id, type, action: auditAction }),
      });
      if (response.ok) {
        const result = await response.json();
        if (result?.lastAccessedAt) {
          setLastAccessedAt(result.lastAccessedAt);
        }
      }
    } catch {
      /* Access logging must not prevent the user from viewing the item. */
    }
  };

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text);
      void recordActivity("COPY");
      setCopied((current) => ({ ...current, [field]: true }));
      const timeout = setTimeout(async () => {
        copyTimeoutsRef.current.delete(timeout);
        setCopied((current) => ({ ...current, [field]: false }));
        // Clear only if the clipboard still contains the value Vaulty copied.
        try {
          if ((await navigator.clipboard.readText()) === text)
            await navigator.clipboard.writeText("");
        } catch {
          /* Clipboard read permission may be unavailable. */
        }
      }, 30000);
      copyTimeoutsRef.current.add(timeout);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      toast("Clipboard access was unavailable. Please copy the value manually.", "error");
    }
  };

  const decryptField = useCallback(
    async (value: string): Promise<string | null> => {
      if (!value || !encryptionKey) return null;

      try {
        if (isEnvelopeEncryption(value)) {
          const parsed = JSON.parse(value);
          return await decryptEnvelopeWithKey(parsed as EncryptionEnvelope, encryptionKey);
        }
        return null;
      } catch (err) {
        console.error("Failed to decrypt credential field:", err);
        return null;
      }
    },
    [encryptionKey],
  );

  // Decrypt the display name eagerly so the credential is identifiable in the list.
  // All secret fields are decrypted lazily when the card is expanded.
  useEffect(() => {
    const decryptName = async () => {
      try {
        if (credential.name) {
          const decryptedName = await decryptField(credential.name);
          if (decryptedName !== null) {
            setDecryptedData((prev) => ({ ...prev, name: decryptedName }));
          }
        }
      } catch (err) {
        console.error("Error decrypting name:", err);
      }
    };
    decryptName();
  }, [credential.name, encryptionKey, decryptField]);

  const handleExpand = async () => {
    if (isExpanded) {
      setIsExpanded(false);
      return;
    }
    if (isDecrypting) return;
    setIsExpanded(true);
    void recordActivity("VIEW");
    if (Object.keys(decryptedData).length > 0 && decryptedData.name) {
      // Name already decrypted; decrypt remaining secret fields if not yet done.
      const hasSecrets = Object.keys(decryptedData).some((k) => k !== "name");
      if (!hasSecrets && !isDecrypting) {
        setIsDecrypting(true);
        try {
          const decrypted: Record<string, string> = {};
          for (const [key, value] of Object.entries(credential)) {
            if (
              value &&
              typeof value === "string" &&
              key !== "id" &&
              key !== "vaultId" &&
              key !== "createdAt" &&
              key !== "updatedAt" &&
              key !== "isFavorite" &&
              key !== "icon" &&
              key !== "iconColor"
            ) {
              const result = await decryptField(value);
              if (result !== null) decrypted[key] = result;
            }
          }
          setDecryptedData((prev) => ({ ...prev, ...decrypted }));
        } catch (err) {
          console.error("Error decrypting credential:", err);
        } finally {
          setIsDecrypting(false);
        }
      }
      return;
    }

    setIsDecrypting(true);
    try {
      const decrypted: Record<string, string> = {};
      for (const [key, value] of Object.entries(credential)) {
        if (
          value &&
          typeof value === "string" &&
          key !== "id" &&
          key !== "vaultId" &&
          key !== "createdAt" &&
          key !== "updatedAt" &&
          key !== "isFavorite" &&
          key !== "icon" &&
          key !== "iconColor"
        ) {
          const result = await decryptField(value);
          if (result !== null) decrypted[key] = result;
        }
      }
      setDecryptedData(decrypted);
    } catch (err) {
      console.error("Error decrypting credential:", err);
    } finally {
      setIsDecrypting(false);
    }
  };

  const toggleFieldVisibility = (field: string) => {
    setShowFields({ ...showFields, [field]: !showFields[field] });
  };

  const renderField = (
    label: string,
    field: string,
    options?: { isSecret?: boolean; isUrl?: boolean },
  ) => {
    const displayValue = decryptedData[field];
    if (!displayValue) return null;

    const isSecret = options?.isSecret ?? true;
    const isUrl = options?.isUrl ?? false;
    const isShown = !isSecret || !!showFields[field];

    let targetHref = "";
    if (isUrl && displayValue) {
      targetHref =
        displayValue.startsWith("http://") || displayValue.startsWith("https://")
          ? displayValue
          : `https://${displayValue}`;
    }

    return (
      <div className="flex items-center justify-between py-2 border-b border-border-subtle last:border-0">
        <span className="text-xs text-text-muted w-1/3">{label}</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isUrl && isShown ? (
            <a
              href={targetHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand hover:underline truncate flex items-center gap-1 min-w-0"
              title={displayValue}
            >
              <span className="truncate">{displayValue}</span>
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          ) : (
            <span className="text-xs font-medium text-text-primary truncate">
              {isShown ? displayValue : "••••••••"}
            </span>
          )}
          {isSecret && (
            <button
              type="button"
              onClick={() => toggleFieldVisibility(field)}
              className="p-1 text-text-muted hover:text-text-primary shrink-0"
              title={showFields[field] ? "Hide" : "Show"}
            >
              {showFields[field] ? (
                <EyeOff className="h-3.5 w-3.5" />
              ) : (
                <Eye className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => handleCopy(displayValue, field)}
            className="p-1 text-text-muted hover:text-text-primary shrink-0"
            title="Copy to clipboard"
          >
            {copied[field] ? (
              <Check className="h-3.5 w-3.5 text-success" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
        </div>
      </div>
    );
  };

  const passwordValue = decryptedData.password || "";
  const passwordStrength = passwordValue
    ? [
        passwordValue.length >= 12,
        /[a-z]/.test(passwordValue) && /[A-Z]/.test(passwordValue),
        /\d/.test(passwordValue),
        /[^A-Za-z0-9]/.test(passwordValue),
      ].filter(Boolean).length
    : 0;
  const strengthLabel = ["Very weak", "Weak", "Fair", "Strong", "Very strong"][passwordStrength];
  const normalizedIcon = credential.icon?.toLowerCase();
  const IconComponent = normalizedIcon ? ICONS[normalizedIcon] : undefined;
  const nameLooksEncrypted =
    typeof credential.name === "string" && credential.name.trim().startsWith("{");
  const displayName =
    decryptedData.name || (nameLooksEncrypted ? "Encrypted credential" : credential.name);

  return (
    <Card className="overflow-hidden p-0 transition-all hover:border-border-strong">
      <div className="flex items-center gap-2 px-4 py-3.5">
        <button
          type="button"
          onClick={handleExpand}
          disabled={isDecrypting}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${displayName || "credential"}`}
          className="flex min-w-0 flex-1 items-center gap-3.5 rounded-lg text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted text-brand">
            {IconComponent ? (
              <IconComponent
                className="h-5 w-5"
                style={{ color: credential.iconColor || "currentColor" }}
              />
            ) : type === "APP" ? (
              <Globe className="h-5 w-5" />
            ) : (
              <Building2 className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
              />
              <h3 className="truncate text-[14px] font-semibold tracking-tight text-text-primary">
                {displayName}
              </h3>
              {isDecrypting && (
                <span className="shrink-0 font-mono text-[11px] text-text-muted">Decrypting…</span>
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono text-[10.5px] uppercase tracking-wider">
                {type === "APP" ? "Application" : "Banking"}
              </span>
              {readOnly && (
                <Badge variant="info" className="gap-1 py-0">
                  <Lock className="h-2.5 w-2.5" /> Read-only
                </Badge>
              )}
              {lastAccessedAt && (
                <span suppressHydrationWarning className="font-mono text-[10.5px] text-text-muted">
                  · Accessed {formatLastAccessed(lastAccessedAt)}
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {!readOnly && onFavoriteToggle && (
            <button
              type="button"
              onClick={handleToggleFavorite}
              className={`rounded-lg p-2 transition-colors hover:bg-surface-muted ${isFavorite ? "text-warning" : "text-text-muted hover:text-text-primary"}`}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              aria-pressed={isFavorite}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
            >
              <Star className={`h-4 w-4 ${isFavorite ? "fill-current" : ""}`} />
            </button>
          )}
          {!readOnly && onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              aria-label="Edit credential"
              title="Edit credential"
            >
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {!readOnly && onDelete && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              aria-label="Delete credential"
              title="Delete credential"
            >
              <Trash2 className="h-4 w-4 text-danger" />
            </Button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t border-border-subtle bg-surface-muted/30 px-4 py-3">
          {isDecrypting && Object.keys(decryptedData).length === 0 ? (
            <p className="py-2 text-xs text-text-muted">Decrypting credential details…</p>
          ) : Object.keys(decryptedData).length > 0 ? (
            <>
              {type === "APP" ? (
                <>
                  {renderField("URL", "url", { isSecret: false, isUrl: true })}
                  {renderField("Username", "username", { isSecret: false })}
                  {renderField("Password", "password", { isSecret: true })}
                  {passwordValue && (
                    <div className="mt-2">
                      <div className="mb-1 flex justify-between text-[11px]">
                        <span className="text-text-muted">Password strength</span>
                        <span className="font-medium text-text-secondary">{strengthLabel}</span>
                      </div>
                      <div className="grid grid-cols-4 gap-1">
                        {[0, 1, 2, 3].map((n) => (
                          <span
                            key={n}
                            className={`h-1.5 rounded-full ${n < passwordStrength ? "bg-success" : "bg-surface-muted"}`}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                  {decryptedData.totpSecret && (
                    <div className="mt-3 rounded-xl border border-brand/20 bg-brand/5 p-3.5 dark:bg-brand/10">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-brand" />
                          <span className="text-xs font-semibold text-text-primary">
                            Authenticator (2FA)
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-text-muted">
                          <div className="relative flex h-5 w-5 items-center justify-center">
                            <svg className="h-5 w-5 -rotate-90 transform" viewBox="0 0 36 36">
                              <path
                                className="text-border-subtle"
                                strokeWidth="3.5"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                              <path
                                className={
                                  totpRemaining <= 5
                                    ? "text-danger transition-all duration-300"
                                    : "text-brand transition-all duration-300"
                                }
                                strokeDasharray={`${(totpRemaining / 30) * 100}, 100`}
                                strokeWidth="3.5"
                                strokeLinecap="round"
                                stroke="currentColor"
                                fill="none"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                              />
                            </svg>
                          </div>
                          <span
                            className={`font-mono text-[11px] font-medium ${
                              totpRemaining <= 5 ? "text-danger" : "text-text-secondary"
                            }`}
                          >
                            {totpRemaining}s
                          </span>
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="flex items-baseline gap-2">
                          <span className="font-mono text-2xl font-bold tracking-wider text-text-primary">
                            {totpCode
                              ? totpCode.length === 6
                                ? `${totpCode.slice(0, 3)} ${totpCode.slice(3)}`
                                : totpCode
                              : "••••••"}
                          </span>
                        </div>

                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleCopyTOTP}
                          disabled={!totpCode}
                          className="gap-1.5 text-xs"
                          aria-label="Copy verification code"
                        >
                          {copiedTOTP ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-success" />
                              <span className="text-success">Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              <span>Copy Code</span>
                            </>
                          )}
                        </Button>
                      </div>

                      <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-muted">
                        <div
                          className={`h-full transition-all duration-1000 ease-linear ${
                            totpRemaining <= 5 ? "bg-danger" : "bg-brand"
                          }`}
                          style={{ width: `${(totpRemaining / 30) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {renderField("TOTP Key", "totpSecret", { isSecret: true })}
                </>
              ) : (
                <>
                  {renderField("Username", "username", { isSecret: false })}
                  {renderField("Netbank Password", "netbankPassword", { isSecret: true })}
                  {renderField("ATM PIN", "atmPin", { isSecret: true })}
                  {renderField("UPI PIN", "upiPin", { isSecret: true })}
                  {renderField("Mobile App PIN", "mobileAppPin", { isSecret: true })}
                  {renderField("Mobile Transaction PIN", "mobileTransactionPin", {
                    isSecret: true,
                  })}
                </>
              )}
            </>
          ) : (
            <p className="py-2 text-xs text-text-muted">
              No details are available for this credential.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}
