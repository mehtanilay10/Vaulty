"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Copy, Check, Trash2, Edit, ShieldCheck, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { generateTOTP, getTOTPRemainingSeconds } from "@/lib/totp";
import { decryptEnvelopeWithKey, isEnvelopeEncryption } from "@/lib/envelope-crypto";
import { Credential } from "@/types/credentials";
import { useFeedback } from "@/components/providers/FeedbackProvider";

interface AuthenticatorCardProps {
  credential: Credential;
  encryptionKey: CryptoKey;
  onEdit?: () => void;
  onDelete?: () => void;
}

// Brand color palette helper for common services
function getBrandStyle(name: string): { bg: string; text: string; initial: string } {
  const n = (name || "").toLowerCase();
  if (
    n.includes("microsoft") ||
    n.includes("azure") ||
    n.includes("outlook") ||
    n.includes("office")
  ) {
    return { bg: "bg-[#0078d4]/10 border-[#0078d4]/30", text: "text-[#0078d4]", initial: "MS" };
  }
  if (n.includes("google") || n.includes("gmail") || n.includes("youtube")) {
    return { bg: "bg-[#ea4335]/10 border-[#ea4335]/30", text: "text-[#ea4335]", initial: "G" };
  }
  if (n.includes("github")) {
    return {
      bg: "bg-slate-800/10 dark:bg-white/10 border-slate-700/30",
      text: "text-slate-800 dark:text-white",
      initial: "GH",
    };
  }
  if (n.includes("apple") || n.includes("icloud")) {
    return {
      bg: "bg-slate-500/10 border-slate-500/30",
      text: "text-slate-600 dark:text-slate-300",
      initial: "",
    };
  }
  if (n.includes("amazon") || n.includes("aws")) {
    return { bg: "bg-[#ff9900]/10 border-[#ff9900]/30", text: "text-[#ff9900]", initial: "AWS" };
  }
  if (n.includes("discord")) {
    return { bg: "bg-[#5865f2]/10 border-[#5865f2]/30", text: "text-[#5865f2]", initial: "D" };
  }
  if (n.includes("slack")) {
    return {
      bg: "bg-[#4a154b]/10 border-[#4a154b]/30",
      text: "text-[#4a154b] dark:text-[#e01e5a]",
      initial: "S",
    };
  }
  if (n.includes("binance") || n.includes("crypto") || n.includes("coinbase")) {
    return { bg: "bg-[#f3ba2f]/10 border-[#f3ba2f]/30", text: "text-[#f3ba2f]", initial: "₿" };
  }
  if (n.includes("facebook") || n.includes("meta") || n.includes("instagram")) {
    return { bg: "bg-[#0668e1]/10 border-[#0668e1]/30", text: "text-[#0668e1]", initial: "M" };
  }
  return {
    bg: "bg-brand/10 border-brand/30",
    text: "text-brand",
    initial: (name || "A").slice(0, 2).toUpperCase(),
  };
}

export function AuthenticatorCard({
  credential,
  encryptionKey,
  onEdit,
  onDelete,
}: AuthenticatorCardProps) {
  const { toast } = useFeedback();

  const [decryptedSecret, setDecryptedSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState<string>("");
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30);
  const [copied, setCopied] = useState<boolean>(false);
  const [showSecret, setShowSecret] = useState<boolean>(false);

  // Decrypt totpSecret
  useEffect(() => {
    let active = true;

    async function decrypt() {
      const rawSecret = (credential as unknown as { totpSecret?: string | null }).totpSecret;
      if (!rawSecret) {
        setDecryptedSecret(null);
        return;
      }

      if (isEnvelopeEncryption(rawSecret)) {
        try {
          const parsed = typeof rawSecret === "string" ? JSON.parse(rawSecret) : rawSecret;
          const plain = await decryptEnvelopeWithKey(parsed, encryptionKey);
          if (active) setDecryptedSecret(plain);
        } catch {
          if (active) setDecryptedSecret(null);
        }
      } else {
        if (active) setDecryptedSecret(rawSecret);
      }
    }

    decrypt();
    return () => {
      active = false;
    };
  }, [credential, encryptionKey]);

  // Compute live TOTP code and countdown timer
  const refreshTOTP = useCallback(async () => {
    if (!decryptedSecret) return;
    try {
      const code = await generateTOTP(decryptedSecret);
      setTotpCode(code);
      setRemainingSeconds(getTOTPRemainingSeconds());
    } catch {
      setTotpCode("");
    }
  }, [decryptedSecret]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!decryptedSecret) return;

    refreshTOTP();
    const interval = setInterval(() => {
      const rem = getTOTPRemainingSeconds();
      setRemainingSeconds(rem);
      // Refresh code on cycle reset
      if (rem === 30 || rem === 29) {
        refreshTOTP();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [decryptedSecret, refreshTOTP]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Copy code to clipboard
  const handleCopyCode = async () => {
    if (!totpCode) return;
    try {
      await navigator.clipboard.writeText(totpCode);
      setCopied(true);
      toast(`${credential.name} 2-step verification code copied to clipboard.`, "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const brand = useMemo(() => getBrandStyle(credential.name), [credential.name]);

  // Format 6-digit code with center space for Microsoft Authenticator feel
  const formattedCode = useMemo(() => {
    if (!totpCode || totpCode.length !== 6) return totpCode || "------";
    return `${totpCode.slice(0, 3)} ${totpCode.slice(3)}`;
  }, [totpCode]);

  // Timer circle SVG progress
  const progressRatio = remainingSeconds / 30;
  const strokeDashoffset = 100 * (1 - progressRatio);
  const isExpiringSoon = remainingSeconds <= 5;
  const isWarning = remainingSeconds <= 10 && remainingSeconds > 5;

  const timerColor = isExpiringSoon ? "text-danger" : isWarning ? "text-warning" : "text-brand";

  return (
    <Card className="group relative overflow-hidden border border-border-subtle hover:border-brand/40 bg-surface transition-all p-4 sm:p-5">
      {/* Top row: Brand Icon, Name, Account, Action buttons */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-bold tracking-tight shadow-xs ${brand.bg} ${brand.text}`}
          >
            {brand.initial}
          </div>
          <div className="min-w-0">
            <h4 className="truncate text-base font-semibold text-text-primary group-hover:text-brand transition-colors">
              {credential.name}
            </h4>
            <p className="truncate text-xs text-text-muted font-mono">
              {credential.username || "2-Step Verification"}
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
          {onEdit && (
            <button
              type="button"
              onClick={onEdit}
              className="rounded-md p-1.5 text-text-muted hover:bg-surface-muted hover:text-text-primary transition-colors"
              title="Edit account"
            >
              <Edit className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="rounded-md p-1.5 text-text-muted hover:bg-danger-subtle hover:text-danger transition-colors"
              title="Delete account"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Middle row: Large 6-digit TOTP code and countdown timer ring */}
      <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface-muted/50 p-3.5">
        <div className="flex flex-col">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            One-time code
          </span>
          <button
            type="button"
            onClick={handleCopyCode}
            className="group/code mt-0.5 flex items-center gap-3 text-left focus:outline-none"
            title="Click to copy code"
          >
            <span
              className={`font-mono text-2xl font-bold tracking-[0.14em] tabular-nums select-all transition-colors sm:text-[1.75rem] ${
                isExpiringSoon ? "text-danger" : "text-text-primary"
              }`}
            >
              {formattedCode}
            </span>
            <span
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-all ${
                copied
                  ? "bg-success-subtle text-success"
                  : "border border-border-subtle bg-surface text-text-muted shadow-2xs group-hover/code:border-brand/30 group-hover/code:text-brand"
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy
                </>
              )}
            </span>
          </button>
        </div>

        {/* Circular Countdown Progress Timer (like Microsoft Authenticator) */}
        <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
          <svg className="h-12 w-12 -rotate-90 transform" viewBox="0 0 36 36">
            <path
              className="text-border-subtle"
              strokeWidth="3.5"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
            <path
              className={`transition-all duration-1000 ease-linear ${timerColor}`}
              strokeDasharray="100, 100"
              strokeDashoffset={strokeDashoffset}
              strokeWidth="3.5"
              strokeLinecap="round"
              stroke="currentColor"
              fill="none"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
            />
          </svg>
          <span className={`absolute font-mono text-xs font-bold tabular-nums ${timerColor}`}>
            {remainingSeconds}s
          </span>
        </div>
      </div>

      {/* Bottom helper info & private security note */}
      <div className="mt-3 flex items-center justify-between text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Private to you · Never shared
        </span>
        {decryptedSecret && (
          <button
            type="button"
            onClick={() => setShowSecret((prev) => !prev)}
            className="inline-flex items-center gap-1 hover:text-text-primary transition-colors"
          >
            {showSecret ? (
              <>
                <EyeOff className="h-3 w-3" /> Hide Key
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" /> View Key
              </>
            )}
          </button>
        )}
      </div>

      {showSecret && decryptedSecret && (
        <div className="mt-2 rounded-md border border-border-subtle bg-surface-muted p-2 font-mono text-[11px] text-text-secondary break-all select-all">
          {decryptedSecret}
        </div>
      )}
    </Card>
  );
}
