"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Fingerprint, Lock, ShieldCheck, Key, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { useAppLock } from "./AppLockProvider";
import { usePasswordVault } from "@/lib/password-context";
import { deriveKey } from "@/lib/crypto";
import { CURRENT_PBKDF2_ITERATIONS } from "@/lib/constants";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  hashPin,
  getStoredPinHash,
  getStoredWrappedVaultKey,
  storeWrappedVaultKey,
  clearWrappedVaultKey,
  wrapCryptoKey,
  unwrapCryptoKey,
} from "@/lib/key-wrap";

type Mode = "select" | "pin" | "confirm-pin" | "master";

export function AppLockScreen() {
  const {
    status,
    isWebAuthnAvailable,
    hasPin,
    hasPasskey,
    setupWebAuthn,
    unlockWithWebAuthn,
    setupPin,
    unlockWithPin,
    unlock,
    loading: providerLoading,
  } = useAppLock();

  const { isUnlocked: vaultUnlocked, encryptionKey, unlockVault, lockVault } = usePasswordVault();

  const [mode, setMode] = useState<Mode>("select");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [showMasterPassword, setShowMasterPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSetup, setIsSetup] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const isFirstSetup = status === "idle";

  // App Lock protects the complete application, including the in-memory
  // credential decryption key. Locking the app must therefore lock the vault.
  useEffect(() => {
    if (status === "locked" || status === "idle") lockVault();
  }, [status, lockVault]);

  useEffect(() => {
    if (mode === "master") {
      inputRef.current?.focus();
    }
  }, [mode]);

  useEffect(() => {
    if (status === "locked") {
      const timer = setTimeout(() => {
        setPin("");
        setConfirmPin("");
        setMasterPassword("");
        setError("");
        if (hasPin) {
          setMode("pin");
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [status, hasPin]);

  // When the vault is unlocked via master password and a PIN exists, wrap the
  // vault encryption key with the PIN hash so PIN unlock can re-open the vault.
  useEffect(() => {
    if (!vaultUnlocked || !encryptionKey || !hasPin) return;
    const pinHash = getStoredPinHash();
    if (!pinHash) return;
    (async () => {
      try {
        const wrapped = await wrapCryptoKey(pinHash, encryptionKey);
        storeWrappedVaultKey(wrapped);
        // Sync wrapped key to server so all authorized devices can unwrap credentials with PIN
        await fetch("/api/user/app-lock", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ wrappedKey: wrapped }),
        }).catch(() => {});
      } catch (err) {
        console.error("Failed to wrap vault key with PIN:", err);
      }
    })();
  }, [vaultUnlocked, encryptionKey, hasPin]);

  const handleWebAuthn = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (isSetup) {
        await setupWebAuthn();
      } else {
        const success = await unlockWithWebAuthn();
        if (!success) {
          setError("Authentication failed. Please try again.");
        } else {
          const pinHash = getStoredPinHash();
          const wrapped = getStoredWrappedVaultKey();
          if (pinHash && wrapped) {
            try {
              const key = await unwrapCryptoKey(pinHash, wrapped);
              unlockVault(key, "", "");
            } catch {
              // Ignore unwrap error on WebAuthn
            }
          }
          unlock();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Biometric authentication failed.");
    } finally {
      setLoading(false);
    }
  }, [isSetup, setupWebAuthn, unlockWithWebAuthn, unlock, unlockVault]);

  const handleMasterPasswordUnlock = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/passwords/unlock", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ masterPassword }),
      });

      if (!response.ok) {
        const data = await response.json();
        if (data.locked) {
          setError(data.error || "Vault is temporarily locked. Try again later.");
          return;
        }
        throw new Error(data.error || "Invalid master password.");
      }

      const data = await response.json();
      const key = await deriveKey(
        masterPassword,
        data.encryptionSalt,
        data.kdfIterations ?? CURRENT_PBKDF2_ITERATIONS,
      );

      unlockVault(key, data.encryptionSalt, masterPassword);
      unlock();
      setMasterPassword("");
      setShowMasterPassword(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Master password unlock failed.");
    } finally {
      setLoading(false);
    }
  }, [masterPassword, unlockVault, unlock]);

  const handlePinSubmit = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      if (isSetup) {
        if (pin.length !== 4) {
          setError("PIN must be exactly 4 digits.");
          setLoading(false);
          return;
        }

        if (mode === "confirm-pin") {
          if (confirmPin !== pin) {
            setError("PINs do not match. Please try again.");
            setConfirmPin("");
            setMode("pin");
            setLoading(false);
            return;
          }
          await setupPin(pin);
          // If vault is unlocked, wrap its key with the new PIN hash for future
          // transparent vault unlock via PIN.
          if (vaultUnlocked && encryptionKey) {
            const pinHash = await hashPin(pin);
            const wrapped = await wrapCryptoKey(pinHash, encryptionKey);
            storeWrappedVaultKey(wrapped);
            await fetch("/api/user/app-lock", {
              method: "POST",
              headers: csrfHeaders({ "Content-Type": "application/json" }),
              body: JSON.stringify({ wrappedKey: wrapped }),
            }).catch(() => {});
          } else {
            clearWrappedVaultKey();
          }
          return;
        }

        setMode("confirm-pin");
        setError("");
      } else {
        if (pin.length !== 4) {
          setError("PIN must be exactly 4 digits.");
          setLoading(false);
          return;
        }

        const success = await unlockWithPin(pin);
        if (!success) {
          setError("Incorrect PIN. Please try again.");
          setPin("");
        } else {
          const wrapped = getStoredWrappedVaultKey();
          if (wrapped) {
            try {
              const pinHash = await hashPin(pin);
              const key = await unwrapCryptoKey(pinHash, wrapped);
              unlockVault(key, "", "");
            } catch {
              // Stale or incompatible wrap - remove to stop repeated unwrap failures
              clearWrappedVaultKey();
            }
          }
          unlock();
          setPin("");
          setConfirmPin("");
          setMasterPassword("");
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "PIN verification failed.");
    } finally {
      setLoading(false);
    }
  }, [
    isSetup,
    pin,
    confirmPin,
    mode,
    setupPin,
    unlockWithPin,
    vaultUnlocked,
    encryptionKey,
    unlockVault,
    unlock,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        if (e.nativeEvent.isComposing || e.keyCode === 229) return;
        if (mode === "master") {
          handleMasterPasswordUnlock();
        } else {
          handlePinSubmit();
        }
      }
    },
    [mode, handleMasterPasswordUnlock, handlePinSubmit],
  );

  // Handle keyboard input on desktop without popping up mobile virtual keyboard
  useEffect(() => {
    // Only intercept when AppLock is actually active/displayed
    if (status !== "locked" && status !== "idle") return;
    if (mode !== "pin" && mode !== "confirm-pin") return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if user is typing in another input, textarea, or contentEditable
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable ||
        Boolean(target?.closest?.("[contenteditable='true']"))
      ) {
        return;
      }

      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (mode === "confirm-pin") {
          setConfirmPin((prev) => (prev.length < 4 ? prev + e.key : prev));
        } else {
          setPin((prev) => (prev.length < 4 ? prev + e.key : prev));
        }
        setError("");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (mode === "confirm-pin") {
          setConfirmPin((prev) => prev.slice(0, -1));
        } else {
          setPin((prev) => prev.slice(0, -1));
        }
        setError("");
      } else if (e.key === "Enter") {
        if (e.isComposing || e.keyCode === 229) return;
        e.preventDefault();
        handlePinSubmit();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [status, mode, handlePinSubmit]);

  if (status === "unlocked" || providerLoading) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 p-4 backdrop-blur-md">
      <div className="w-full max-w-sm">
        <div className="card overflow-hidden p-0">
          <div className="relative border-b border-border-subtle bg-surface-muted px-6 pb-6 pt-7">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-[radial-gradient(circle_at_50%_-30%,var(--brand-wash),transparent_70%)]"
            />
            <div className="relative flex flex-col items-center text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl border border-brand/15 bg-brand text-white shadow-fluent-4">
                <Lock className="h-7 w-7" />
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                Vaulty
              </p>
              <h1 className="mt-1 text-[1.25rem] font-semibold tracking-tight text-text-primary">
                {isFirstSetup ? "Setup App Lock" : "Vaulty Locked"}
              </h1>
              <p className="mt-1 text-[12px] text-text-muted">
                {isFirstSetup ? "Choose how you want to unlock the app" : "Unlock to continue"}
              </p>
            </div>
          </div>

          <div className="p-5">
            {mode === "select" && (
              <div className="space-y-2">
                {isWebAuthnAvailable && !hasPasskey && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      setIsSetup(true);
                      handleWebAuthn();
                    }}
                    disabled={loading}
                  >
                    <Fingerprint className="w-5 h-5" />
                    <span>Setup Passkey / Biometrics</span>
                  </Button>
                )}

                {isWebAuthnAvailable && hasPasskey && (
                  <Button
                    variant="primary"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      setIsSetup(false);
                      handleWebAuthn();
                    }}
                    disabled={loading}
                  >
                    <Fingerprint className="w-5 h-5" />
                    <span>Use Passkey / Biometrics</span>
                  </Button>
                )}

                {!hasPin && (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      setIsSetup(true);
                      setMode("pin");
                    }}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>Setup PIN</span>
                  </Button>
                )}

                {hasPin && (
                  <Button
                    variant="secondary"
                    size="lg"
                    className="w-full"
                    onClick={() => {
                      setIsSetup(false);
                      setMode("pin");
                    }}
                  >
                    <ShieldCheck className="w-5 h-5" />
                    <span>Use PIN</span>
                  </Button>
                )}

                <Button
                  variant="secondary"
                  size="lg"
                  className="w-full"
                  onClick={() => {
                    setIsSetup(false);
                    setMode("master");
                  }}
                  disabled={loading}
                >
                  <Key className="w-5 h-5" />
                  <span>Use Master Password</span>
                </Button>

                <p className="pt-2 text-center text-[11px] leading-relaxed text-text-muted">
                  Your vault stays locked on this device until a passkey, PIN, or master password is
                  verified.
                </p>
              </div>
            )}

            {mode === "master" && (
              <div
                className="space-y-4"
                role="presentation"
                onClick={() => inputRef.current?.focus()}
              >
                <p className="text-center text-[12px] font-medium text-text-secondary">
                  Enter your master password to unlock
                </p>

                <div className="space-y-2">
                  <Label htmlFor="masterPassword">Master Password</Label>
                  <div className="relative">
                    <Input
                      id="masterPassword"
                      name="password"
                      type={showMasterPassword ? "text" : "password"}
                      autoComplete="current-password"
                      value={masterPassword}
                      onChange={(e) => {
                        setMasterPassword(e.target.value);
                        setError("");
                      }}
                      placeholder="Enter your master password"
                      className="pr-10"
                      autoFocus
                      onKeyDown={handleKeyDown}
                    />
                    <button
                      type="button"
                      onClick={() => setShowMasterPassword(!showMasterPassword)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    >
                      {showMasterPassword ? (
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

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handleMasterPasswordUnlock}
                  disabled={loading || masterPassword.length === 0}
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Unlocking...
                    </span>
                  ) : (
                    "Unlock"
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    setMode("select");
                    setMasterPassword("");
                    setError("");
                  }}
                  disabled={loading}
                >
                  Back
                </Button>
              </div>
            )}

            {(mode === "pin" || mode === "confirm-pin") && (
              <div className="space-y-4">
                <p className="text-center text-[12px] font-medium text-text-secondary">
                  {isSetup && mode === "confirm-pin"
                    ? "Confirm your 4-digit PIN"
                    : isSetup
                      ? "Create a 4-digit PIN"
                      : "Enter your PIN to unlock"}
                </p>

                <div className="flex justify-center gap-3">
                  {[0, 1, 2, 3].map((i) => {
                    const activeDots = mode === "confirm-pin" ? confirmPin.length : pin.length;
                    return (
                      <div
                        key={i}
                        className={`h-3.5 w-3.5 rounded-full border-2 transition-all ${
                          i < activeDots
                            ? "scale-110 border-brand bg-brand"
                            : "border-border bg-surface-muted"
                        }`}
                      />
                    );
                  })}
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {["1", "2", "3", "4", "5", "6", "7", "8", "9", "clear", "0", "del"].map((key) => {
                    const isAction = key === "clear" || key === "del";

                    const handleClick = () => {
                      if (key === "clear") {
                        if (mode === "confirm-pin") {
                          setConfirmPin("");
                        } else {
                          setPin("");
                        }
                        setError("");
                      } else if (key === "del") {
                        if (mode === "confirm-pin") {
                          setConfirmPin((prev) => prev.slice(0, -1));
                        } else {
                          setPin((prev) => prev.slice(0, -1));
                        }
                        setError("");
                      } else {
                        if (mode === "confirm-pin") {
                          setConfirmPin((prev) => {
                            if (prev.length >= 4) return prev;
                            return prev + key;
                          });
                        } else {
                          setPin((prev) => {
                            if (prev.length >= 4) return prev;
                            return prev + key;
                          });
                        }
                        setError("");
                      }
                    };

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={handleClick}
                        className={`h-14 rounded-lg border text-lg font-semibold transition-all active:scale-[0.97] ${
                          isAction
                            ? "border-transparent bg-transparent text-text-muted hover:bg-surface-muted hover:text-text-secondary"
                            : "border-border-subtle bg-surface text-text-primary shadow-fluent-2 hover:border-border hover:bg-surface-muted"
                        }`}
                      >
                        {key === "del" ? "⌫" : key === "clear" ? "C" : key}
                      </button>
                    );
                  })}
                </div>

                {error && (
                  <p className="text-center text-[12px] font-medium text-danger">{error}</p>
                )}

                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handlePinSubmit}
                  disabled={
                    loading || (mode === "confirm-pin" ? confirmPin.length < 4 : pin.length < 4)
                  }
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Processing...
                    </span>
                  ) : isSetup && mode === "confirm-pin" ? (
                    "Confirm PIN"
                  ) : (
                    "Continue"
                  )}
                </Button>

                {mode === "confirm-pin" && (
                  <Button
                    variant="ghost"
                    size="md"
                    className="w-full"
                    onClick={() => {
                      setMode("pin");
                      setConfirmPin("");
                      setError("");
                    }}
                    disabled={loading}
                  >
                    Back
                  </Button>
                )}

                {!isFirstSetup && mode !== "confirm-pin" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setMode("select");
                      setPin("");
                      setError("");
                    }}
                    disabled={loading}
                  >
                    Back
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          Protected by Vaulty App Lock
        </p>
      </div>
    </div>
  );
}
