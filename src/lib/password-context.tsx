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

// Store the key and master password in memory only (not persisted for security)
let memoryKey: CryptoKey | null = null;
let memorySalt: string | null = null;
let memoryMasterPassword: string | null = null;

export function clearMemoryVault(): void {
  memoryKey = null;
  memorySalt = null;
  memoryMasterPassword = null;
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
    setEncryptionKey(null);
    setVaultSalt(null);
    setMasterPassword(null);
    setIsUnlocked(false);
  }, []);

  const unlockVault = (key: CryptoKey, salt: string, masterPassword: string) => {
    memoryKey = key;
    memorySalt = salt;
    memoryMasterPassword = masterPassword;
    setEncryptionKey(key);
    setVaultSalt(salt);
    setMasterPassword(masterPassword);
    setIsUnlocked(true);
  };

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

  // Clear memory state on unmount or hot reload lifecycle events
  useEffect(() => {
    return () => {
      clearMemoryVault();
    };
  }, []);

  // Lock vault on page unload/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      lockVault();
      clearMemoryVault();
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [lockVault]);

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
