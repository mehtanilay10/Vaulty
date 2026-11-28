"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Badge } from "@/components/ui/Badge";
import { Tabs, Tab } from "@/components/ui/Tabs";
import { Lock, Eye, Clock, FileText, Download, ShieldCheck, AlertTriangle } from "lucide-react";
import { VaultLogo } from "@/components/icons/VaultLogo";
import dynamic from "next/dynamic";

// react-pdf/pdf.js reference browser-only APIs (for example DOMMatrix) at module
// evaluation time, so the viewer must never be imported during server rendering.
const DocumentViewer = dynamic(
  () => import("@/components/ui/DocumentViewer").then((mod) => mod.DocumentViewer),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
      </div>
    ),
  },
);

interface ShareDocument {
  id: string;
  name: string;
  mimeType: string;
  storageProvider: string;
  storageFileId: string | null;
  ownerId: string;
  owner: {
    id: string;
    name: string | null;
    email: string | null;
  };
}

interface ShareLinkInfo {
  token: string;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
}

type ShareTab = "preview" | "summary" | "interpretation";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error && err.message ? err.message : fallback;
}

function ShareFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[calc(100svh-5.5rem)] flex-col">
      <header className="command-bar sticky top-0 z-40">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand text-white shadow-fluent-2">
              <VaultLogo size={24} className="text-white" />
            </span>
            <div className="flex flex-col leading-tight">
              <span className="text-[17px] font-semibold tracking-tight text-text-primary">
                Vaulty
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-brand">
                Secure document share
              </span>
            </div>
          </Link>

          <Badge variant="success" className="gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Verified link
          </Badge>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

export function ShareClient({ token }: { token: string }) {
  const [document, setDocument] = useState<ShareDocument | null>(null);
  const [shareLink, setShareLink] = useState<ShareLinkInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requiresPassword, setRequiresPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [activeTab, setActiveTab] = useState<ShareTab>("preview");

  const fetchDocument = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/share/${token}`);
      const data = await res.json();

      if (res.status === 401 && data.requiresPassword) {
        setRequiresPassword(true);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        throw new Error(data.error || "Failed to load shared document.");
      }

      setDocument(data.document);
      setShareLink(data.shareLink);
      setRequiresPassword(false);
    } catch (err) {
      setError(errorMessage(err, "Failed to load shared document."));
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError(null);

    try {
      const res = await fetch(`/api/share/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Incorrect password.");
      }

      setRequiresPassword(false);
      await fetchDocument();
    } catch (err) {
      setError(errorMessage(err, "Failed to verify password."));
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      void fetchDocument();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <ShareFrame>
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-brand/25 border-t-brand" />
            <p className="text-[12px] text-text-muted">Verifying share link...</p>
          </div>
        </div>
      </ShareFrame>
    );
  }

  if (requiresPassword) {
    return (
      <ShareFrame>
        <div className="flex min-h-[55vh] items-center justify-center">
          <Card className="w-full max-w-md p-6 sm:p-8">
            <div className="mb-6 flex flex-col items-center text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-brand/15 bg-brand-subtle text-brand shadow-fluent-2">
                <Lock className="h-6 w-6" />
              </div>
              <h1 className="text-[1.35rem] font-semibold tracking-tight text-text-primary">
                Password Protected
              </h1>
              <p className="mt-1.5 text-[13px] leading-relaxed text-text-secondary">
                This shared document is password protected. Enter the password to view it.
              </p>
            </div>

            {error && (
              <Alert variant="danger" className="mb-4">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </Alert>
            )}

            <form onSubmit={handlePasswordSubmit} className="space-y-4">
              <div>
                <Label htmlFor="share-password">Password</Label>
                <Input
                  id="share-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter share password"
                  className="w-full"
                  autoFocus
                />
              </div>
              <Button
                type="submit"
                disabled={verifying || !password.trim()}
                className="h-10 w-full"
              >
                {verifying ? "Verifying..." : "View Document"}
              </Button>
            </form>

            <p className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              The password is never stored in this browser.
            </p>
          </Card>
        </div>
      </ShareFrame>
    );
  }

  if (error || !document) {
    return (
      <ShareFrame>
        <div className="flex min-h-[55vh] items-center justify-center">
          <Card className="w-full max-w-md p-8 text-center">
            <EmptyState
              icon={<FileText className="h-12 w-12" />}
              title="Document not found"
              description={error || "This share link may have expired or been revoked."}
            />
            <Link
              href="/"
              className="mt-4 inline-flex text-[12px] font-medium text-brand hover:underline"
            >
              Return to Vaulty
            </Link>
          </Card>
        </div>
      </ShareFrame>
    );
  }

  const fileProxyUrl = `/api/share/${token}/file`;

  return (
    <ShareFrame>
      <div className="mb-6 rounded-2xl border border-border-subtle bg-surface p-5 shadow-xs sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 items-start gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand-subtle text-brand">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-text-muted">
                Encrypted Share Record
              </p>
              <h1 className="mt-0.5 truncate text-[1.4rem] font-semibold leading-tight tracking-tight text-text-primary">
                {document.name}
              </h1>
              <p className="mt-1 text-[12px] text-text-muted">
                {document.owner?.name || document.owner?.email ? (
                  <>
                    Shared by{" "}
                    <span className="font-medium text-text-secondary">
                      {document.owner?.name || document.owner?.email}
                    </span>
                  </>
                ) : (
                  <span>Shared securely via Vaulty</span>
                )}
              </p>
            </div>
          </div>

          <a
            href={fileProxyUrl}
            download={document.name}
            className="btn btn-primary h-9 shrink-0 px-4 text-[13px]"
          >
            <Download className="h-4 w-4" />
            Download
          </a>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
          <Badge variant="success">
            <ShieldCheck className="h-3 w-3" />
            Server verified
          </Badge>
          <Badge>
            <Eye className="h-3 w-3" />
            <span className="font-mono tabular-nums">
              {shareLink?.maxViews
                ? `${shareLink.viewCount || 0} / ${shareLink.maxViews} views`
                : `${shareLink?.viewCount || 0} views`}
            </span>
          </Badge>
          {shareLink?.expiresAt && (
            <Badge variant="warning">
              <Clock className="h-3 w-3" />
              Expires {new Date(shareLink.expiresAt).toLocaleString()}
            </Badge>
          )}
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="px-3 pt-1">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as ShareTab)}>
            <Tab
              value="preview"
              active={activeTab === "preview"}
              onClick={() => setActiveTab("preview")}
              icon={<Eye className="h-4 w-4" />}
            >
              Preview
            </Tab>
          </Tabs>
        </div>

        <div className="p-3 sm:p-4">
          {activeTab === "preview" && (
            <div className="flex h-[520px] w-full items-center justify-center overflow-hidden rounded-xl border border-border-subtle bg-surface-muted md:h-[640px]">
              <DocumentViewer
                fileUrl={fileProxyUrl}
                mimeType={document.mimeType}
                fileName={document.name}
              />
            </div>
          )}
        </div>
      </Card>
    </ShareFrame>
  );
}
