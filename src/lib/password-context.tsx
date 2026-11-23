"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

interface PasswordVaultContextType {
  isUnlocked: boolean;
  encryptionKey: CryptoKey | null;
  vaultSalt: string | null;
  masterPassword: string | null;
  unlockVault: (key: CryptoKey, salt: string, masterPassword: string) => void;
  lockVault: () => void;
}

const PasswordVaultContext = createContext<PasswordVaultContextType | undefined>(undefined);

const SESSION_VAULT_KEY = "vaulty_session_vault_key";
const SESSION_UNLOCKED_KEY = "vaulty_app_lock_session_unlocked";

// Store the key and master password in memory only (not persisted long-term for security)
let memoryKey: CryptoKey | null = null;
let memorySalt: string | null = null;
let memoryMasterPassword: string | null = null;

export function clearMemoryVault(): void {
  memoryKey = null;
  memorySalt = null;
  memoryMasterPassword = null;
  if (typeof window !== "undefined") {
    try {
      sessionStorage.removeItem(SESSION_VAULT_KEY);
    } catch {}
  }
}

export function PasswordVaultProvider({ children }: { children: ReactNode }) {
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(memoryKey);
  const [vaultSalt, setVaultSalt] = useState<string | null>(memorySalt);
  const [masterPassword, setMasterPassword] = useState<string | null>(memoryMasterPassword);
  const [isUnlocked, setIsUnlocked] = useState(!!memoryKey);

  const lockVault = useCallback(() => {
    memoryKey = null;
    memorySalt = null;
    memoryMasterPassword = null;
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_VAULT_KEY);
      } catch {}
    }
    setEncryptionKey(null);
    setVaultSalt(null);
    setMasterPassword(null);
    setIsUnlocked(false);
  }, []);

  const unlockVault = useCallback((key: CryptoKey, salt: string, masterPassword: string) => {
    memoryKey = key;
    memorySalt = salt;
    memoryMasterPassword = masterPassword;
    setEncryptionKey(key);
    setVaultSalt(salt);
    setMasterPassword(masterPassword);
    setIsUnlocked(true);

    if (typeof window !== "undefined") {
      try {
        crypto.subtle
          .exportKey("jwk", key)
          .then((jwk) => {
            sessionStorage.setItem(SESSION_VAULT_KEY, JSON.stringify(jwk));
          })
          .catch(() => {});
      } catch {}
    }
  }, []);

  // Restore session vault key if already unlocked in this browser session
  useEffect(() => {
    if (memoryKey || typeof window === "undefined") return;
    try {
      const isSessionUnlocked = sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true";
      const storedJwkStr = sessionStorage.getItem(SESSION_VAULT_KEY);
      if (isSessionUnlocked && storedJwkStr) {
        const jwk = JSON.parse(storedJwkStr);
        crypto.subtle
          .importKey("jwk", jwk, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
          .then((key) => {
            memoryKey = key;
            setEncryptionKey(key);
            setIsUnlocked(true);
          })
          .catch(() => {
            sessionStorage.removeItem(SESSION_VAULT_KEY);
          });
      }
    } catch {}
  }, []);

  // Auto-lock vault after 5 minutes of inactivity
  useEffect(() => {
    if (!isUnlocked) return;

    let inactivityTimer: NodeJS.Timeout;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(
        () => {
          lockVault();
        },
        5 * 60 * 1000,
      ); // 5 minutes
    };

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, resetTimer));

    resetTimer();

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isUnlocked, lockVault]);

  return (
    <PasswordVaultContext.Provider
      value={{
        isUnlocked,
        encryptionKey,
        vaultSalt,
        masterPassword,
        unlockVault,
        lockVault,
      }}
    >
      {children}
    </PasswordVaultContext.Provider>
  );
}

export function usePasswordVault() {
  const context = useContext(PasswordVaultContext);
  if (context === undefined) {
    throw new Error("usePasswordVault must be used within a PasswordVaultProvider");
  }
  return context;
}
