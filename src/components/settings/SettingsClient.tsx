"use client";

import Link from "next/link";
import { AppShell } from "@/components/shell/AppShell";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  User,
  Shield,
  Lock,
  HardDrive,
  Cpu,
  CheckCircle2,
} from "lucide-react";

export function SettingsClient({ user }: { user: any }) {
  return (
    <AppShell>
      <PageHeader
        title="Account & Vault Settings"
        description="User identity details, security parameters, and storage allocation"
        icon={<User className="w-7 h-7" />}
      />

      <div className="max-w-3xl space-y-6">
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-5 h-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Google OAuth Identity</h2>
          </div>

          <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-muted border border-border-subtle">
            {user?.image ? (
              <img src={user.image} alt="" className="w-14 h-14 rounded-lg ring-2 ring-brand/20" />
            ) : (
              <div className="w-14 h-14 rounded-lg bg-brand-subtle text-brand font-bold text-xl flex items-center justify-center">
                {user?.name?.[0] || user?.email?.[0]}
              </div>
            )}
            <div>
              <h3 className="font-semibold text-lg text-text-primary">{user?.name || "Standard User"}</h3>
              <p className="text-sm text-text-secondary">{user?.email}</p>
              <span className="inline-flex items-center gap-1 mt-1 text-[11px] font-semibold text-success">
                <CheckCircle2 className="w-3.5 h-3.5" /> Authenticated Standard User
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <HardDrive className="w-5 h-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Storage</h2>
          </div>

          <p className="text-xs text-text-secondary mb-4">
            Manage your Google Drive connection and default storage provider.
          </p>

          <Link href="/settings/storage">
            <Button>
              <HardDrive className="w-4 h-4" />
              Storage Settings
            </Button>
          </Link>
        </Card>

        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="w-5 h-5 text-brand" />
            <h2 className="text-base font-semibold text-text-primary">Storage & AI Configuration</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-text-secondary">
            <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle space-y-1">
              <span className="text-text-muted font-medium">Storage Provider</span>
              <p className="font-bold text-text-primary text-sm">Google Drive</p>
              <p className="text-text-muted">Private vault with strict access control.</p>
            </div>

            <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle space-y-1">
              <span className="text-text-muted font-medium">Max File Limit</span>
              <p className="font-bold text-text-primary text-sm">50 MB per document</p>
              <p className="text-text-muted">Supports PDF, JPEG, PNG, WebP.</p>
            </div>

            <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle space-y-1">
              <span className="text-text-muted font-medium">AI Engine</span>
              <p className="font-bold text-text-primary text-sm">Google Gemini 2.5 Flash</p>
              <p className="text-text-muted">OCR text extraction & Markdown summary.</p>
            </div>

            <div className="p-4 rounded-lg bg-surface-muted border border-border-subtle space-y-1">
              <span className="text-text-muted font-medium">Database Engine</span>
              <p className="font-bold text-text-primary text-sm">Supabase / Neon PostgreSQL</p>
              <p className="text-text-muted">Prisma ORM with recursive permissions.</p>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
