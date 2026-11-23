"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/shell/Navbar";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNav } from "@/components/shell/MobileNav";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { OfflineBanner } from "@/components/shell/OfflineBanner";
import { AppFooter } from "@/components/shell/AppFooter";
import { useGoogleDriveStatus } from "@/hooks/useGoogleDriveStatus";
import { useUpload } from "@/app/contexts/UploadContext";

const CameraScanModal = dynamic(
  () => import("@/components/documents/CameraScanModal").then((mod) => mod.CameraScanModal),
  { ssr: false },
);

const SIDEBAR_STORAGE_KEY = "vaulty-sidebar-collapsed";
const SIDEBAR_CHANGE_EVENT = "vaulty-sidebar-changed";

function subscribeSidebar(callback: () => void) {
  const handler = () => callback();
  window.addEventListener("storage", handler);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, handler);
  };
}

function getSidebarSnapshot() {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function getSidebarServerSnapshot() {
  return false;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { isConnected } = useGoogleDriveStatus();
  const { openUpload, isCameraOpen, openCamera, closeCamera, activeFolderId } = useUpload();
  const sidebarCollapsed = useSyncExternalStore(
    subscribeSidebar,
    getSidebarSnapshot,
    getSidebarServerSnapshot,
  );

  const toggleSidebar = () => {
    const next = !sidebarCollapsed;
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next));
    } catch {
      // The control still works for the current session.
    }
    window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
  };

  return (
    <div className="app-shell-root flex min-h-[calc(100svh-5.5rem)] flex-col bg-background text-text-primary">
      <Navbar
        onOpenUpload={openUpload}
        onOpenScan={openCamera}
        isDriveConnected={isConnected}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />
      <OfflineBanner />

      <div className="flex flex-1 pt-14">
        <Sidebar collapsed={sidebarCollapsed} />

        <main
          className={`flex min-h-[calc(100vh-3.5rem)] flex-col justify-between min-w-0 flex-1 pb-20 transition-[margin] duration-200 md:pb-0 ${sidebarCollapsed ? "md:ml-[4.75rem]" : "md:ml-64"}`}
        >
          <div className="mx-auto w-full max-w-[1560px] px-3.5 py-5 sm:px-6 md:py-8 lg:px-9 flex-1">
            <div className="animate-fade-up space-y-6 sm:space-y-7">{children}</div>
          </div>
          <AppFooter className="mt-auto" />
        </main>
      </div>

      <MobileNav onOpenUpload={openUpload} onOpenScan={openCamera} isDriveConnected={isConnected} />
      <CommandPalette />
      <CameraScanModal
        isOpen={isCameraOpen}
        onClose={closeCamera}
        initialFolderId={activeFolderId}
      />
    </div>
  );
}
