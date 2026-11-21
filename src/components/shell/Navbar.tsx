"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import {
  LogOut,
  User,
  Upload,
  ChevronDown,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  Building2,
  Globe,
  Wallet,
  Bell,
  Keyboard,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "./ThemeToggle";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { NotificationsBell } from "@/components/shell/NotificationsBell";
import { Dropdown, DropdownItem } from "@/components/ui/Dropdown";
import { PWAInstallButton } from "@/components/ui/PWAInstallButton";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { KeyboardShortcutsModal } from "@/components/shell/KeyboardShortcutsModal";

export function Navbar({
  onOpenUpload,
  isDriveConnected,
  sidebarCollapsed = false,
  onToggleSidebar,
}: {
  onOpenUpload?: () => void;
  isDriveConnected?: boolean;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}) {
  const { data: session } = useSession();
  const router = useRouter();
  const [showShortcutsModal, setShowShortcutsModal] = useState(false);
  const SidebarToggleIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <>
      <header className="command-bar fixed left-0 right-0 top-0 z-40 flex h-14 items-center justify-between px-3 sm:px-6">
        <div className="relative z-20 flex items-center gap-2">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-pressed={sidebarCollapsed}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand md:inline-flex"
            >
              <SidebarToggleIcon className="h-4 w-4" />
            </button>
          )}

          <Link href="/dashboard" className="group flex shrink-0 items-center gap-2.5">
            <VaultLogo size={28} className="shrink-0 text-brand" />
            <span className="text-[15px] font-semibold leading-4 tracking-tight text-text-primary">
              Vaulty
            </span>
          </Link>
        </div>

        {/* Desktop Centered Search (Triggers Omnibox Command Palette) */}
        <div className="absolute left-1/2 top-1/2 z-10 hidden w-full max-w-xs -translate-x-1/2 -translate-y-1/2 pointer-events-none sm:block sm:max-w-sm md:max-w-sm lg:max-w-md xl:max-w-lg">
          <div
            onClick={() => window.dispatchEvent(new CustomEvent("vaulty:open-command-palette"))}
            className="group relative flex items-center cursor-pointer pointer-events-auto"
          >
            <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-text-muted group-hover:text-text-primary transition-colors" />
            <input
              type="text"
              readOnly
              placeholder="Search vault..."
              className="input h-9 w-full rounded-xl pl-9 pr-18 text-[13px] shadow-sm transition-all cursor-pointer group-hover:border-border hover:bg-surface-muted/50"
              aria-label="Search your vault"
              title="Search documents, wealth, credentials, reminders (Ctrl+K)"
            />
            <kbd className="pointer-events-none absolute right-2.5 hidden rounded border border-border-subtle bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold text-text-muted sm:block">
              Ctrl + K
            </kbd>
          </div>
        </div>

        {/* Action icons right side */}
        <div className="relative z-20 flex shrink-0 items-center gap-1 sm:gap-2">
          {/* Mobile search toggle button (Triggers Omnibox Command Palette) */}
          <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("vaulty:open-command-palette"))}
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-muted hover:text-text-primary sm:hidden"
          >
            <Search className="h-4 w-4" />
          </button>

          <div className="hidden sm:inline-flex">
            <ThemeToggle />
          </div>
          <PWAInstallButton />

          {onOpenUpload && (
            <div className="inline-flex items-center rounded-lg shadow-sm">
              <button
                type="button"
                onClick={() => {
                  router.push("/documents");
                  onOpenUpload();
                }}
                disabled={!isDriveConnected}
                title={
                  isDriveConnected ? "Upload document to Vaulty" : "Connect Google Drive to upload"
                }
                className="btn btn-primary h-9 rounded-r-none border-r border-white/20 px-3 text-xs flex items-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Upload</span>
              </button>
              <Dropdown
                align="right"
                trigger={
                  <button
                    type="button"
                    aria-label="More creation actions"
                    title="Quick Actions"
                    className="btn btn-primary h-9 rounded-l-none px-2 text-xs flex items-center justify-center hover:bg-brand-hover"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                }
              >
                <div className="py-1">
                  <div className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    Quick Actions
                  </div>
                  <DropdownItem
                    onClick={() => {
                      router.push("/documents");
                      onOpenUpload();
                    }}
                  >
                    <Upload className="h-4 w-4 text-brand" />
                    <div className="flex flex-col text-left">
                      <span className="font-medium text-text-primary">Upload Document</span>
                      <span className="text-[11px] text-text-muted">Save & AI analysis</span>
                    </div>
                  </DropdownItem>
                  <DropdownItem href="/credentials?tab=BANK&action=new">
                    <Building2 className="h-4 w-4 text-brand" />
                    <div className="flex flex-col text-left">
                      <span className="font-medium text-text-primary">Add Bank Credential</span>
                      <span className="text-[11px] text-text-muted">Netbanking, PINs & ATM</span>
                    </div>
                  </DropdownItem>
                  <DropdownItem href="/credentials?tab=APP&action=new">
                    <Globe className="h-4 w-4 text-brand" />
                    <div className="flex flex-col text-left">
                      <span className="font-medium text-text-primary">Add App Credential</span>
                      <span className="text-[11px] text-text-muted">Website & app login</span>
                    </div>
                  </DropdownItem>
                  <DropdownItem href="/wealth/accounts?action=new">
                    <Wallet className="h-4 w-4 text-brand" />
                    <div className="flex flex-col text-left">
                      <span className="font-medium text-text-primary">Add Wealth Account</span>
                      <span className="text-[11px] text-text-muted">Bank, card, or asset</span>
                    </div>
                  </DropdownItem>
                  <DropdownItem href="/reminders?action=new">
                    <Bell className="h-4 w-4 text-brand" />
                    <div className="flex flex-col text-left">
                      <span className="font-medium text-text-primary">New Reminder</span>
                      <span className="text-[11px] text-text-muted">Due date, bill, or task</span>
                    </div>
                  </DropdownItem>
                </div>
              </Dropdown>
            </div>
          )}

          <NotificationsBell />

          <Dropdown
            trigger={
              <button
                type="button"
                aria-label="User menu"
                className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-surface-muted"
              >
                <UserAvatar
                  src={session?.user?.image}
                  name={session?.user?.name}
                  email={session?.user?.email}
                  size="sm"
                />
                <ChevronDown className="hidden h-3 w-3 text-text-muted sm:block" />
              </button>
            }
            align="right"
          >
            <div className="border-b border-border-subtle px-3 py-2.5">
              <p className="truncate text-[13px] font-semibold text-text-primary">
                {session?.user?.name || "User Account"}
              </p>
              <p className="truncate text-[11px] text-text-muted">{session?.user?.email}</p>
            </div>
            <DropdownItem href="/settings">
              <User className="h-4 w-4" />
              Account settings
            </DropdownItem>
            <DropdownItem onClick={() => setShowShortcutsModal(true)}>
              <Keyboard className="h-4 w-4" />
              Keyboard shortcuts
            </DropdownItem>
            <DropdownItem destructive onClick={() => signOut({ callbackUrl: "/" })}>
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownItem>
          </Dropdown>
        </div>
      </header>

      <KeyboardShortcutsModal
        open={showShortcutsModal}
        onClose={() => setShowShortcutsModal(false)}
      />
    </>
  );
}
