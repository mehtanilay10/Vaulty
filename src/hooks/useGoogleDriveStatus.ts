"use client";

import { useState, useEffect } from "react";

interface StatusCache {
  isConnected: boolean;
  timestamp: number;
}

let cachedStatus: StatusCache | null = null;
let inFlightFetch: Promise<boolean> | null = null;
const CACHE_TTL_MS = 30_000;

export function invalidateGoogleDriveStatus() {
  cachedStatus = null;
  inFlightFetch = null;
}

async function fetchDriveStatus(): Promise<boolean> {
  if (cachedStatus && Date.now() - cachedStatus.timestamp < CACHE_TTL_MS) {
    return cachedStatus.isConnected;
  }
  if (inFlightFetch) {
    return inFlightFetch;
  }

  inFlightFetch = (async () => {
    try {
      const res = await fetch("/api/integrations/google-drive/status");
      if (res.ok) {
        const data = await res.json();
        const connected = data.connection?.status === "CONNECTED";
        cachedStatus = { isConnected: connected, timestamp: Date.now() };
        return connected;
      }
      return false;
    } catch (err) {
      console.error("Failed to fetch Google Drive status:", err);
      return false;
    } finally {
      inFlightFetch = null;
    }
  })();

  return inFlightFetch;
}

export function useGoogleDriveStatus() {
  const [isConnected, setIsConnected] = useState<boolean>(() => {
    if (cachedStatus && Date.now() - cachedStatus.timestamp < CACHE_TTL_MS) {
      return cachedStatus.isConnected;
    }
    return false;
  });
  const [loading, setLoading] = useState<boolean>(() => {
    return !(cachedStatus && Date.now() - cachedStatus.timestamp < CACHE_TTL_MS);
  });

  useEffect(() => {
    let mounted = true;

    fetchDriveStatus().then((connected) => {
      if (mounted) {
        setIsConnected(connected);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return { isConnected, loading };
}
