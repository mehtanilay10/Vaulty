"use client";

import { useState, useEffect } from "react";
import {
  BellRing,
  Bot,
  Camera,
  Check,
  Cloud,
  FileText,
  FolderOpen,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  StickyNote,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SceneId = "scan" | "vault" | "wealth" | "automation";

interface SceneMeta {
  id: SceneId;
  title: string;
  eyebrow: string;
  icon: React.ElementType;
  accent: string;
  summary: string;
  highlights: string[];
}

const SCENES: SceneMeta[] = [
  {
    id: "scan",
    title: "Camera Scan & Document AI",
    eyebrow: "Drive + Gemini Extraction",
    icon: Camera,
    accent: "text-brand",
    summary:
      "Capture physical papers with 4-corner perspective cropping, stitch pages into PDFs on Google Drive, and extract AI summaries plus confidence-scored renewal dates.",
    highlights: [
      "4-corner perspective crop & B&W enhancement",
      "Append new scans directly to existing PDFs",
      "Auto-create reminders from ≥ 85% confidence dates",
    ],
  },
  {
    id: "vault",
    title: "Credentials, 2FA & App Lock",
    eyebrow: "Zero-Knowledge Browser Crypto",
    icon: Lock,
    accent: "text-purple-600 dark:text-purple-400",
    summary:
      "Decrypt app passwords, banking PINs, and live 30-second TOTP codes solely in browser memory—unlocked seamlessly across devices via a 4-digit PIN or Passkey.",
    highlights: [
      "AES-256-GCM envelope encryption + 600k PBKDF2",
      "QR camera & image scanner for 2FA setup",
      "Offline 64-char key & security question recovery",
    ],
  },
  {
    id: "wealth",
    title: "Wealth & Statement Parsing",
    eyebrow: "Multi-Currency Precision",
    icon: Wallet,
    accent: "text-emerald-600 dark:text-emerald-400",
    summary:
      "Track savings, credit cards, mutual funds, stocks, and loans per currency while unlocking password-protected PDF bank statements strictly in-process.",
    highlights: [
      "Strict ISO currency separation (never mixed)",
      "CSV, XLSX & encrypted PDF statement imports",
      "Automatic credit-card payment due alerts",
    ],
  },
  {
    id: "automation",
    title: "Email Sync, Notes & Family",
    eyebrow: "Unified Household Workflow",
    icon: Mail,
    accent: "text-amber-600 dark:text-amber-400",
    summary:
      "Auto-triage Gmail, Outlook, or forwarded emails into transactions, documents, and reminders—alongside tri-mode Markdown notes and per-module family sharing.",
    highlights: [
      "Private @vaulty.mnilay.com forwarding + Gmail/Outlook",
      "Rich Text / Markdown / Preview checklists & images",
      "Granular read-only family sharing per module",
    ],
  },
];

export function Vault3DShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [tilt, setTilt] = useState({ rx: 7, ry: -9 });
  const [totpTick, setTotpTick] = useState(24);
  const [noteChecked, setNoteChecked] = useState(true);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % SCENES.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [paused]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      setTotpTick((prev) => (prev <= 1 ? 30 : prev - 1));
      setNoteChecked((prev) => (totpTick % 5 === 0 ? !prev : prev));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [totpTick]);

  const activeScene = SCENES[activeIndex];

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRatio = (e.clientX - rect.left) / rect.width - 0.5;
    const yRatio = (e.clientY - rect.top) / rect.height - 0.5;
    setTilt({
      rx: Math.round((7 - yRatio * 10) * 10) / 10,
      ry: Math.round((-9 + xRatio * 14) * 10) / 10,
    });
  };

  const resetTilt = () => {
    setTilt({ rx: 7, ry: -9 });
  };

  return (
    <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-[1.25fr_0.75fr]">
      {/* Interactive 3D Layered App Stage */}
      <div
        className="vaulty-3d-scene relative flex min-h-[430px] items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface p-5 shadow-fluent-8 sm:min-h-[480px] sm:p-8"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => {
          setPaused(false);
          resetTilt();
        }}
        onMouseMove={handleMouseMove}
      >
        <div
          className="atelier-grid-bg pointer-events-none absolute inset-0 opacity-45"
          aria-hidden="true"
        />

        {/* Ambient radial highlight matching active domain */}
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute h-72 w-72 rounded-full blur-3xl transition-colors duration-700",
            activeScene.id === "scan" && "bg-brand/15",
            activeScene.id === "vault" && "bg-purple-500/15",
            activeScene.id === "wealth" && "bg-emerald-500/15",
            activeScene.id === "automation" && "bg-amber-500/15",
          )}
        />

        {/* 3D Transformed Multi-Layer Diorama */}
        <div
          className="vaulty-3d-stage relative w-full max-w-[500px]"
          style={{
            transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          }}
        >
          {/* SCENE 1: Camera Perspective Scan + Drive Sync + Document AI */}
          {activeScene.id === "scan" && (
            <div
              className="relative mx-auto h-[340px] w-full"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Base Z=0 Window: Document Perspective Scanner */}
              <div
                className="absolute inset-x-4 top-4 bottom-6 rounded-xl border border-border bg-surface-elevated p-4 shadow-fluent-16"
                style={{ transform: "translateZ(0px)" }}
              >
                <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                  <div className="flex items-center gap-2">
                    <Camera className="h-4 w-4 text-brand" />
                    <span className="text-xs font-semibold text-text-primary">
                      Camera Perspective Stitcher
                    </span>
                  </div>
                  <span className="rounded bg-brand-subtle px-2 py-0.5 font-mono text-[10px] font-semibold text-brand">
                    A4 · 3 Pages
                  </span>
                </div>

                {/* Animated Crop Frame with Laser Sweep */}
                <div className="relative mt-3 h-48 overflow-hidden rounded-lg border border-border-subtle bg-surface-muted/60 p-3">
                  {/* 4 Perspective Crop Corners */}
                  <span className="absolute left-2.5 top-2.5 h-3 w-3 border-l-2 border-t-2 border-brand" />
                  <span className="absolute right-2.5 top-2.5 h-3 w-3 border-r-2 border-t-2 border-brand" />
                  <span className="absolute bottom-2.5 left-2.5 h-3 w-3 border-b-2 border-l-2 border-brand" />
                  <span className="absolute bottom-2.5 right-2.5 h-3 w-3 border-b-2 border-r-2 border-brand" />

                  {/* Animated Laser Scan Beam */}
                  <div className="vaulty-scan-line pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_12px_var(--brand)]" />

                  <div className="space-y-2 px-2 pt-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                        Health Policy Certificate
                      </span>
                      <span className="font-mono text-[10px] text-success">Enhanced B&amp;W</span>
                    </div>
                    <div className="h-2.5 w-3/4 rounded bg-border/60" />
                    <div className="h-2 w-full rounded bg-border-subtle" />
                    <div className="h-2 w-5/6 rounded bg-border-subtle" />
                    <div className="mt-3 rounded border border-brand/25 bg-brand-subtle/50 px-2.5 py-1.5 font-mono text-[10.5px] text-brand">
                      Policy Expiry: 14 Dec 2027
                    </div>
                  </div>
                </div>
              </div>

              {/* Mid Floating Z=48 Card: Google Drive Sync */}
              <div className="vaulty-layer-mid absolute -left-2 bottom-2 flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 shadow-fluent-8 sm:left-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-success/25 bg-success-subtle text-success">
                  <Cloud className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11.5px] font-semibold text-text-primary">
                    Saved to Google Drive
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">
                    Vaulty/Docs · +2 Pages Appended
                  </p>
                </div>
              </div>

              {/* Front Floating Z=78 Card: Gemini AI Extraction + Reminder */}
              <div className="vaulty-layer-front absolute -right-2 top-14 w-56 rounded-xl border border-brand/30 bg-surface-elevated p-3 shadow-fluent-16 sm:right-0">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-brand">
                    <Sparkles className="h-3.5 w-3.5" />
                    Gemini Extraction
                  </span>
                  <span className="font-mono text-[10px] text-success">98% conf</span>
                </div>
                <p className="mt-1.5 text-[11px] leading-snug text-text-secondary">
                  Summary ready + Reminder scheduled 30d prior.
                </p>
                <div className="mt-2 inline-flex items-center gap-1 rounded bg-warning-subtle px-2 py-0.5 font-mono text-[9.5px] font-semibold text-warning">
                  <BellRing className="h-3 w-3" />
                  14 Nov 2027 Alert Active
                </div>
              </div>
            </div>
          )}

          {/* SCENE 2: Encrypted Credential Vault + Live 30s 2FA Authenticator */}
          {activeScene.id === "vault" && (
            <div
              className="relative mx-auto h-[340px] w-full"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Base Z=0 Window: Zero-Knowledge Cipher Storage */}
              <div
                className="absolute inset-x-4 top-4 bottom-6 rounded-xl border border-border bg-surface-elevated p-4 shadow-fluent-16"
                style={{ transform: "translateZ(0px)" }}
              >
                <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-xs font-semibold text-text-primary">
                      Envelope Encryption Memory
                    </span>
                  </div>
                  <span className="rounded bg-success-subtle px-2 py-0.5 font-mono text-[10px] font-semibold text-success">
                    AES-256-GCM
                  </span>
                </div>

                <div className="mt-3 space-y-2.5">
                  <div className="rounded-lg border border-border-subtle bg-surface-muted/50 p-2.5 font-mono text-[10px] text-text-muted">
                    <div className="flex justify-between text-text-secondary">
                      <span>PBKDF2-SHA256</span>
                      <span>600,000 rounds</span>
                    </div>
                    <p className="mt-1 truncate opacity-70">
                      {'{"kekSalt":"8xF2...","encryptedDEK":"a91c..."}'}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg border border-border-subtle bg-surface p-2.5">
                      <p className="text-[10px] text-text-muted">App Login</p>
                      <p className="mt-0.5 text-xs font-semibold text-text-primary">
                        Cloud Console
                      </p>
                      <p className="font-mono text-[10px] text-brand">••••••••••••</p>
                    </div>
                    <div className="rounded-lg border border-border-subtle bg-surface p-2.5">
                      <p className="text-[10px] text-text-muted">Bank Credentials</p>
                      <p className="mt-0.5 text-xs font-semibold text-text-primary">HDFC Netbank</p>
                      <p className="font-mono text-[10px] text-text-muted">PIN + UPI Protected</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mid Floating Z=48 Card: Live Ticking 2FA Authenticator */}
              <div className="vaulty-layer-mid absolute -right-2 bottom-4 flex w-64 items-center justify-between gap-3 rounded-xl border border-brand/35 bg-surface px-4 py-3 shadow-fluent-16 sm:right-0">
                <div>
                  <span className="font-mono text-[9.5px] font-semibold uppercase tracking-wider text-text-muted">
                    Authenticator · 2FA
                  </span>
                  <p className="mt-0.5 font-mono text-xl font-bold tracking-[0.14em] tabular-nums text-text-primary">
                    {totpTick > 15 ? "482 910" : "731 049"}
                  </p>
                  <p className="text-[10px] text-text-muted">GitHub · RFC 6238</p>
                </div>
                <div className="relative flex h-11 w-11 shrink-0 items-center justify-center">
                  <svg className="h-11 w-11 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      className="text-border-subtle"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="15.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray="100, 100"
                      strokeDashoffset={100 - (totpTick / 30) * 100}
                      className={cn(
                        "transition-[stroke-dashoffset] duration-700",
                        totpTick <= 5 ? "text-danger" : "text-brand",
                      )}
                    />
                  </svg>
                  <span className="absolute font-mono text-[10px] font-bold tabular-nums text-text-primary">
                    {totpTick}s
                  </span>
                </div>
              </div>

              {/* Front Floating Z=78 Card: Cross-Device PIN App Lock */}
              <div className="vaulty-layer-front absolute -left-2 top-16 flex items-center gap-2.5 rounded-xl border border-border bg-surface-elevated px-3.5 py-2.5 shadow-fluent-16 sm:left-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-purple-500/25 bg-purple-500/10 text-purple-600 dark:text-purple-400">
                  <KeyRound className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11.5px] font-semibold text-text-primary">App Lock Unlocked</p>
                  <p className="font-mono text-[10px] text-text-muted">
                    4-Digit PIN &amp; Passkey Synced
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SCENE 3: Multi-Currency Wealth + Local PDF Statement Decryption */}
          {activeScene.id === "wealth" && (
            <div
              className="relative mx-auto h-[340px] w-full"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Base Z=0 Window: Net Worth & Breakdown */}
              <div
                className="absolute inset-x-4 top-4 bottom-6 rounded-xl border border-border bg-surface-elevated p-4 shadow-fluent-16"
                style={{ transform: "translateZ(0px)" }}
              >
                <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                  <div className="flex items-center gap-2">
                    <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    <span className="text-xs font-semibold text-text-primary">
                      Multi-Currency Wealth
                    </span>
                  </div>
                  <div className="flex gap-1 font-mono text-[10px]">
                    <span className="rounded bg-brand px-1.5 py-0.5 font-semibold text-white">
                      INR
                    </span>
                    <span className="rounded bg-surface-muted px-1.5 py-0.5 text-text-muted">
                      EUR
                    </span>
                  </div>
                </div>

                <div className="mt-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                    Net Worth Position
                  </p>
                  <p className="font-mono text-2xl font-bold tabular-nums text-text-primary">
                    ₹42,85,400
                  </p>
                  <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-surface-muted">
                    <div className="w-[89%] bg-emerald-600 dark:bg-emerald-400" />
                    <div className="w-[11%] bg-rose-500" />
                  </div>
                </div>

                <div className="mt-3.5 divide-y divide-border-subtle rounded-lg border border-border-subtle text-xs">
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-text-primary">Salary Credit · HDFC</span>
                    <span className="font-mono font-semibold tabular-nums text-success">
                      +₹1,45,000
                    </span>
                  </div>
                  <div className="flex items-center justify-between px-3 py-2">
                    <span className="text-text-primary">Card Statement Payment</span>
                    <span className="font-mono font-semibold tabular-nums text-danger">
                      -₹24,800
                    </span>
                  </div>
                </div>
              </div>

              {/* Mid Floating Z=48 Card: Local PDF Statement Decryption */}
              <div className="vaulty-layer-mid absolute -left-2 bottom-2 flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-surface px-3.5 py-2.5 shadow-fluent-8 sm:left-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11.5px] font-semibold text-text-primary">
                    Encrypted PDF Unlocked Locally
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">
                    pdfjs-dist · Never sent to AI
                  </p>
                </div>
              </div>

              {/* Front Floating Z=78 Card: Allocation Ring */}
              <div className="vaulty-layer-front absolute -right-2 top-16 rounded-xl border border-border bg-surface-elevated p-3 shadow-fluent-16 sm:right-0">
                <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  Assets Split
                </p>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="var(--surface-muted)"
                      strokeWidth="5"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="5"
                      strokeDasharray="62, 100"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="14"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="5"
                      strokeDasharray="28, 100"
                      strokeDashoffset="-64"
                    />
                  </svg>
                  <div className="space-y-0.5 font-mono text-[10px]">
                    <p className="text-emerald-600 dark:text-emerald-400">68% Equity</p>
                    <p className="text-brand">32% Cash</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SCENE 4: Email Auto-Sync + Markdown Notes + Family Sharing */}
          {activeScene.id === "automation" && (
            <div
              className="relative mx-auto h-[340px] w-full"
              style={{ transformStyle: "preserve-3d" }}
            >
              {/* Base Z=0 Window: Email Discovery Triage */}
              <div
                className="absolute inset-x-4 top-4 bottom-6 rounded-xl border border-border bg-surface-elevated p-4 shadow-fluent-16"
                style={{ transform: "translateZ(0px)" }}
              >
                <div className="flex items-center justify-between border-b border-border-subtle pb-2.5">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-semibold text-text-primary">
                      Email Sync &amp; Inbound Triage
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-brand">Gmail · Outlook · Resend</span>
                </div>

                <div className="mt-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Wallet className="h-3.5 w-3.5 text-emerald-500" />
                      <span className="font-medium text-text-primary">UPI Debit Auto-Imported</span>
                    </div>
                    <span className="font-mono text-[10px] text-success">96% match</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FolderOpen className="h-3.5 w-3.5 text-brand" />
                      <span className="font-medium text-text-primary">
                        Insurance Invoice Staged
                      </span>
                    </div>
                    <span className="font-mono text-[10px] text-brand">1-click Drive</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-border-subtle bg-surface px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-amber-500" />
                      <span className="font-medium text-text-primary">EMI Due Reminder Added</span>
                    </div>
                    <span className="font-mono text-[10px] text-warning">05 Dec</span>
                  </div>
                </div>
              </div>

              {/* Mid Floating Z=48 Card: Interactive TipTap Checklist */}
              <div className="vaulty-layer-mid absolute -left-2 bottom-2 w-60 rounded-xl border border-teal-500/30 bg-surface p-3 shadow-fluent-16 sm:left-0">
                <div className="flex items-center gap-2 text-[11px] font-semibold text-teal-600 dark:text-teal-400">
                  <StickyNote className="h-3.5 w-3.5" />
                  <span>Markdown Notes &amp; To-Dos</span>
                </div>
                <div className="mt-2 space-y-1.5 text-[11px]">
                  <div className="flex items-center gap-2 text-text-primary">
                    <span
                      className={cn(
                        "flex h-4 w-4 items-center justify-center rounded border transition-colors",
                        noteChecked
                          ? "border-success bg-success-subtle text-success"
                          : "border-border-strong",
                      )}
                    >
                      {noteChecked && <Check className="h-2.5 w-2.5" />}
                    </span>
                    <span className={cn(noteChecked && "line-through text-text-muted")}>
                      Verify tax return PDF
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-text-primary">
                    <span className="flex h-4 w-4 items-center justify-center rounded border border-success bg-success-subtle text-success">
                      <Check className="h-2.5 w-2.5" />
                    </span>
                    <span>Save renewal reminder</span>
                  </div>
                </div>
              </div>

              {/* Front Floating Z=78 Card: Module-Scoped Family Sharing */}
              <div className="vaulty-layer-front absolute -right-2 top-16 flex items-center gap-2.5 rounded-xl border border-rose-500/25 bg-surface-elevated px-3.5 py-2.5 shadow-fluent-16 sm:right-0">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/25 bg-rose-500/10 text-rose-600 dark:text-rose-400">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11.5px] font-semibold text-text-primary">
                    Family Vault Shared
                  </p>
                  <p className="font-mono text-[10px] text-text-muted">
                    Docs ✓ · Wealth ✓ · 2FA Private
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Interactive Workflow Controls & Details */}
      <div className="flex h-full flex-col justify-between space-y-4">
        <div className="space-y-2.5">
          {SCENES.map((scene, idx) => {
            const Icon = scene.icon;
            const active = idx === activeIndex;
            return (
              <button
                key={scene.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={cn(
                  "relative w-full overflow-hidden rounded-xl border p-4 text-left transition-all",
                  active
                    ? "border-brand bg-surface shadow-fluent-4"
                    : "border-border-subtle bg-surface/60 hover:border-border-strong hover:bg-surface",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-surface-muted",
                      scene.accent,
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                      {scene.eyebrow}
                    </p>
                    <h3 className="text-sm font-semibold text-text-primary">{scene.title}</h3>
                    {active && (
                      <div className="mt-2 space-y-2">
                        <p className="text-xs leading-relaxed text-text-secondary">
                          {scene.summary}
                        </p>
                        <ul className="space-y-1 pt-1">
                          {scene.highlights.map((item) => (
                            <li
                              key={item}
                              className="flex items-center gap-2 text-[11px] font-medium text-text-primary"
                            >
                              <FileText className="h-3 w-3 shrink-0 text-success" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                {active && !paused && (
                  <span
                    key={`progress-${activeScene.id}`}
                    className="vaulty-scene-progress absolute inset-x-0 bottom-0 h-[2px] bg-brand"
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
