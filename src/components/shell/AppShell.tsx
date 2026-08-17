"use client";

import { Navbar } from "@/components/shell/Navbar";
import { Sidebar } from "@/components/shell/Sidebar";
import { MobileNav } from "@/components/shell/MobileNav";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  onOpenUpload?: () => void;
}

export function AppShell({ children, onOpenUpload }: AppShellProps) {
  return (
    <div className="min-h-screen bg-background text-text-primary flex flex-col">
      <Navbar onOpenUpload={onOpenUpload} />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 pb-24 md:pb-6">
          {children}
        </main>
      </div>

      <MobileNav onOpenUpload={onOpenUpload} />
    </div>
  );
}
