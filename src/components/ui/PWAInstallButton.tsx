"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/Button";
import { Download, Share2, Info, ChevronDown, ChevronUp } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

interface InstallEnvironment {
  hasServiceWorkerSupport: boolean;
  isIos: boolean;
  isMobile: boolean;
  isSecureContext: boolean;
}

function detectEnvironment(): InstallEnvironment {
  const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const isIos =
    /iPhone|iPad|iPod/.test(userAgent) ||
    (typeof navigator !== "undefined" &&
      typeof navigator.platform === "string" &&
      /MacIntel/.test(navigator.platform) &&
      typeof (navigator as { standalone?: unknown }).standalone === "boolean");

  const isMobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/.test(userAgent);

  const hasServiceWorkerSupport = typeof navigator !== "undefined" && "serviceWorker" in navigator;

  const isSecureContext =
    typeof window !== "undefined" &&
    (window.isSecureContext || window.location.protocol === "https:");

  return {
    hasServiceWorkerSupport,
    isIos,
    isMobile,
    isSecureContext,
  };
}

export function PWAInstallButton({ className }: { className?: string }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
  );
  const [showHelp, setShowHelp] = useState(false);
  const [env] = useState<InstallEnvironment>(() => detectEnvironment());

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    const handleStandaloneChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setIsInstalled(true);
      }
    };

    mq.addEventListener("change", handleStandaloneChange);

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      mq.removeEventListener("change", handleStandaloneChange);
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const handleInstallClick = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choiceResult = await deferredPrompt.userChoice;
        if (choiceResult.outcome === "dismissed") {
          setDeferredPrompt(null);
        }
      } catch {
        setDeferredPrompt(null);
      }
    } else {
      setShowHelp((prev) => !prev);
    }
  }, [deferredPrompt]);

  const getHelpText = useCallback(() => {
    if (!env.isSecureContext) {
      return "Install is blocked because this page is not running in a secure context. Open the site on HTTPS.";
    }
    if (!env.hasServiceWorkerSupport) {
      return "This browser does not support the service worker features required for PWA install. Try Chrome, Edge, or Safari.";
    }
    if (env.isIos) {
      return "On iPhone or iPad, tap Share in Safari, then choose Add to Home Screen.";
    }
    return "If no install prompt appears yet, open the browser menu and look for Install app or Add to Home Screen after the page fully loads.";
  }, [env]);

  const getButtonLabel = useCallback(() => {
    if (deferredPrompt) return "Install App";
    if (!env.isSecureContext) return "Install Requires HTTPS";
    return "Install Not Supported";
  }, [deferredPrompt, env.isSecureContext]);

  const getIcon = useCallback(() => {
    if (deferredPrompt) return <Download className="w-4 h-4" aria-hidden="true" />;
    if (env.isIos) return <Share2 className="w-4 h-4" aria-hidden="true" />;
    return <Info className="w-4 h-4" aria-hidden="true" />;
  }, [deferredPrompt, env.isIos]);

  if (!env.isMobile || isInstalled) {
    return null;
  }

  return (
    <div className={`flex flex-col items-start gap-1 ${className || ""}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={handleInstallClick}
        aria-expanded={showHelp}
        aria-controls="pwa-install-help"
      >
        {getIcon()}
        <span>{getButtonLabel()}</span>
        {showHelp ? (
          <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </Button>

      {showHelp && (
        <p
          id="pwa-install-help"
          className="text-[11px] text-text-muted max-w-xs leading-relaxed"
          role="status"
          aria-live="polite"
        >
          {getHelpText()}
        </p>
      )}
    </div>
  );
}
