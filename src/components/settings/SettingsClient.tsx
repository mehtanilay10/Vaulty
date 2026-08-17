"use client";

import { Navbar } from "@/components/layout/Navbar";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileNav } from "@/components/layout/MobileNav";
import Link from "next/link";
import { User, Shield, Lock, HardDrive, Cpu, CheckCircle2 } from "lucide-react";

export function SettingsClient({ user }: { user: any }) {
  return (
    <div className="min-h-screen bg-bg-main text-text-primary flex flex-col transition-colors">
      <Navbar />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar />

        <main className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 pb-24 md:pb-8">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <User className="w-7 h-7 text-accent-primary" />
              <span>Account &amp; Vault Settings</span>
            </h1>
            <p className="text-text-secondary text-sm mt-1">
              User identity details, security parameters, and storage allocation
            </p>
          </div>

          <div className="max-w-3xl space-y-6">
            <div className="vault-card p-6 space-y-4">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Shield className="w-5 h-5 text-accent-primary" />
                <span>Google OAuth Identity</span>
              </h2>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-bg-muted border border-border-subtle">
                {user?.image ? (
                  <img src={user.image} alt="" className="w-14 h-14 rounded-2xl ring-2 ring-accent-primary/30" />
                ) : (
                  <div className="w-14 h-14 rounded-2xl bg-accent-primary-soft text-accent-primary font-bold text-xl flex items-center justify-center">
                    {user?.name?.[0] || user?.email?.[0]}
                  </div>
                )}
                <div>
                  <h3 className="font-bold text-lg text-text-primary">{user?.name || "Standard User"}</h3>
                  <p className="text-sm text-text-secondary">{user?.email}</p>
                  <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-accent-emerald">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated Standard User
                  </span>
                </div>
              </div>
            </div>

            <div className="vault-card p-6 space-y-4">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-accent-primary" />
                <span>Storage</span>
              </h2>

              <p className="text-xs text-text-secondary">
                Manage your Google Drive connection and default storage provider.
              </p>

              <Link
                href="/settings/storage"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl vault-btn-primary text-sm cursor-pointer"
              >
                <HardDrive className="w-4 h-4" />
                <span>Storage Settings</span>
              </Link>
            </div>

            <div className="vault-card p-6 space-y-4">
              <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Cpu className="w-5 h-5 text-accent-primary" />
                <span>Storage &amp; AI Configuration</span>
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-text-secondary">
                <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle space-y-1">
                  <span className="text-text-muted font-medium">Blob Storage Mode</span>
                  <p className="font-bold text-text-primary text-sm">Vercel Private Blob</p>
                  <p className="text-text-muted">Authorized server streaming proxy active.</p>
                </div>

                <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle space-y-1">
                  <span className="text-text-muted font-medium">Max File Limit</span>
                  <p className="font-bold text-text-primary text-sm">50 MB per document</p>
                  <p className="text-text-muted">Supports PDF, JPEG, PNG, WebP.</p>
                </div>

                <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle space-y-1">
                  <span className="text-text-muted font-medium">AI Engine</span>
                  <p className="font-bold text-text-primary text-sm">Google Gemini 2.5 Flash</p>
                  <p className="text-text-muted">OCR text extraction &amp; Markdown summary.</p>
                </div>

                <div className="p-4 rounded-2xl bg-bg-muted border border-border-subtle space-y-1">
                  <span className="text-text-muted font-medium">Database Engine</span>
                  <p className="font-bold text-text-primary text-sm">Supabase / Neon PostgreSQL</p>
                  <p className="text-text-muted">Prisma ORM with recursive permissions.</p>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>

      <MobileNav />
    </div>
  );
}
