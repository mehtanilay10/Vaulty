"use client";

import { useState, useEffect } from "react";

export function useGoogleDriveStatus() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function fetchStatus() {
      try {
        const res = await fetch("/api/integrations/google-drive/status");
        if (res.ok) {
          const data = await res.json();
          if (mounted) {
            setIsConnected(data.connection?.status === "CONNECTED");
          }
        }
      } catch (err) {
        console.error("Failed to fetch Google Drive status:", err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return { isConnected, loading };
}
