"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { BellRing, BellOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Alert } from "@/components/ui/Alert";
import { csrfHeaders } from "@/lib/csrf-client";

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function PushNotificationSetup() {
  const supported = useSyncExternalStore(
    () => () => {},
    () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
    () => false,
  );
  const iosNeedsInstall = useSyncExternalStore(
    () => () => {},
    () => {
      const isIos =
        /iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      return isIos && !standalone;
    },
    () => false,
  );
  const [configured, setConfigured] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    fetch("/api/push/subscription", { cache: "no-store" })
      .then((response) => response.json())
      .then(async (data) => {
        setConfigured(Boolean(data.enabled && data.publicKey));
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        setSubscribed(Boolean(subscription));
      })
      .catch(() => setError("Could not check browser notification settings."));
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const status = await Notification.requestPermission();
      if (status !== "granted")
        throw new Error("Allow notifications in your browser to enable push alerts.");
      const configResponse = await fetch("/api/push/subscription", { cache: "no-store" });
      const config = await configResponse.json();
      if (!configResponse.ok || !config.enabled || !config.publicKey)
        throw new Error(config.error || "Browser push is not configured on this server.");
      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(config.publicKey),
      });
      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(subscription.toJSON()),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not enable browser notifications.");
      setSubscribed(true);
      setMessage("Browser notifications are enabled on this device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not enable browser notifications.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Could not remove this device subscription.");
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Browser notifications are disabled on this device.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not disable browser notifications.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-brand/15 bg-brand-subtle text-brand">
          <BellRing className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-text-primary">Browser push notifications</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Get Vaulty alerts even when the app is not open, on this device and browser.
          </p>
        </div>
      </div>
      {supported && configured && !iosNeedsInstall ? (
        subscribed ? (
          <Button size="sm" variant="secondary" onClick={disable} disabled={busy}>
            <BellOff className="mr-1.5 h-4 w-4" />
            {busy ? "Updating…" : "Disable on this device"}
          </Button>
        ) : (
          <Button size="sm" onClick={enable} disabled={busy}>
            <BellRing className="mr-1.5 h-4 w-4" />
            {busy ? "Enabling…" : "Enable notifications"}
          </Button>
        )
      ) : (
        <span className="text-xs text-text-muted">
          {iosNeedsInstall
            ? "On iPhone or iPad, add Vaulty to your Home Screen and open the installed app to enable push notifications (iOS/iPadOS 16.4 or later)."
            : !supported
              ? "This browser does not support push notifications."
              : "Server push configuration is required."}
        </span>
      )}
      {message && (
        <div className="basis-full">
          <Alert variant="success">{message}</Alert>
        </div>
      )}
      {error && (
        <div className="basis-full">
          <Alert variant="danger">{error}</Alert>
        </div>
      )}
    </section>
  );
}
