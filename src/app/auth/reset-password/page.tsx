"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import {
  Lock,
  Eye,
  EyeOff,
  KeyRound,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Loader2,
} from "lucide-react";
import { validateMasterPassword, generateSalt } from "@/lib/crypto";
import {
  deriveKEK,
  decryptEnvelopeWithKey,
  encryptEnvelopeWithKey,
  EncryptionEnvelope,
} from "@/lib/envelope-crypto";
import { unwrapRecoveryKEK, generateRecoveryKey, hashRecoveryAnswer } from "@/lib/key-recovery";
import { csrfHeaders } from "@/lib/csrf-client";

interface RecoveryStatus {
  isConfigured: boolean;
  hasRecoverySetup: boolean;
  credentialCount: number;
  questions: { id: string; question: string }[];
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [recoveryStatus, setRecoveryStatus] = useState<RecoveryStatus | null>(null);

  const [masterPassword, setMasterPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Recovery fields
  const [recoveryKey, setRecoveryKey] = useState("");
  const [answers, setAnswers] = useState<string[]>(["", "", ""]);

  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rekeyProgress, setRekeyProgress] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlToken = params.get("token") || "";
      setTimeout(() => setToken(urlToken), 0);
    }
  }, []);

  // Fetch vault status once token is available
  useEffect(() => {
    if (!token) return;

    let isMounted = true;
    fetch(`/api/passwords/recovery/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not retrieve vault recovery status");
        return res.json();
      })
      .then((data: RecoveryStatus) => {
        if (!isMounted) return;
        setRecoveryStatus(data);
        if (data.questions?.length) {
          setAnswers(new Array(data.questions.length).fill(""));
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        console.warn("Failed to load vault status:", err);
      })
      .finally(() => {
        if (isMounted) setLoadingStatus(false);
      });

    return () => {
      isMounted = false;
    };
  }, [token]);

  const isPopulated = (recoveryStatus?.credentialCount ?? 0) > 0;
  const hasRecovery = Boolean(recoveryStatus?.hasRecoverySetup);

  const handleStandardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const validation = validateMasterPassword(masterPassword);
    if (!validation.isValid) {
      setError(validation.errors.join(". "));
      return;
    }

    if (masterPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!token) {
      setError("Invalid reset link");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/passwords/reset/confirm", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ token, masterPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to reset password");
      }

      setSuccess(true);
      setMasterPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        router.push("/auth/signin");
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoveryRekeySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess(false);

    const validation = validateMasterPassword(masterPassword);
    if (!validation.isValid) {
      setError(validation.errors.join(". "));
      return;
    }

    if (masterPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    const cleanRecoveryKey = recoveryKey.trim();
    if (!/^[a-f0-9]{64}$/i.test(cleanRecoveryKey)) {
      setError("Please enter a valid 64-character hexadecimal recovery key");
      return;
    }

    for (let i = 0; i < answers.length; i++) {
      if (!answers[i]?.trim()) {
        setError(`Please answer question ${i + 1}`);
        return;
      }
    }

    setIsSubmitting(true);
    setRekeyProgress("Verifying recovery key and questions...");

    try {
      // 1. Verify recovery key and security questions on server
      const verifyRes = await fetch("/api/passwords/recovery/verify", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          token,
          recoveryKey: cleanRecoveryKey,
          answers: answers.map((a) => a.trim()),
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Failed to verify recovery credentials.");
      }

      setRekeyProgress("Decrypting vault key in browser...");

      // 2. Unwrap old KEK using recovery key and stored salt/iv
      const oldKEK = await unwrapRecoveryKEK({
        recoveryKey: cleanRecoveryKey,
        recoverySalt: verifyData.recoverySalt,
        recoveryIv: verifyData.recoveryIv,
        recoveryEncryptedKEK: verifyData.recoveryEncryptedKEK,
        recoveryKdfIterations: verifyData.recoveryKdfIterations,
      });

      setRekeyProgress("Decrypting and re-encrypting saved credentials...");

      // 3. Decrypt all credentials with oldKEK and re-encrypt with newKEK
      const newSalt = await generateSalt();
      const newKEK = await deriveKEK(masterPassword, newSalt);

      const helperDecrypt = async (
        ciphertext: string | null | undefined,
      ): Promise<string | null> => {
        if (!ciphertext) return null;
        try {
          const envelope = JSON.parse(ciphertext) as EncryptionEnvelope;
          return await decryptEnvelopeWithKey(envelope, oldKEK);
        } catch {
          return null;
        }
      };

      const helperEncrypt = async (plain: string | null): Promise<string | null> => {
        if (plain === null || plain === undefined) return null;
        const envelope = await encryptEnvelopeWithKey(plain, newKEK, newSalt);
        return JSON.stringify(envelope);
      };

      // App credentials
      const rawApps = (verifyData.appCredentials || []) as Array<{
        id: string;
        name: string;
        url?: string | null;
        username: string;
        password: string;
        icon?: string | null;
        iconColor?: string | null;
      }>;

      const reencryptedApps = [];
      for (const app of rawApps) {
        const decryptedName = await helperDecrypt(app.name);
        const decryptedUrl = app.url ? await helperDecrypt(app.url) : null;
        const decryptedUsername = await helperDecrypt(app.username);
        const decryptedPassword = await helperDecrypt(app.password);

        if (!decryptedName || !decryptedUsername || !decryptedPassword) {
          throw new Error(
            `Failed to decrypt application credential: ${app.id}. Please ensure your recovery key is correct.`,
          );
        }

        reencryptedApps.push({
          id: app.id,
          name: (await helperEncrypt(decryptedName))!,
          url: decryptedUrl ? await helperEncrypt(decryptedUrl) : null,
          username: (await helperEncrypt(decryptedUsername))!,
          password: (await helperEncrypt(decryptedPassword))!,
          icon: app.icon || null,
          iconColor: app.iconColor || null,
        });
      }

      // Bank credentials
      const rawBanks = (verifyData.bankCredentials || []) as Array<{
        id: string;
        name: string;
        username: string;
        netbankPassword?: string | null;
        atmPin?: string | null;
        upiPin?: string | null;
        mobileAppPin?: string | null;
        mobileTransactionPin?: string | null;
        icon?: string | null;
        iconColor?: string | null;
      }>;

      const reencryptedBanks = [];
      for (const bank of rawBanks) {
        const decName = await helperDecrypt(bank.name);
        const decUsername = await helperDecrypt(bank.username);
        if (!decName || !decUsername) {
          throw new Error(
            `Failed to decrypt banking credential: ${bank.id}. Please ensure your recovery key is correct.`,
          );
        }

        const decNetbank = bank.netbankPassword ? await helperDecrypt(bank.netbankPassword) : null;
        const decAtm = bank.atmPin ? await helperDecrypt(bank.atmPin) : null;
        const decUpi = bank.upiPin ? await helperDecrypt(bank.upiPin) : null;
        const decAppPin = bank.mobileAppPin ? await helperDecrypt(bank.mobileAppPin) : null;
        const decTxPin = bank.mobileTransactionPin
          ? await helperDecrypt(bank.mobileTransactionPin)
          : null;

        reencryptedBanks.push({
          id: bank.id,
          name: (await helperEncrypt(decName))!,
          username: (await helperEncrypt(decUsername))!,
          netbankPassword: decNetbank ? await helperEncrypt(decNetbank) : null,
          atmPin: decAtm ? await helperEncrypt(decAtm) : null,
          upiPin: decUpi ? await helperEncrypt(decUpi) : null,
          mobileAppPin: decAppPin ? await helperEncrypt(decAppPin) : null,
          mobileTransactionPin: decTxPin ? await helperEncrypt(decTxPin) : null,
          icon: bank.icon || null,
          iconColor: bank.iconColor || null,
        });
      }

      setRekeyProgress("Updating recovery key wrapping...");

      // Re-wrap new KEK with the same offline recovery key
      const newRecovery = await generateRecoveryKey(newKEK, cleanRecoveryKey);
      const hashedAnswers = await Promise.all(
        (recoveryStatus?.questions || []).map(async (q, idx) => ({
          id: q.id,
          question: q.question,
          answerHash: await hashRecoveryAnswer(answers[idx].trim()),
        })),
      );

      setRekeyProgress("Submitting re-keyed vault to server...");

      const rekeyRes = await fetch("/api/passwords/recovery/rekey", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          token,
          recoveryKey: cleanRecoveryKey,
          answers: answers.map((a) => a.trim()),
          newMasterPassword: masterPassword,
          newEncryptionSalt: newSalt,
          appCredentials: reencryptedApps,
          bankCredentials: reencryptedBanks,
          newRecoverySetup: {
            recoveryKeyId: newRecovery.keyId,
            recoveryKeyHash: await hashRecoveryAnswer(cleanRecoveryKey),
            recoveryEncryptedKEK: newRecovery.encryptedKEK,
            recoverySalt: newRecovery.salt,
            recoveryIv: newRecovery.iv,
            recoveryKdfIterations: newRecovery.kdfIterations,
            recoveryQuestions: hashedAnswers,
          },
        }),
      });

      const rekeyData = await rekeyRes.json();
      if (!rekeyRes.ok) {
        throw new Error(rekeyData.error || "Failed to commit re-keyed vault.");
      }

      setSuccess(true);
      setMasterPassword("");
      setConfirmPassword("");
      setRecoveryKey("");

      setTimeout(() => {
        router.push("/auth/signin");
      }, 2000);
    } catch (err) {
      console.error("Recovery rekey error:", err);
      setError(err instanceof Error ? err.message : "Failed to re-key credential vault.");
    } finally {
      setIsSubmitting(false);
      setRekeyProgress("");
    }
  };

  const validToken = Boolean(token);

  if (!validToken) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
        <div className="max-w-md w-full">
          <Alert variant="danger">
            <p className="text-sm">
              Invalid or missing reset token. Please request a new master password reset link.
            </p>
          </Alert>
          <div className="mt-4 flex justify-end">
            <Button onClick={() => router.push("/auth/signin")}>Back to sign in</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      <div className="max-w-lg w-full">
        {success ? (
          <div className="text-center py-8 bg-surface rounded-xl border border-border-subtle p-6 shadow-fluent-2">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success-subtle text-success">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-semibold text-text-primary">
              Master Password Reset Successfully
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              {isPopulated
                ? `Your master password has been reset and all ${recoveryStatus?.credentialCount} encrypted credentials were recovered and re-encrypted.`
                : "Your master password has been reset. You can now unlock your vault with your new password."}
            </p>
            <div className="mt-6">
              <Button onClick={() => router.push("/auth/signin")} className="w-full">
                Continue to sign in
              </Button>
            </div>
          </div>
        ) : loadingStatus ? (
          <div className="flex flex-col items-center justify-center py-12 bg-surface rounded-xl border border-border-subtle p-6">
            <Loader2 className="h-8 w-8 animate-spin text-brand" />
            <p className="mt-3 text-sm text-text-muted">Checking vault encryption status...</p>
          </div>
        ) : isPopulated && !hasRecovery ? (
          <div className="bg-surface rounded-xl border border-border-subtle p-6 shadow-fluent-2 space-y-4">
            <div className="flex items-center gap-3 text-danger">
              <AlertTriangle className="h-6 w-6 shrink-0" />
              <h2 className="text-lg font-semibold text-text-primary">
                Encrypted Data Protection Lock
              </h2>
            </div>
            <Alert variant="danger">
              <p className="text-sm">
                This vault contains{" "}
                <strong>{recoveryStatus?.credentialCount} encrypted credentials</strong>, but
                offline recovery questions were not configured for this account.
              </p>
            </Alert>
            <p className="text-sm text-text-secondary">
              Vaulty employs strict zero-knowledge envelope encryption. Without the current master
              password or an established recovery setup, resetting the master password would render
              your existing credentials permanently unreadable.
            </p>
            <p className="text-sm text-text-muted">
              If you remember your master password, sign in and use Settings → Master password to
              change your password safely.
            </p>
            <div className="pt-2 flex justify-end">
              <Button onClick={() => router.push("/auth/signin")}>Back to sign in</Button>
            </div>
          </div>
        ) : isPopulated && hasRecovery ? (
          // Populated Vault Recovery Re-key Form
          <div className="bg-surface rounded-xl border border-border-subtle p-6 shadow-fluent-2 space-y-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-subtle text-brand">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">
                  Recover & Re-key Credential Vault
                </h2>
                <p className="text-xs text-text-muted">
                  {recoveryStatus?.credentialCount} encrypted items will be safely re-encrypted
                </p>
              </div>
            </div>

            <Alert variant="info">
              <p className="text-xs leading-relaxed">
                Vaulty protects your data with end-to-end zero-knowledge encryption. Enter your
                64-character offline recovery key and security answers to decrypt your vault in your
                browser and re-encrypt all credentials under your new master password.
              </p>
            </Alert>

            <form onSubmit={handleRecoveryRekeySubmit} className="space-y-4">
              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="masterPassword">New Master Password</Label>
                <div className="relative">
                  <Input
                    id="masterPassword"
                    type={showPassword ? "text" : "password"}
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    placeholder="Create a strong master password"
                    className="pr-10"
                    disabled={isSubmitting}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Master Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new master password"
                    className="pr-10"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Offline Recovery Key */}
              <div className="space-y-2 pt-2 border-t border-border-subtle">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-brand" />
                  <Label htmlFor="recoveryKey">64-Character Offline Recovery Key</Label>
                </div>
                <Input
                  id="recoveryKey"
                  type="text"
                  value={recoveryKey}
                  onChange={(e) =>
                    setRecoveryKey(e.target.value.toLowerCase().replace(/[^a-f0-9]/g, ""))
                  }
                  placeholder="e.g. 7f8a9b..."
                  maxLength={64}
                  className="font-mono text-xs"
                  disabled={isSubmitting}
                />
                <p className="text-[11px] text-text-muted">
                  The hexadecimal recovery key saved when you set up vault recovery.
                </p>
              </div>

              {/* Recovery Questions */}
              <div className="space-y-3 pt-2 border-t border-border-subtle">
                <div className="flex items-center gap-1.5">
                  <HelpCircle className="h-4 w-4 text-brand" />
                  <Label>Security Questions</Label>
                </div>

                {recoveryStatus?.questions.map((q, idx) => (
                  <div key={q.id} className="space-y-1.5">
                    <p className="text-xs font-medium text-text-secondary">
                      {idx + 1}. {q.question}
                    </p>
                    <Input
                      type="text"
                      value={answers[idx] || ""}
                      onChange={(e) => {
                        const updated = [...answers];
                        updated[idx] = e.target.value;
                        setAnswers(updated);
                      }}
                      placeholder="Your answer"
                      disabled={isSubmitting}
                    />
                  </div>
                ))}
              </div>

              {error && (
                <Alert variant="danger">
                  <p className="text-xs">{error}</p>
                </Alert>
              )}

              {isSubmitting && rekeyProgress && (
                <div className="flex items-center gap-2 p-3 bg-brand-subtle/50 rounded-lg text-xs font-medium text-brand">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>{rekeyProgress}</span>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/auth/signin")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Re-keying Vault..." : "Re-key & Reset Password"}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          // Empty Vault Standard Reset Form
          <div className="bg-surface rounded-xl border border-border-subtle p-6 shadow-fluent-2 space-y-4">
            <form onSubmit={handleStandardSubmit} className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-subtle text-brand">
                  <Lock className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">Reset Master Password</h2>
                  <p className="text-xs text-text-muted">Enter your new master password.</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="masterPassword">New Master Password</Label>
                <div className="relative">
                  <Input
                    id="masterPassword"
                    type={showPassword ? "text" : "password"}
                    value={masterPassword}
                    onChange={(e) => setMasterPassword(e.target.value)}
                    placeholder="Create a strong master password"
                    className="pr-10"
                    disabled={isSubmitting}
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-xs text-text-muted">
                  Minimum 8 characters, with uppercase, lowercase, number, and special character.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Master Password</Label>
                <div className="relative">
                  <Input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your new master password"
                    className="pr-10"
                    disabled={isSubmitting}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                  >
                    {showConfirmPassword ? (
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
                  onClick={() => router.push("/auth/signin")}
                  disabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Resetting..." : "Reset Password"}
                </Button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
