"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { useSession } from "next-auth/react";
import { csrfHeaders } from "@/lib/csrf-client";

type AppLockStatus = "idle" | "locked" | "unlocked";

interface AppLockContextValue {
  status: AppLockStatus;
  isLocked: boolean;
  enabled: boolean;
  setEnabled: (value: boolean) => void;
  setupWebAuthn: () => Promise<void>;
  unlockWithWebAuthn: () => Promise<boolean>;
  setupPin: (pin: string) => Promise<void>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  clearPin: () => Promise<void>;
  clearPasskey: () => Promise<void>;
  clearAllAppLock: () => Promise<void>;
  unlock: () => void;
  lock: () => void;
  isWebAuthnAvailable: boolean;
  hasPin: boolean;
  hasPasskey: boolean;
  loading: boolean;
}

const AppLockContext = createContext<AppLockContextValue | null>(null);

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
const PIN_STORAGE_KEY = "vaulty_app_lock_pin_hash";
const PASSKEY_STORAGE_KEY = "vaulty_app_lock_passkey_id";
const INITIALIZED_KEY = "vaulty_app_lock_initialized";
const ENABLED_KEY = "vaulty_app_lock_enabled";
const WRAPPED_VAULT_KEY = "vaulty_vault_wrapped_key";
const SESSION_UNLOCKED_KEY = "vaulty_app_lock_session_unlocked";
const LAST_ACTIVE_KEY = "vaulty_app_lock_last_active";

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function sha256(message: string): Promise<string> {
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const data = new TextEncoder().encode(message);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const bytes = new Uint8Array(hash);
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return fallbackHash(message);
}

function fallbackHash(message: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < message.length; i++) {
    const ch = message.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = (h2 >>> 0) * 4294967291 + (h1 >>> 0);
  return `fh_${combined.toString(16)}`;
}

async function createPasskey(userId: string, userName: string, userEmail: string): Promise<string> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const encodedUserId = new TextEncoder().encode(userId);

  const credential = (await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: "Vaulty",
        id: window.location.hostname,
      },
      user: {
        id: encodedUserId,
        name: userEmail,
        displayName: userName || userEmail,
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
      },
      timeout: 60000,
      attestation: "none",
    },
  })) as PublicKeyCredential;

  if (!credential || !credential.rawId) {
    throw new Error("Failed to create passkey");
  }

  const credentialId = bufferToBase64(credential.rawId);
  return credentialId;
}

async function getPasskey(credentialId: string): Promise<boolean> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [
        {
          type: "public-key",
          id: base64ToBuffer(credentialId),
        },
      ],
      userVerification: "required",
      timeout: 60000,
    },
  })) as PublicKeyCredential;

  return !!assertion;
}

export function AppLockProvider({ children }: { children: ReactNode }) {
  const { data: session } = useSession();
  const [status, setStatus] = useState<AppLockStatus>("idle");
  const [isWebAuthnAvailable, setIsWebAuthnAvailable] = useState(false);
  const [hasPin, setHasPin] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);
  const [enabled, setEnabledState] = useState(true);
  const [loading, setLoading] = useState(true);

  const userName = session?.user?.name || "Vaulty User";
  const userEmail = session?.user?.email || "user@vaulty.local";
  const userId = session?.user?.id || "vaulty-user";

  const lock = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
        sessionStorage.removeItem(LAST_ACTIVE_KEY);
      } catch {}
    }
    setStatus("locked");
  }, []);

  const unlock = useCallback(() => {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(SESSION_UNLOCKED_KEY, "true");
        sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
      } catch {}
    }
    setStatus("unlocked");
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const hasPasskeyStored =
      typeof window !== "undefined" && !!localStorage.getItem(PASSKEY_STORAGE_KEY);
    const hasPinStored = typeof window !== "undefined" && !!localStorage.getItem(PIN_STORAGE_KEY);
    const lockEnabled =
      typeof window !== "undefined" ? localStorage.getItem(ENABLED_KEY) !== "false" : true;
    const lastActiveStr =
      typeof window !== "undefined" ? sessionStorage.getItem(LAST_ACTIVE_KEY) : null;
    const lastActive = lastActiveStr ? Number(lastActiveStr) : 0;
    const isTimedOut = lastActive > 0 && Date.now() - lastActive > INACTIVITY_TIMEOUT_MS;

    if (isTimedOut && typeof window !== "undefined") {
      try {
        sessionStorage.removeItem(SESSION_UNLOCKED_KEY);
        sessionStorage.removeItem(LAST_ACTIVE_KEY);
      } catch {}
    }

    const isSessionUnlocked =
      typeof window !== "undefined" &&
      sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true" &&
      !isTimedOut;
    const webAuthnAvailable = typeof window !== "undefined" && !!navigator.credentials;

    setHasPasskey(hasPasskeyStored);
    setHasPin(hasPinStored);
    setEnabledState(lockEnabled);
    setIsWebAuthnAvailable(webAuthnAvailable);

    if (!lockEnabled || isSessionUnlocked) {
      setStatus("unlocked");
    } else if (hasPasskeyStored || hasPinStored) {
      setStatus("locked");
    } else {
      setStatus("idle");
    }

    setLoading(false);

    // Sync from server for cross-device consistency
    if (session?.user?.id) {
      fetch("/api/user/app-lock")
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.hasPin && data.pinHash) {
            localStorage.setItem(PIN_STORAGE_KEY, data.pinHash);
            localStorage.setItem(INITIALIZED_KEY, "true");
            if (data.wrappedKey) {
              localStorage.setItem(WRAPPED_VAULT_KEY, data.wrappedKey);
            } else {
              localStorage.removeItem(WRAPPED_VAULT_KEY);
            }
            setHasPin(true);
            const currentlyUnlocked =
              typeof window !== "undefined" &&
              sessionStorage.getItem(SESSION_UNLOCKED_KEY) === "true";
            if (lockEnabled && !currentlyUnlocked) {
              setStatus((prev) => (prev === "idle" ? "locked" : prev));
            }
          } else if (data && !data.hasPin) {
            localStorage.removeItem(PIN_STORAGE_KEY);
            localStorage.removeItem(WRAPPED_VAULT_KEY);
            setHasPin(false);
          }
        })
        .catch((err) => {
          console.warn("Could not sync app-lock configuration from server:", err);
        });
    }
  }, [session?.user?.id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const setEnabled = useCallback((value: boolean) => {
    setEnabledState(value);
    if (typeof window !== "undefined") {
      localStorage.setItem(ENABLED_KEY, String(value));
    }

    const hasPasskeyStored =
      typeof window !== "undefined" && !!localStorage.getItem(PASSKEY_STORAGE_KEY);
    const hasPinStored = typeof window !== "undefined" && !!localStorage.getItem(PIN_STORAGE_KEY);

    if (!value) {
      // Disabled: keep the app open.
      setStatus("unlocked");
    } else if (hasPasskeyStored || hasPinStored) {
      // Enabling App Lock takes effect immediately.
      setStatus("locked");
    } else {
      // Enabled but no method yet: show the setup flow immediately.
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (!enabled || status !== "unlocked") return;

    let inactivityTimer: NodeJS.Timeout;

    const recordActivity = () => {
      if (typeof window !== "undefined") {
        try {
          sessionStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
        } catch {}
      }
    };

    const resetInactivity = () => {
      clearTimeout(inactivityTimer);
      recordActivity();
      inactivityTimer = setTimeout(() => {
        lock();
      }, INACTIVITY_TIMEOUT_MS);
    };

    resetInactivity();

    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((event) => {
      document.addEventListener(event, resetInactivity, { passive: true });
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Tab backgrounded or reloading - record activity timestamp
        recordActivity();
      } else if (document.visibilityState === "visible") {
        // Tab returned - check if user was away longer than inactivity timeout
        const lastActiveStr =
          typeof window !== "undefined" ? sessionStorage.getItem(LAST_ACTIVE_KEY) : null;
        const lastActive = lastActiveStr ? Number(lastActiveStr) : 0;
        if (lastActive > 0 && Date.now() - lastActive > INACTIVITY_TIMEOUT_MS) {
          lock();
        } else {
          resetInactivity();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearTimeout(inactivityTimer);
      events.forEach((event) => {
        document.removeEventListener(event, resetInactivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [status, lock, enabled]);

  const setupWebAuthn = useCallback(async () => {
    const credentialId = await createPasskey(userId, userName, userEmail);
    localStorage.setItem(PASSKEY_STORAGE_KEY, credentialId);
    localStorage.setItem(INITIALIZED_KEY, "true");
    setHasPasskey(true);
    unlock();
  }, [unlock, userId, userName, userEmail]);

  const unlockWithWebAuthn = useCallback(async (): Promise<boolean> => {
    const storedId = localStorage.getItem(PASSKEY_STORAGE_KEY);
    if (!storedId) return false;

    try {
      const success = await getPasskey(storedId);
      if (success) {
        unlock();
        return true;
      }
    } catch (err) {
      console.error("WebAuthn unlock failed:", err);
    }
    return false;
  }, [unlock]);

  const setupPin = useCallback(
    async (pin: string) => {
      const hash = await sha256(pin);
      localStorage.setItem(PIN_STORAGE_KEY, hash);
      localStorage.setItem(INITIALIZED_KEY, "true");
      setHasPin(true);

      // Sync PIN hash to server so any other device (desktop/mobile) works with the exact same PIN!
      try {
        await fetch("/api/user/app-lock", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ pinHash: hash }),
        });
      } catch (err) {
        console.error("Failed to sync PIN hash to server:", err);
      }

      unlock();
    },
    [unlock],
  );

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const storedHash = localStorage.getItem(PIN_STORAGE_KEY);
      if (!storedHash) return false;
      const inputHash = await sha256(pin);
      if (inputHash !== storedHash) return false;
      unlock();
      return true;
    },
    [unlock],
  );

  const clearPin = useCallback(async () => {
    try {
      await fetch("/api/user/app-lock?action=pin", {
        method: "DELETE",
        headers: csrfHeaders(),
      });
    } catch (err) {
      console.error("Failed to clear PIN on server:", err);
    }
    localStorage.removeItem(PIN_STORAGE_KEY);
    localStorage.removeItem(WRAPPED_VAULT_KEY);
    setHasPin(false);
  }, []);

  const clearPasskey = useCallback(async () => {
    localStorage.removeItem(PASSKEY_STORAGE_KEY);
    setHasPasskey(false);
  }, []);

  const clearAllAppLock = useCallback(async () => {
    try {
      await fetch("/api/user/app-lock?action=all", {
        method: "DELETE",
        headers: csrfHeaders(),
      });
    } catch (err) {
      console.error("Failed to clear all app-lock on server:", err);
    }
    localStorage.removeItem(PIN_STORAGE_KEY);
    localStorage.removeItem(WRAPPED_VAULT_KEY);
    localStorage.removeItem(PASSKEY_STORAGE_KEY);
    localStorage.removeItem(INITIALIZED_KEY);
    setHasPin(false);
    setHasPasskey(false);
    setStatus("idle");
  }, []);

  return (
    <AppLockContext.Provider
      value={{
        status,
        isLocked: status === "locked" || status === "idle",
        enabled,
        setEnabled,
        setupWebAuthn,
        unlockWithWebAuthn,
        setupPin,
        unlockWithPin,
        clearPin,
        clearPasskey,
        clearAllAppLock,
        unlock,
        lock,
        isWebAuthnAvailable,
        hasPin,
        hasPasskey,
        loading,
      }}
    >
      {children}
    </AppLockContext.Provider>
  );
}

export function useAppLock() {
  const context = useContext(AppLockContext);
  if (!context) {
    throw new Error("useAppLock must be used within an AppLockProvider");
  }
  return context;
}
