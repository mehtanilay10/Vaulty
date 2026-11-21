"use client";

import { usePasswordVault } from "@/lib/password-context";
import { useAppLock } from "@/components/app-lock/AppLockProvider";

/** The vault key is memory-only. Users must unlock it explicitly after reload. */
export function useVaultAutoUnlock() {
  const { isUnlocked } = usePasswordVault();
  const { status: appLockStatus, enabled: appLockEnabled } = useAppLock();
  const appUnlocked = appLockStatus === "unlocked" || !appLockEnabled;
  return { isUnlocked, appUnlocked, appLockEnabled };
}
