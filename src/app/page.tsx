"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BellRing,
  Check,
  Cloud,
  FileText,
  Lock,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
  Wallet,
  Bot,
  Search,
  Download,
  KeyRound,
  Heart,
  StickyNote,
  Camera,
} from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import { SignInButton } from "@/components/auth/SignInButton";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { Vault3DShowcase } from "@/components/landing/Vault3DShowcase";
import { cn } from "@/lib/utils";

type PreviewTab = "overview" | "wealth" | "credentials" | "notes" | "ai";

const capabilities = [
  {
    number: "01",
    icon: FileText,
    title: "Documents, Camera Scan & Drive Sync",
    description:
      "Organize PDFs and scans in nested folders with mobile 4-corner perspective cropping, multi-page PDF stitching, append-page support, tags, and bidirectional Google Drive ownership.",
    detail: "Nested Folders · Perspective Crop Scan · Append Pages · Share Links",
    accent: "text-brand",
  },
  {
    number: "02",
    icon: Wallet,
    title: "Wealth & Multi-Currency Ledgers",
    description:
      "Track bank accounts, credit cards, mutual funds, stocks, and loans separately by currency with running balances, asset/liability breakdowns, CSV/XLSX/PDF imports, and account merging.",
    detail: "Multi-Currency Net Worth · Statement Import · Account Merge",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  {
    number: "03",
    icon: Lock,
    title: "Credentials, 2FA & App Lock",
    description:
      "Store app logins, banking PINs, and live 30s TOTP authenticator codes (with QR camera/image scan) secured by AES-256-GCM envelope encryption, App Lock PIN & Passkey sync, and offline recovery.",
    detail: "Envelope Encryption · TOTP Authenticator · PIN / Passkey Lock",
    accent: "text-purple-600 dark:text-purple-400",
  },
  {
    number: "04",
    icon: StickyNote,
    title: "Notes & Markdown Checklists",
    description:
      "Write in Rich Text, raw Markdown, or rendered GFM Preview with inline to-do checkboxes, clipboard screenshot paste, tables, color coding, sticky pinning, and auto-save.",
    detail: "TipTap Rich Text · Raw Markdown · Inline Checklists · Image Paste",
    accent: "text-teal-600 dark:text-teal-400",
  },
  {
    number: "05",
    icon: BellRing,
    title: "Reminders & Calendar View",
    description:
      "Stay ahead of passport renewals, policy expiries, credit-card payment dues, and recurring schedules in unified List & Calendar views via notification center, email, or Web Push.",
    detail: "Monthly Calendar Grid · Card Due & Expiry Discovery · Web Push",
    accent: "text-amber-600 dark:text-amber-400",
  },
  {
    number: "06",
    icon: Sparkles,
    title: "Document AI & Grounded Chat",
    description:
      "Gemini generates structured Markdown summaries, plain-language interpretations, OCR text, and confidence-scored date extraction—plus conversational Q&A grounded in your files.",
    detail: "Summaries & Interpretation · Date Review · Source Citations",
    accent: "text-cyan-600 dark:text-cyan-400",
  },
  {
    number: "07",
    icon: Mail,
    title: "Email Sync & PDF Unlocking",
    description:
      "Auto-discover transactions, invoices, and due dates from Gmail, Outlook, or your private forwarding address (@vaulty.mnilay.com) with in-process encrypted PDF statement decryption.",
    detail: "Gmail & Outlook · Inbound Forwarding · Local PDF Password Rules",
    accent: "text-indigo-600 dark:text-indigo-400",
  },
  {
    number: "08",
    icon: Users,
    title: "Granular Family Sharing",
    description:
      "Invite household members by email with strictly server-enforced read-only permissions scoped per module across Documents, Wealth, Credentials, Reminders, and Notes.",
    detail: "Per-Module Flags · Read-Only Enforcement · Instant Revocation",
    accent: "text-rose-600 dark:text-rose-400",
  },
  {
    number: "09",
    icon: Search,
    title: "Universal Omnibox & ZIP Takeout",
    description:
      "Jump to any file, folder, ledger, login, or reminder with Ctrl + K, or download a complete client-streamed .zip archive of your files, ledgers, and metadata anytime.",
    detail: "Ctrl + K Omnibox · Full Vault Search · Offline .zip Takeout",
    accent: "text-text-primary",
  },
];

const principles = [
  "Google OAuth & magic links",
  "Zero-knowledge credentials & 2FA",
  "Direct Google Drive + camera scan",
  "Email auto-sync & ZIP takeout",
];

const PREVIEW_TABS: { id: PreviewTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "wealth", label: "Wealth" },
  { id: "credentials", label: "Credentials & 2FA" },
  { id: "notes", label: "Notes" },
  { id: "ai", label: "Email Sync & AI" },
];

export default function LandingPage() {
  const { data: session, status } = useSession();
  const [previewTab, setPreviewTab] = useState<PreviewTab>("overview");
  const isLoggedIn = !!session?.user;

  const cta = isLoggedIn ? (
    <Link href="/dashboard" className="btn btn-primary h-11 px-5 text-[13.5px]">
      Open your vault <ArrowUpRight className="h-4 w-4" />
    </Link>
  ) : (
    <SignInButton />
  );

  return (
    <div className="min-h-screen bg-background text-text-primary">
      <header className="command-bar sticky top-0 z-40">
        <div className="mx-auto flex h-15 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link
            href="/"
            className="group flex shrink-0 items-center gap-2.5"
            aria-label="Vaulty home"
          >
            <VaultLogo size={28} className="shrink-0 text-brand" />
            <span className="text-[15.5px] font-semibold leading-4 tracking-tight text-text-primary">
              Vaulty
            </span>
          </Link>

          <nav
            className="hidden items-center gap-7 text-[13px] font-medium text-text-secondary md:flex"
            aria-label="Main navigation"
          >
            <a href="#your-space" className="transition-colors hover:text-text-primary">
              Workspace
            </a>
            <a href="#ecosystem" className="transition-colors hover:text-text-primary">
              Ecosystem
            </a>
            <a href="#features" className="transition-colors hover:text-text-primary">
              Capabilities
            </a>
            <a href="#privacy" className="transition-colors hover:text-text-primary">
              Architecture
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle />
            {isLoggedIn ? (
              <Link
                href="/dashboard"
                className="btn btn-secondary h-8.5 px-3 text-xs font-semibold"
              >
                Go to Vault <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : status !== "loading" ? (
              <Link
                href="/auth/signin"
                className="btn btn-secondary h-8.5 px-3.5 text-xs font-semibold"
              >
                Sign in <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden border-b border-border-subtle">
          <div
            className="atelier-grid-bg pointer-events-none absolute inset-0 opacity-45"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12">
            <div className="max-w-xl">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text-secondary shadow-fluent-2">
                <span className="h-1.5 w-1.5 rounded-full bg-success" />
                Personal &amp; Family Information Space
              </div>

              <h1 className="text-[2.5rem] font-semibold leading-[1.06] tracking-[-0.035em] text-text-primary sm:text-[3.35rem] lg:text-[3.75rem]">
                The important things in your life,{" "}
                <em className="font-editorial italic font-normal text-brand">kept together.</em>
              </h1>

              <p className="mt-5 max-w-lg text-[15px] leading-[1.7] text-text-secondary">
                Documents, client-encrypted credentials, wealth ledgers, and deadline reminders —
                unified in one quiet workspace backed by your Google Drive and AI-assisted
                understanding.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3.5">
                {cta}
                <a
                  href="#features"
                  className="inline-flex h-11 items-center gap-1.5 px-2 text-[13px] font-semibold text-text-secondary transition-colors hover:text-text-primary"
                >
                  Inspect capabilities <ArrowDownRight className="h-4 w-4" />
                </a>
              </div>

              <div
                className="mt-8 grid grid-cols-1 gap-y-2 gap-x-5 border-t border-border-subtle pt-5 sm:grid-cols-2"
                aria-label="Product principles"
              >
                {principles.map((principle) => (
                  <span
                    key={principle}
                    className="inline-flex items-center gap-2 text-[12px] font-medium text-text-secondary"
                  >
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                    {principle}
                  </span>
                ))}
              </div>
            </div>

            {/* Interactive Workspace Preview */}
            <div id="your-space" className="vaulty-3d-scene relative">
              <div className="vaulty-3d-stage vaulty-3d-tilt overflow-hidden rounded-xl border border-border bg-surface shadow-fluent-16">
                {/* Preview Top Bar */}
                <div className="flex items-center justify-between border-b border-border-subtle bg-surface-muted/60 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <VaultLogo size={20} className="text-brand" />
                    <span className="text-xs font-semibold text-text-primary">
                      Vaulty Workspace
                    </span>
                  </div>
                  <span className="inline-flex items-center gap-1.5 rounded border border-success/25 bg-success-subtle px-2 py-0.5 font-mono text-[10px] font-semibold text-success">
                    <LockKeyhole className="h-3 w-3" />
                    AES-256-GCM
                  </span>
                </div>

                {/* Interactive Switcher Tabs */}
                <div
                  role="tablist"
                  aria-label="Workspace preview modules"
                  className="flex items-center gap-1 overflow-x-auto border-b border-border-subtle bg-surface px-3 pt-2 scrollbar-hide"
                >
                  {PREVIEW_TABS.map((tab) => {
                    const active = previewTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        onClick={() => setPreviewTab(tab.id)}
                        className={cn(
                          "relative whitespace-nowrap px-3 py-2 text-[12px] font-semibold transition-colors",
                          active
                            ? "text-text-primary after:absolute after:inset-x-1.5 after:bottom-0 after:h-[2px] after:bg-brand"
                            : "text-text-muted hover:text-text-primary",
                        )}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {/* Preview Body */}
                <div className="p-4 sm:p-5">
                  {previewTab === "overview" && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Documents
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-text-primary">
                            148
                          </p>
                          <p className="text-[10px] text-brand">Drive synced</p>
                        </div>
                        <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Vault Keys
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-text-primary">
                            64
                          </p>
                          <p className="text-[10px] text-purple-600 dark:text-purple-400">
                            Client encrypted
                          </p>
                        </div>
                        <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Reminders
                          </p>
                          <p className="mt-1 font-mono text-lg font-semibold tabular-nums text-text-primary">
                            3
                          </p>
                          <p className="text-[10px] text-warning">Due this month</p>
                        </div>
                      </div>

                      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle">
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <FileText className="h-4 w-4 text-brand" />
                            <div>
                              <p className="text-xs font-semibold text-text-primary">
                                Health Policy Renewal 2027.pdf
                              </p>
                              <p className="text-[10.5px] text-text-muted">
                                Insurance · AI summary ready
                              </p>
                            </div>
                          </div>
                          <span className="rounded bg-warning-subtle px-1.5 py-0.5 font-mono text-[10px] font-semibold text-warning">
                            14d left
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            <div>
                              <p className="text-xs font-semibold text-text-primary">
                                Household Wealth Ledger
                              </p>
                              <p className="text-[10.5px] text-text-muted">
                                6 active accounts · Auto-synced
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Active
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <Users className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                            <div>
                              <p className="text-xs font-semibold text-text-primary">
                                Family Read-Only Access
                              </p>
                              <p className="text-[10.5px] text-text-muted">
                                Documents &amp; Reminders shared
                              </p>
                            </div>
                          </div>
                          <span className="font-mono text-[10px] text-text-muted">2 members</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewTab === "wealth" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            Net Position (INR)
                          </span>
                          <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                            Assets 89% · Liabilities 11%
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-2xl font-semibold tracking-tight tabular-nums text-text-primary">
                          ₹42,85,400
                        </p>
                        <div className="mt-2.5 flex h-1.5 overflow-hidden rounded-full bg-surface">
                          <div className="w-[89%] bg-emerald-600 dark:bg-emerald-400" />
                          <div className="w-[11%] bg-rose-500" />
                        </div>
                      </div>
                      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle text-xs">
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <span className="font-medium text-text-primary">
                            HDFC Savings Account
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-text-primary">
                            ₹14,20,000
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <span className="font-medium text-text-primary">Index Mutual Funds</span>
                          <span className="font-mono font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                            ₹31,45,400
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <span className="font-medium text-text-primary">
                            Sapphire Credit Card
                          </span>
                          <span className="font-mono font-semibold tabular-nums text-danger">
                            -₹2,80,000
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewTab === "credentials" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-purple-500/20 bg-purple-500/8 px-3.5 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <KeyRound className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          <div>
                            <p className="text-xs font-semibold text-text-primary">
                              Zero-Knowledge Key Unlocked
                            </p>
                            <p className="text-[10.5px] text-text-muted">
                              Decrypted only in local browser memory
                            </p>
                          </div>
                        </div>
                        <span className="font-mono text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                          600k PBKDF2
                        </span>
                      </div>
                      <div className="divide-y divide-border-subtle rounded-lg border border-border-subtle text-xs">
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <div>
                            <p className="font-semibold text-text-primary">Primary Netbanking</p>
                            <p className="font-mono text-[10.5px] text-text-muted">
                              Cust ID ••••8821 · ATM + UPI PIN
                            </p>
                          </div>
                          <span className="rounded border border-border-subtle bg-surface-muted px-2 py-0.5 font-mono text-[10px]">
                            Bank
                          </span>
                        </div>
                        <div className="flex items-center justify-between px-3.5 py-2.5">
                          <div>
                            <p className="font-semibold text-text-primary">2-Step Authenticator</p>
                            <p className="font-mono text-[11px] font-semibold tracking-widest text-brand">
                              482 910
                            </p>
                          </div>
                          <span className="font-mono text-[10px] text-text-muted">22s</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewTab === "notes" && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface-muted/50 px-3.5 py-2.5">
                        <div className="flex items-center gap-2">
                          <StickyNote className="h-4 w-4 text-teal-600 dark:text-teal-400" />
                          <span className="text-xs font-semibold text-text-primary">
                            Annual Tax &amp; Renewal Checklist
                          </span>
                        </div>
                        <span className="font-mono text-[10px] text-text-muted">
                          Rich · Markdown · Preview
                        </span>
                      </div>
                      <div className="space-y-2 rounded-lg border border-border-subtle p-3.5 text-xs">
                        <div className="flex items-center gap-2.5 text-text-muted line-through">
                          <span className="flex h-4 w-4 items-center justify-center rounded border border-success/40 bg-success-subtle text-success">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                          <span>Scan Form 16 &amp; append insurance receipt</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-text-primary font-medium">
                          <span className="h-4 w-4 rounded border border-border-strong bg-surface" />
                          <span>Verify health policy renewal date (14 Dec)</span>
                        </div>
                        <div className="flex items-center gap-2.5 text-text-primary font-medium">
                          <span className="h-4 w-4 rounded border border-border-strong bg-surface" />
                          <span>Share emergency folder with spouse</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {previewTab === "ai" && (
                    <div className="space-y-3">
                      <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-3.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold text-brand">
                          <span className="flex items-center gap-2">
                            <Bot className="h-3.5 w-3.5" />
                            Gemini Interpretation &amp; Chat
                          </span>
                          <span className="font-mono text-[10px] text-success">Date detected</span>
                        </div>
                        <p className="mt-1.5 text-xs leading-relaxed text-text-primary">
                          Your family health policy (#HLT-9042) renews on{" "}
                          <strong className="font-semibold">14 Dec 2026</strong> with a sum insured
                          of ₹15,00,000 and zero co-pay clause.
                        </p>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            <FileText className="h-3 w-3 text-brand" />
                            Policy_2026_Schedule.pdf
                          </span>
                          <span className="inline-flex items-center gap-1 rounded border border-border-subtle bg-surface px-2 py-0.5 text-[10px] font-medium text-text-secondary">
                            <Camera className="h-3 w-3 text-brand" />
                            Multi-page Scan
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between rounded-lg border border-border-subtle px-3.5 py-2.5 text-[11px] text-text-muted">
                        <span>Gmail, Outlook &amp; @vaulty.mnilay.com forwarding + PDF unlock</span>
                        <span className="font-mono text-[10px] font-semibold text-brand">
                          Email Sync
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Preview Bottom Bar */}
                <div className="flex items-center justify-between border-t border-border-subtle bg-surface-muted/40 px-4 py-2.5 text-[11px] text-text-muted">
                  <span className="flex items-center gap-1.5">
                    <Cloud className="h-3.5 w-3.5 text-brand" />
                    Direct Google Drive Storage
                  </span>
                  <span className="font-mono text-[10px]">One-click .zip takeout</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Interactive 3D Functional App Showcase */}
        <section id="ecosystem" className="border-b border-border-subtle bg-surface/35">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <div className="flex flex-col justify-between gap-4 pb-10 md:flex-row md:items-end">
              <div>
                <p className="section-eyebrow text-brand">Interactive Architecture</p>
                <h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-[2.6rem]">
                  Every module in motion,{" "}
                  <em className="font-editorial italic font-normal text-brand">under one roof.</em>
                </h2>
              </div>
              <p className="max-w-md text-[13.5px] leading-relaxed text-text-secondary">
                Inspect live 3D workflows across camera perspective scanning, TOTP authentication,
                multi-currency statement parsing, and inbox automation.
              </p>
            </div>

            <Vault3DShowcase />
          </div>
        </section>

        {/* Feature Capabilities Matrix */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <div className="flex flex-col justify-between gap-4 border-b border-border-subtle pb-8 md:flex-row md:items-end">
            <div>
              <p className="section-eyebrow text-brand">System Capabilities</p>
              <h2 className="mt-2 text-[2rem] font-semibold leading-[1.1] tracking-tight text-text-primary sm:text-[2.6rem]">
                Nine core modules.
                <br />
                <em className="font-editorial italic font-normal text-brand">
                  Zero compromise on custody.
                </em>
              </h2>
            </div>
            <p className="max-w-md text-[13.5px] leading-relaxed text-text-secondary">
              Built for households and individuals who want structured organization without handing
              over plaintext keys or vendor lock-in.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border-subtle md:grid-cols-2 lg:grid-cols-3">
            {capabilities.map(({ number, icon: Icon, title, description, detail, accent }) => (
              <article
                key={number}
                className="flex flex-col justify-between bg-surface p-6 transition-colors hover:bg-surface-muted/35"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[11px] font-semibold text-text-muted">
                      {number}
                    </span>
                    <Icon className={cn("h-4.5 w-4.5", accent)} strokeWidth={1.75} />
                  </div>
                  <h3 className="mt-5 text-[15.5px] font-semibold tracking-tight text-text-primary">
                    {title}
                  </h3>
                  <p className="mt-2 text-[13px] leading-relaxed text-text-secondary">
                    {description}
                  </p>
                </div>
                <p className="mt-5 border-t border-border-subtle pt-3 font-mono text-[10.5px] leading-relaxed text-text-muted">
                  {detail}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* Security & Privacy Dossier */}
        <section id="privacy" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6 md:pb-24">
          <div className="grid grid-cols-1 gap-8 rounded-2xl border border-border bg-surface p-6 shadow-fluent-4 sm:p-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <p className="section-eyebrow text-brand">Privacy is an architectural rule</p>
              <h2 className="mt-2 text-[1.9rem] font-semibold leading-[1.12] tracking-tight text-text-primary sm:text-[2.4rem]">
                Your records.{" "}
                <em className="font-editorial italic font-normal text-brand">
                  Your sovereign data.
                </em>
              </h2>
              <p className="mt-3 max-w-xl text-[13.5px] leading-relaxed text-text-secondary">
                Vaulty pairs private Google Drive storage, isolated server authorization checks,
                client-side envelope encryption, and offline recovery. Plaintext passwords never
                touch the database, and your complete archive exports anytime.
              </p>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  "Files stored directly in your personal Google Drive",
                  "Credentials encrypted locally with AES-256-GCM",
                  "600,000-round PBKDF2 key derivation + App Lock",
                  "64-char offline recovery key & security questions",
                  "Read-only family sharing with module isolation",
                  "One-click full ZIP takeout with CSV ledgers",
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-2.5 rounded-lg border border-border-subtle bg-surface-muted/40 p-3 text-[12.5px] leading-snug text-text-primary"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-[#111622] text-[#f2f0eb]">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
                <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#91b2fb]">
                  Security Specification
                </span>
                <ShieldCheck className="h-4 w-4 text-[#10b981]" />
              </div>
              <dl className="divide-y divide-white/10 text-xs">
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-[#9aa3b4]">Document backend</dt>
                  <dd className="font-mono font-semibold text-white">Google Drive</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-[#9aa3b4]">Credential cipher</dt>
                  <dd className="font-mono font-semibold text-white">AES-256-GCM</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-[#9aa3b4]">Key derivation</dt>
                  <dd className="font-mono font-semibold text-white">PBKDF2 · 600k</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-[#9aa3b4]">Device lock</dt>
                  <dd className="font-mono font-semibold text-white">PIN &amp; Passkey</dd>
                </div>
                <div className="flex items-center justify-between px-5 py-3">
                  <dt className="text-[#9aa3b4]">Full export</dt>
                  <dd className="flex items-center gap-1.5 font-mono font-semibold text-white">
                    <Download className="h-3.5 w-3.5 text-[#91b2fb]" />
                    Offline .zip
                  </dd>
                </div>
              </dl>
              <div className="border-t border-white/10 bg-white/[0.03] px-5 py-3.5 text-[11px] leading-relaxed text-[#a8b0c0]">
                Document AI processing is strictly user-triggered and private to your authorized
                vault scope.
              </div>
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="border-t border-border-subtle bg-surface/60">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <div>
              <p className="section-eyebrow text-brand">Get started</p>
              <h2 className="mt-1.5 text-[1.9rem] font-semibold tracking-tight text-text-primary sm:text-[2.4rem]">
                Keep what matters safe,{" "}
                <em className="font-editorial italic font-normal text-brand">
                  organized, and yours.
                </em>
              </h2>
            </div>
            <div className="flex flex-col items-start gap-2">
              {cta}
              <p className="text-xs text-text-muted">
                Sign in with Google or magic link to enter your vault.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle bg-surface py-12 text-sm text-text-muted">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            <div className="space-y-3">
              <Link href="/" className="group flex items-center gap-2.5">
                <VaultLogo size={24} className="text-brand shrink-0" />
                <span className="text-[15px] font-semibold tracking-tight text-text-primary">
                  Vaulty
                </span>
              </Link>
              <p className="text-xs text-text-secondary leading-relaxed">
                Private personal &amp; family space for documents, credentials, wealth records, and
                deadline reminders.
              </p>
            </div>

            <div>
              <p className="section-eyebrow">Modules</p>
              <ul className="mt-3 space-y-2 text-xs">
                <li>
                  <Link href="/documents" className="hover:text-text-primary transition-colors">
                    Documents &amp; Drive
                  </Link>
                </li>
                <li>
                  <Link href="/credentials" className="hover:text-text-primary transition-colors">
                    Encrypted Credentials
                  </Link>
                </li>
                <li>
                  <Link href="/wealth" className="hover:text-text-primary transition-colors">
                    Wealth Accounts
                  </Link>
                </li>
                <li>
                  <Link href="/email-sync" className="hover:text-text-primary transition-colors">
                    Inbound Forwarding
                  </Link>
                </li>
                <li>
                  <Link href="/notes" className="hover:text-text-primary transition-colors">
                    Notes &amp; Checklists
                  </Link>
                </li>
                <li>
                  <Link href="/reminders" className="hover:text-text-primary transition-colors">
                    Smart Reminders
                  </Link>
                </li>
                <li>
                  <Link href="/family" className="hover:text-text-primary transition-colors">
                    Family Sharing
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <p className="section-eyebrow">Security Architecture</p>
              <ul className="mt-3 space-y-2 text-xs text-text-secondary">
                <li>Envelope Encryption (AES-256-GCM)</li>
                <li>PBKDF2 Key Derivation (600,000 iterations)</li>
                <li>Zero-Knowledge Offline Recovery</li>
                <li>App Lock PIN &amp; Passkey</li>
                <li>One-Click Account Takeout (.zip)</li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-border-subtle pt-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
            <p className="text-left">© {new Date().getFullYear()} Vaulty. All rights reserved.</p>
            <p className="text-right">
              Made with{" "}
              <Heart className="mx-0.5 inline-block h-3.5 w-3.5 fill-rose-500 text-rose-500 align-text-bottom" />{" "}
              by{" "}
              <a
                href="https://mnilay.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-text-primary underline decoration-brand/50 underline-offset-4 transition-colors hover:text-brand"
              >
                Nilay Mehta
              </a>
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
