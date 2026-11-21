"use client";

import { useState, useEffect } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { Blade } from "@/components/ui/Blade";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Alert } from "@/components/ui/Alert";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import {
  Share2,
  Link as LinkIcon,
  Copy,
  Check,
  X,
  Clock,
  Eye,
  EyeOff,
  Lock,
  Trash2,
  KeyRound,
  Sparkles,
  ShieldCheck,
} from "lucide-react";

interface ShareLinkData {
  id: string;
  token: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxViews: number | null;
  viewCount: number;
  isActive: boolean;
  createdAt: string;
  url: string;
}

interface CreatedBundle {
  url: string;
  password?: string;
  token: string;
}

export function ShareModal({
  isOpen,
  onClose,
  documentId,
  documentName,
  isOwner,
}: {
  isOpen: boolean;
  onClose: () => void;
  documentId: string;
  documentName: string;
  isOwner: boolean;
}) {
  const { confirmAction } = useFeedback();
  const [links, setLinks] = useState<ShareLinkData[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [copiedBundle, setCopiedBundle] = useState(false);

  const [expiresInHours, setExpiresInHours] = useState<string>("24");
  const [maxViews, setMaxViews] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState(false);
  const [lastCreatedBundle, setLastCreatedBundle] = useState<CreatedBundle | null>(null);

  useEffect(() => {
    if (isOpen && isOwner) {
      fetchLinks();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isOwner]);

  async function fetchLinks() {
    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`);
      if (res.ok) {
        const data = await res.json();
        setLinks(data.shareLinks || []);
      }
    } catch (err) {
      console.error("Failed to fetch share links:", err);
    }
  }

  // Password requirements calculation
  const hasMinLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const isPasswordValid = !password || (hasMinLength && hasLetter && hasNumber);

  let passwordStrength: "weak" | "fair" | "strong" | null = null;
  if (password.length > 0) {
    if (!hasMinLength || !hasLetter || !hasNumber) {
      passwordStrength = "weak";
    } else if (password.length >= 12 && hasSpecial) {
      passwordStrength = "strong";
    } else {
      passwordStrength = "fair";
    }
  }

  const generatePassword = () => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%";
    let generated = "";
    const array = new Uint8Array(12);
    crypto.getRandomValues(array);
    for (let i = 0; i < 12; i++) {
      generated += chars[array[i] % chars.length];
    }
    // Ensure at least one letter and one number
    if (!/[A-Za-z]/.test(generated)) generated = "A" + generated.slice(1);
    if (!/\d/.test(generated)) generated = generated.slice(0, 11) + "9";
    setPassword(generated);
    setShowPassword(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOwner) return;

    if (password && !isPasswordValid) {
      setError(
        "Password must be at least 8 characters and contain at least one letter and one number.",
      );
      return;
    }

    setCreating(true);
    setError(null);
    setSuccess(null);

    const savedPassword = password;

    try {
      const body: Record<string, unknown> = {};
      if (expiresInHours) body.expiresInHours = parseInt(expiresInHours, 10);
      if (maxViews) body.maxViews = parseInt(maxViews, 10);
      if (savedPassword) body.password = savedPassword;

      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create share link.");

      const newUrl =
        data.shareLink?.url || `${window.location.origin}/share/${data.shareLink?.token}`;
      setLastCreatedBundle({
        url: newUrl,
        password: savedPassword || undefined,
        token: data.shareLink?.token,
      });

      setSuccess("Share link created successfully.");
      setExpiresInHours("24");
      setMaxViews("");
      setPassword("");
      await fetchLinks();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || "Failed to create share link.");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    if (
      !(await confirmAction({
        title: "Revoke share link?",
        description: "Anyone using this link will lose access to the document.",
        confirmLabel: "Revoke link",
        tone: "danger",
      }))
    )
      return;

    setError(null);
    try {
      const res = await fetch(`/api/documents/${documentId}/share`, {
        method: "DELETE",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ token }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to revoke share link.");
      }

      if (lastCreatedBundle?.token === token) {
        setLastCreatedBundle(null);
      }

      setSuccess("Share link revoked.");
      await fetchLinks();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message || "Failed to revoke share link.");
    }
  };

  const copyToClipboard = async (text: string, token: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      console.error("Failed to copy");
    }
  };

  const copyBundleToClipboard = async (bundle: CreatedBundle) => {
    try {
      const formatted = bundle.password
        ? `Document: ${documentName}\nShare Link: ${bundle.url}\nAccess Password: ${bundle.password}`
        : `Document: ${documentName}\nShare Link: ${bundle.url}`;
      await navigator.clipboard.writeText(formatted);
      setCopiedBundle(true);
      setTimeout(() => setCopiedBundle(false), 2500);
    } catch {
      console.error("Failed to copy bundle");
    }
  };

  const formatExpiry = (dateStr: string | null) => {
    if (!dateStr) return "Never";
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  return (
    <Blade
      open={isOpen}
      onClose={onClose}
      title="Share Document"
      description={`Share "${documentName}" with a public link`}
      icon={<Share2 className="h-4 w-4" />}
      size="lg"
      footer={
        <Button variant="secondary" onClick={onClose}>
          <X className="w-4 h-4" />
          Close
        </Button>
      }
    >
      {!isOwner ? (
        <Alert variant="warning">
          <Lock className="w-4 h-4 shrink-0" />
          <span>Only the document owner can create share links.</span>
        </Alert>
      ) : (
        <div className="space-y-6">
          {error && (
            <Alert variant="danger">
              <X className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </Alert>
          )}

          {success && (
            <Alert variant="success">
              <Check className="w-4 h-4 shrink-0" />
              <span>{success}</span>
            </Alert>
          )}

          {/* Newly created link callout bundle */}
          {lastCreatedBundle && (
            <div className="rounded-xl border border-success/30 bg-success-subtle/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-success/20 text-success">
                    <ShieldCheck className="h-4 w-4" />
                  </span>
                  <span className="text-xs font-semibold text-text-primary">
                    Share Link Created
                  </span>
                </div>
                <Badge variant={lastCreatedBundle.password ? "warning" : "default"}>
                  {lastCreatedBundle.password ? "Password Protected" : "Public"}
                </Badge>
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2 bg-surface p-2 rounded-lg border border-border-subtle">
                  <LinkIcon className="w-3.5 h-3.5 text-brand shrink-0" />
                  <code className="text-xs text-brand truncate flex-1">
                    {lastCreatedBundle.url}
                  </code>
                </div>

                {lastCreatedBundle.password && (
                  <div className="flex items-center justify-between bg-surface p-2 rounded-lg border border-border-subtle">
                    <div className="flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-warning shrink-0" />
                      <span className="text-[11px] text-text-secondary">Password:</span>
                      <code className="text-xs font-mono font-bold text-text-primary">
                        {lastCreatedBundle.password}
                      </code>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => copyBundleToClipboard(lastCreatedBundle)}
                  className="gap-1.5"
                >
                  {copiedBundle ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied Link & Password!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>
                        {lastCreatedBundle.password ? "Copy Link & Password" : "Copy Share Link"}
                      </span>
                    </>
                  )}
                </Button>

                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => copyToClipboard(lastCreatedBundle.url, lastCreatedBundle.token)}
                >
                  {copiedToken === lastCreatedBundle.token ? (
                    <span className="text-success inline-flex items-center gap-1">
                      <Check className="w-3.5 h-3.5" /> Link Copied
                    </span>
                  ) : (
                    "Copy Link Only"
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Creation Form */}
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Link Expiry</Label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
                  <Input
                    type="number"
                    min="1"
                    max="720"
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(e.target.value)}
                    placeholder="Hours"
                    className="pl-9"
                  />
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  Hours until link expires (leave empty for no expiry)
                </p>
              </div>
              <div>
                <Label>Max Views</Label>
                <div className="relative">
                  <Eye className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
                  <Input
                    type="number"
                    min="1"
                    value={maxViews}
                    onChange={(e) => setMaxViews(e.target.value)}
                    placeholder="Unlimited"
                    className="pl-9"
                  />
                </div>
                <p className="text-[10px] text-text-muted mt-1">
                  Maximum number of times link can be opened
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Password Protection (Optional)</Label>
                <button
                  type="button"
                  onClick={generatePassword}
                  className="text-[11px] text-brand hover:text-brand-hover inline-flex items-center gap-1 font-medium transition-colors"
                >
                  <Sparkles className="w-3 h-3" />
                  Generate PIN / Password
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-text-muted absolute left-3 top-3 pointer-events-none" />
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave empty for open link"
                  minLength={8}
                  maxLength={128}
                  className="pl-9 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-text-muted hover:text-text-primary transition-colors"
                  title={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Password strength meter and checklist */}
              {password.length > 0 && (
                <div className="pt-1.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-text-muted">Password strength:</span>
                    <span
                      className={`font-semibold capitalize ${
                        passwordStrength === "strong"
                          ? "text-success"
                          : passwordStrength === "fair"
                            ? "text-warning"
                            : "text-danger"
                      }`}
                    >
                      {passwordStrength}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-1 h-1.5 w-full bg-surface-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${
                        passwordStrength === "weak"
                          ? "bg-danger"
                          : passwordStrength === "fair"
                            ? "bg-warning"
                            : "bg-success"
                      }`}
                    />
                    <div
                      className={`h-full ${
                        passwordStrength === "fair"
                          ? "bg-warning"
                          : passwordStrength === "strong"
                            ? "bg-success"
                            : "bg-transparent"
                      }`}
                    />
                    <div
                      className={`h-full ${
                        passwordStrength === "strong" ? "bg-success" : "bg-transparent"
                      }`}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 text-[10px]">
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasMinLength ? "text-success font-medium" : "text-text-muted"
                      }`}
                    >
                      <Check className={`w-3 h-3 ${hasMinLength ? "opacity-100" : "opacity-30"}`} />
                      8+ characters
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasLetter ? "text-success font-medium" : "text-text-muted"
                      }`}
                    >
                      <Check className={`w-3 h-3 ${hasLetter ? "opacity-100" : "opacity-30"}`} />
                      Has letter
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        hasNumber ? "text-success font-medium" : "text-text-muted"
                      }`}
                    >
                      <Check className={`w-3 h-3 ${hasNumber ? "opacity-100" : "opacity-30"}`} />
                      Has number
                    </span>
                  </div>
                </div>
              )}

              <p className="text-[10px] text-text-muted">
                Recipients will need this password to view the document. If set, must be 8+
                characters and include at least one letter and one number.
              </p>
            </div>

            <Button
              type="submit"
              disabled={creating || (password.length > 0 && !isPasswordValid)}
              className="w-full"
            >
              <Share2 className="w-4 h-4" />
              {creating ? "Creating..." : "Create Share Link"}
            </Button>
          </form>

          {links.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-text-primary">Active Share Links</h3>
              <div className="space-y-2">
                {links.map((link) => (
                  <Card key={link.id} className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <LinkIcon className="w-3.5 h-3.5 text-brand shrink-0" />
                          <code className="text-xs text-brand truncate">{link.url}</code>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-[10px] text-text-muted">
                          {link.hasPassword && (
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-3 h-3" /> Password protected
                            </span>
                          )}
                          {link.expiresAt && (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Expires {formatExpiry(link.expiresAt)}
                            </span>
                          )}
                          {link.maxViews && (
                            <span className="inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {link.viewCount}/{link.maxViews} views
                            </span>
                          )}
                          {!link.maxViews && (
                            <span className="inline-flex items-center gap-1">
                              <Eye className="w-3 h-3" /> {link.viewCount} views
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => copyToClipboard(link.url, link.token)}
                          className="p-1.5 rounded-md hover:bg-surface-muted text-text-secondary transition-colors"
                          title="Copy link"
                        >
                          {copiedToken === link.token ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          onClick={() => handleRevoke(link.token)}
                          className="p-1.5 rounded-md hover:bg-danger/10 text-danger transition-colors"
                          title="Revoke link"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Blade>
  );
}
