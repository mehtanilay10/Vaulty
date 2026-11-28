"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { CommandBar, CommandBarButton } from "@/components/ui/CommandBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Blade } from "@/components/ui/Blade";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatCard } from "@/components/ui/StatCard";
import { FamilyModuleBadges } from "@/components/family/FamilyModuleBadges";
import { FamilyModulePicker } from "@/components/family/FamilyModulePicker";
import { usePasswordVault } from "@/lib/password-context";
import { useFeedback } from "@/components/providers/FeedbackProvider";
import { useVaultAutoUnlock } from "@/lib/use-vault-auto-unlock";
import { csrfHeaders } from "@/lib/csrf-client";
import { ensureFamilyKeyPair, syncOwnedFamilyCredentialKeys } from "@/lib/family-crypto";
import {
  emptyFamilyModuleFlags,
  type FamilyInvitationSummary,
  type FamilyMembershipSummary,
  type FamilyModuleFlags,
  type FamilyOverview,
} from "@/types/family";
import {
  ArrowRight,
  Bell,
  Check,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Pencil,
  RefreshCw,
  ShieldCheck,
  StickyNote,
  Trash2,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SharingTarget =
  | { kind: "invite" }
  | { kind: "invitation"; invitation: FamilyInvitationSummary }
  | { kind: "membership"; membership: FamilyMembershipSummary };

type KeyState = "idle" | "syncing" | "ready" | "locked" | "no-vault" | "error";

function displayName(
  user:
    | {
        name: string | null;
        email: string | null;
      }
    | null
    | undefined,
) {
  return user?.name || user?.email || "Family member";
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const STATUS_VARIANTS: Record<
  FamilyInvitationSummary["status"],
  "default" | "success" | "warning" | "danger" | "info"
> = {
  PENDING: "warning",
  ACCEPTED: "success",
  REJECTED: "default",
  REVOKED: "default",
  EXPIRED: "danger",
};

const STATUS_LABELS: Record<FamilyInvitationSummary["status"], string> = {
  PENDING: "Pending",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  REVOKED: "Revoked",
  EXPIRED: "Expired",
};

export function FamilyClient({ overview }: { overview: FamilyOverview }) {
  const { confirmAction } = useFeedback();
  const router = useRouter();
  const { isUnlocked, encryptionKey } = usePasswordVault();
  const { appUnlocked } = useVaultAutoUnlock();

  const [sharingTarget, setSharingTarget] = useState<SharingTarget | null>(null);
  const [flags, setFlags] = useState<FamilyModuleFlags>(emptyFamilyModuleFlags());
  const [inviteEmail, setInviteEmail] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [banner, setBanner] = useState<{
    variant: "success" | "warning" | "danger" | "info";
    message: string;
  } | null>(null);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [keyState, setKeyState] = useState<KeyState>("idle");

  const credentialSharingActive = useMemo(() => {
    return (
      overview.ownedMemberships.some((membership) => membership.shareCredentials) ||
      overview.receivedMemberships.some((membership) => membership.shareCredentials) ||
      overview.sentInvitations.some(
        (invitation) => invitation.status === "PENDING" && invitation.shareCredentials,
      ) ||
      overview.receivedInvitations.some((invitation) => invitation.shareCredentials)
    );
  }, [overview]);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!credentialSharingActive) {
      setKeyState("idle");
      return;
    }

    if (!overview.hasVault) {
      setKeyState("no-vault");
      return;
    }

    if (!appUnlocked) {
      setKeyState("locked");
      return;
    }

    if (!isUnlocked || !encryptionKey) {
      setKeyState("locked");
      return;
    }

    const controller = new AbortController();
    setKeyState("syncing");

    (async () => {
      try {
        await ensureFamilyKeyPair(
          encryptionKey,
          csrfHeaders({ "Content-Type": "application/json" }),
          controller.signal,
        );
        await syncOwnedFamilyCredentialKeys(
          encryptionKey,
          csrfHeaders({ "Content-Type": "application/json" }),
          controller.signal,
        );
        if (!controller.signal.aborted) setKeyState("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Family credential key sync failed:", error);
        if (!controller.signal.aborted) setKeyState("error");
      }
    })();

    return () => {
      controller.abort();
    };
  }, [credentialSharingActive, overview.hasVault, isUnlocked, encryptionKey, appUnlocked]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const openInvite = () => {
    setInviteEmail("");
    setModalError(null);
    setFlags(emptyFamilyModuleFlags());
    setSharingTarget({ kind: "invite" });
  };

  const openEditInvitation = (invitation: FamilyInvitationSummary) => {
    setFlags({
      shareDocuments: invitation.shareDocuments,
      shareWealth: invitation.shareWealth,
      shareCredentials: invitation.shareCredentials,
      shareReminders: invitation.shareReminders,
      shareNotes: invitation.shareNotes,
    });
    setSharingTarget({ kind: "invitation", invitation });
  };

  const openEditMembership = (membership: FamilyMembershipSummary) => {
    setFlags({
      shareDocuments: membership.shareDocuments,
      shareWealth: membership.shareWealth,
      shareCredentials: membership.shareCredentials,
      shareReminders: membership.shareReminders,
      shareNotes: membership.shareNotes,
    });
    setSharingTarget({ kind: "membership", membership });
  };

  const closeSharingModal = () => {
    if (busy) return;
    setSharingTarget(null);
    setModalError(null);
  };

  async function request(url: string, method: string, body?: unknown) {
    const response = await fetch(url, {
      method,
      headers: csrfHeaders(body ? { "Content-Type": "application/json" } : undefined),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || "Request failed.");
    }
    return data;
  }

  const handleSubmitSharing = async () => {
    if (!sharingTarget) return;

    if (sharingTarget.kind === "invite") {
      const email = inviteEmail.trim();
      if (!email) {
        setModalError("Please enter an email address.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setModalError("Please enter a valid email address.");
        return;
      }
    }

    setBusy(true);
    setBanner(null);
    setModalError(null);

    try {
      if (sharingTarget.kind === "invite") {
        const data = await request("/api/family/invitations", "POST", {
          email: inviteEmail.trim(),
          ...flags,
        });
        setBanner({
          variant: data.emailSent ? "success" : "warning",
          message: data.emailSent
            ? `Invitation sent to ${inviteEmail.trim()}.`
            : `Invitation created, but the email could not be sent. Copy the link below and share it manually.`,
        });
        setShareLink(data.inviteUrl ?? null);
        setInviteEmail("");
      } else if (sharingTarget.kind === "invitation") {
        await request(`/api/family/invitations/${sharingTarget.invitation.id}`, "PATCH", flags);
        setBanner({
          variant: "success",
          message: "Invitation sharing settings updated.",
        });
      } else {
        await request(`/api/family/members/${sharingTarget.membership.id}`, "PATCH", flags);
        setBanner({
          variant: "success",
          message: "Family sharing settings updated.",
        });
      }

      setSharingTarget(null);
      setModalError(null);
      router.refresh();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (membership: FamilyMembershipSummary) => {
    if (
      !(await confirmAction({
        title: "Remove family member?",
        description: `${displayName(membership.member)} will immediately lose access to the modules you shared.`,
        confirmLabel: "Remove member",
        tone: "danger",
      }))
    )
      return;

    setActionId(membership.id);
    setBanner(null);
    try {
      await request(`/api/family/members/${membership.id}`, "DELETE");
      setBanner({
        variant: "success",
        message: `${displayName(membership.member)} no longer has family access.`,
      });
      router.refresh();
    } catch (error) {
      setBanner({
        variant: "danger",
        message: error instanceof Error ? error.message : "Failed to revoke access.",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleCancelInvitation = async (invitation: FamilyInvitationSummary) => {
    if (
      !(await confirmAction({
        title: "Cancel invitation?",
        description: `The invitation sent to ${invitation.email} will be revoked.`,
        confirmLabel: "Cancel invitation",
        tone: "danger",
      }))
    )
      return;

    setActionId(invitation.id);
    setBanner(null);
    try {
      await request(`/api/family/invitations/${invitation.id}`, "DELETE");
      setBanner({ variant: "success", message: "Invitation cancelled." });
      router.refresh();
    } catch (error) {
      setBanner({
        variant: "danger",
        message: error instanceof Error ? error.message : "Failed to cancel invitation.",
      });
    } finally {
      setActionId(null);
    }
  };

  const handleResend = async (invitation: FamilyInvitationSummary) => {
    setActionId(invitation.id);
    setBanner(null);
    try {
      const data = await request(`/api/family/invitations/${invitation.id}/resend`, "POST");
      setBanner({
        variant: data.emailSent ? "success" : "warning",
        message: data.emailSent
          ? `Invitation re-sent to ${invitation.email}.`
          : "Invitation refreshed, but the email could not be sent. Copy the link below.",
      });
      setShareLink(data.inviteUrl ?? null);
      router.refresh();
    } catch (error) {
      setBanner({
        variant: "danger",
        message: error instanceof Error ? error.message : "Failed to resend invitation.",
      });
    } finally {
      setActionId(null);
    }
  };

  const copyLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setBanner({
        variant: "danger",
        message: "Could not copy the link. Copy it manually from the field.",
      });
    }
  };

  // Accepted invitations are represented by memberships, so only pending ones are listed here.
  const pendingInvitations = overview.sentInvitations.filter(
    (invitation) => invitation.status === "PENDING",
  );
  const expiredInvitations = overview.sentInvitations.filter(
    (invitation) => invitation.status === "EXPIRED",
  );
  const activeFamilyCount = overview.ownedMemberships.length;
  const pendingFamilyCount = pendingInvitations.length;
  const sharedWithYouCount = overview.receivedMemberships.length;
  const sharedWithYouTotalCount = sharedWithYouCount + overview.receivedInvitations.length;
  const sharedByYouCount = activeFamilyCount + pendingFamilyCount + expiredInvitations.length;

  const keyNotice = (() => {
    if (!credentialSharingActive) return null;
    if (keyState === "no-vault") {
      return {
        variant: "warning" as const,
        message:
          "Credential sharing needs a credential vault. Create one on the Credentials page, then return here to enable encrypted family credential access.",
      };
    }
    if (keyState === "locked") {
      return {
        variant: "info" as const,
        message:
          "Unlock your credential vault to set up or refresh the end-to-end encryption keys used for family credential sharing.",
      };
    }
    if (keyState === "error") {
      return {
        variant: "danger" as const,
        message:
          "Secure credential key sync failed. Refresh the page or unlock your vault and try again. Credentials stay hidden until the key is ready.",
      };
    }
    if (keyState === "ready") {
      const waiting = overview.ownedMemberships.filter(
        (membership) => membership.shareCredentials && membership.hasFamilyPublicKey === false,
      );
      if (waiting.length > 0) {
        return {
          variant: "info" as const,
          message: `Waiting for ${waiting
            .map((membership) => displayName(membership.member))
            .join(", ")} to open their Family page to finish secure credential sharing.`,
        };
      }
    }
    return null;
  })();

  return (
    <>
      <div className="space-y-3">
        <PageHeader title="Family" icon={<Users className="h-5 w-5" />} />

        <CommandBar>
          <CommandBarButton
            primary
            icon={<UserPlus className="h-3.5 w-3.5 text-white" />}
            onClick={openInvite}
          >
            Add family member
          </CommandBarButton>
        </CommandBar>
      </div>

      <div className="mt-6 space-y-6">
        {banner && <Alert variant={banner.variant}>{banner.message}</Alert>}

        {shareLink && (
          <Card className="overflow-hidden border-rose-500/25 bg-rose-500/5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-text-primary">Invitation link</p>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  The recipient must sign in with the invited email address.
                </p>
                <code className="mt-2 block truncate rounded-lg border border-border-subtle bg-surface px-2.5 py-1.5 text-[11px] text-text-secondary">
                  {shareLink}
                </code>
              </div>
              <Button variant="secondary" onClick={() => copyLink(shareLink)} className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy link"}
              </Button>
            </div>
          </Card>
        )}

        {keyNotice && <Alert variant={keyNotice.variant}>{keyNotice.message}</Alert>}

        <section
          className="grid grid-cols-1 gap-3 sm:grid-cols-3"
          aria-label="Family sharing overview"
        >
          <StatCard
            label="Family members"
            value={activeFamilyCount}
            icon={<Users className="h-4 w-4" />}
            hint="Active"
            tone="rose"
          />
          <StatCard
            label="Pending invitations"
            value={pendingFamilyCount}
            icon={<Mail className="h-4 w-4" />}
            hint="Awaiting reply"
            tone="amber"
          />
          <StatCard
            label="Shared with you"
            value={sharedWithYouCount}
            icon={<Lock className="h-4 w-4" />}
            hint="Read-only"
            tone="violet"
          />
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Data shared by you"
            description="Family members and pending invitations you control."
            count={sharedByYouCount}
          />

          {activeFamilyCount > 0 && (
            <div className="space-y-2">
              <p className="section-eyebrow">Active members</p>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {overview.ownedMemberships.map((membership) => {
                  const memberName = displayName(membership.member);
                  return (
                    <Card
                      key={membership.id}
                      className="rounded-2xl p-5 transition-colors hover:border-border"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-rose-500/20 bg-rose-500/10 text-[12px] font-semibold text-rose-600 dark:text-rose-400">
                            {initials(memberName) || <Users className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[13px] font-semibold text-text-primary">
                                {memberName}
                              </p>
                              <Badge variant="success">
                                <Check className="h-3 w-3" />
                                Active
                              </Badge>
                            </div>
                            <p className="truncate text-[11px] text-text-muted">
                              {membership.member?.email || "No email"}
                            </p>
                            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-text-muted">
                              <Clock className="h-3 w-3" />
                              Joined {formatDate(membership.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-border-subtle bg-surface-muted/40 p-3">
                        <p className="section-eyebrow">Can view</p>
                        <div className="mt-2">
                          <FamilyModuleBadges flags={membership} />
                        </div>
                        {membership.shareCredentials && (
                          <p
                            className={cn(
                              "mt-2.5 flex items-center gap-1.5 text-[11px]",
                              membership.hasCredentialKey ? "text-success" : "text-warning",
                            )}
                          >
                            <KeyRound className="h-3.5 w-3.5" />
                            {membership.hasCredentialKey
                              ? "Secure credential key ready"
                              : membership.hasFamilyPublicKey === false
                                ? "Waiting for member to set up a family key"
                                : "Preparing secure credential key"}
                          </p>
                        )}
                      </div>

                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-text-muted">
                          <Lock className="h-3 w-3" />
                          Read-only access
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openEditMembership(membership)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit access
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(membership)}
                            disabled={actionId === membership.id}
                            className="text-danger hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Remove
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {pendingInvitations.length > 0 && (
            <div className="space-y-2">
              <p className="section-eyebrow">Pending invitations</p>
              <div className="space-y-2">
                {pendingInvitations.map((invitation) => {
                  return (
                    <Card
                      key={invitation.id}
                      className="rounded-2xl p-4 transition-colors hover:border-border"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-text-muted">
                            <Mail className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[13px] font-semibold text-text-primary">
                                {invitation.email}
                              </p>
                              <Badge variant={STATUS_VARIANTS[invitation.status]}>
                                {STATUS_LABELS[invitation.status]}
                              </Badge>
                            </div>
                            <div className="mt-2">
                              <FamilyModuleBadges flags={invitation} />
                            </div>
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
                              <Clock className="h-3.5 w-3.5" />
                              Expires {formatDate(invitation.expiresAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          {invitation.inviteUrl && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyLink(invitation.inviteUrl!)}
                            >
                              <Copy className="h-3.5 w-3.5" />
                              Copy link
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleResend(invitation)}
                            disabled={actionId === invitation.id}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditInvitation(invitation)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInvitation(invitation)}
                            disabled={actionId === invitation.id}
                            className="text-danger hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {expiredInvitations.length > 0 && (
            <div className="space-y-2">
              <p className="section-eyebrow text-danger">Expired invitations</p>
              <div className="space-y-2">
                {expiredInvitations.map((invitation) => {
                  return (
                    <Card
                      key={invitation.id}
                      className="rounded-2xl border-border-subtle bg-surface-subtle/50 p-4 transition-colors hover:border-border"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-danger-subtle text-danger">
                            <Clock className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="truncate text-[13px] font-semibold text-text-primary">
                                {invitation.email}
                              </p>
                              <Badge variant={STATUS_VARIANTS[invitation.status]}>
                                {STATUS_LABELS[invitation.status]}
                              </Badge>
                            </div>
                            <div className="mt-2">
                              <FamilyModuleBadges flags={invitation} />
                            </div>
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-text-muted">
                              <Clock className="h-3.5 w-3.5" />
                              Expired {formatDate(invitation.expiresAt)}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-1.5 sm:justify-end">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleResend(invitation)}
                            disabled={actionId === invitation.id}
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Renew & Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleCancelInvitation(invitation)}
                            disabled={actionId === invitation.id}
                            className="text-danger hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {sharedByYouCount === 0 && (
            <Card>
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title="You haven't shared anything yet"
                description="Invite a family member by email. They can accept after signing in with that email, and you can change or revoke their modules at any time."
                action={
                  <Button onClick={openInvite}>
                    <UserPlus className="h-4 w-4" />
                    Add your first family member
                  </Button>
                }
              />
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <SectionHeader
            icon={<Lock className="h-4 w-4" />}
            title="Data shared with you"
            description="Read-only spaces that family members have shared with you."
            count={sharedWithYouTotalCount}
          />

          {overview.receivedInvitations.length > 0 && (
            <Card className="rounded-2xl border-warning/25 bg-warning-subtle/30 p-5">
              <p className="text-[13px] font-semibold text-text-primary">
                Pending invitations for {overview.email}
              </p>
              <div className="mt-3 space-y-2">
                {overview.receivedInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="flex flex-col gap-2 rounded-xl border border-border-subtle bg-surface p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <p className="text-[12px] font-medium text-text-primary">
                        {displayName(invitation.owner)}
                      </p>
                      <div className="mt-1">
                        <FamilyModuleBadges flags={invitation} />
                      </div>
                    </div>
                    {invitation.inviteUrl && (
                      <Link
                        href={invitation.inviteUrl.replace(/^https?:\/\/[^/]+/, "")}
                        className="btn btn-primary inline-flex h-8 items-center justify-center gap-2 px-2.5 text-xs"
                      >
                        Review invitation
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {overview.receivedMemberships.length > 0 && (
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {overview.receivedMemberships.map((membership) => {
                const ownerName = displayName(membership.owner);
                return (
                  <Card
                    key={membership.id}
                    className="p-5 transition-colors hover:border-border-strong"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-brand/20 bg-brand-subtle text-[12px] font-semibold text-brand">
                          {initials(ownerName) || <Users className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13.5px] font-semibold text-text-primary">
                            {ownerName}
                          </p>
                          <p className="truncate font-mono text-[11px] text-text-muted">
                            {membership.owner?.email || "No email"}
                          </p>
                        </div>
                      </div>
                      <Badge variant="info">Read-only</Badge>
                    </div>

                    <div className="mt-4">
                      <p className="section-eyebrow">Open shared space</p>
                      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
                        {membership.shareDocuments && (
                          <Link
                            href={`/family/${membership.ownerId}/documents`}
                            className="group flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-[12px] font-medium text-text-secondary transition-all hover:border-brand/40 hover:bg-brand-subtle/40 hover:text-brand"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-subtle text-brand">
                              <FileText className="h-3.5 w-3.5 shrink-0" />
                            </span>
                            <span className="truncate">Documents</span>
                            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        )}
                        {membership.shareWealth && (
                          <Link
                            href={`/family/${membership.ownerId}/wealth`}
                            className="group flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-[12px] font-medium text-text-secondary transition-all hover:border-success/40 hover:bg-success-subtle/40 hover:text-success"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-success-subtle text-success">
                              <Wallet className="h-3.5 w-3.5 shrink-0" />
                            </span>
                            <span className="truncate">Wealth</span>
                            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        )}
                        {membership.shareCredentials && (
                          <Link
                            href={`/family/${membership.ownerId}/credentials`}
                            className="group flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-[12px] font-medium text-text-secondary transition-all hover:border-brand/40 hover:bg-brand-subtle/40 hover:text-brand"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-subtle text-brand">
                              <KeyRound className="h-3.5 w-3.5 shrink-0" />
                            </span>
                            <span className="truncate">Credentials</span>
                            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        )}
                        {membership.shareReminders && (
                          <Link
                            href={`/family/${membership.ownerId}/reminders`}
                            className="group flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-[12px] font-medium text-text-secondary transition-all hover:border-warning/40 hover:bg-warning-subtle/40 hover:text-warning"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-warning-subtle text-warning">
                              <Bell className="h-3.5 w-3.5 shrink-0" />
                            </span>
                            <span className="truncate">Reminders</span>
                            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        )}
                        {membership.shareNotes && (
                          <Link
                            href={`/family/${membership.ownerId}/notes`}
                            className="group flex items-center gap-2 rounded-xl border border-border-subtle bg-surface px-3 py-2.5 text-[12px] font-medium text-text-secondary transition-all hover:border-info/40 hover:bg-info-subtle/40 hover:text-info"
                          >
                            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-info-subtle text-info">
                              <StickyNote className="h-3.5 w-3.5 shrink-0" />
                            </span>
                            <span className="truncate">Notes</span>
                            <ChevronRight className="ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {sharedWithYouTotalCount === 0 && (
            <Card>
              <EmptyState
                icon={<Lock className="h-6 w-6" />}
                title="Nothing shared with you yet"
                description="When a family member shares documents, wealth, or credentials with you, they will appear here."
              />
            </Card>
          )}
        </section>
      </div>

      <Blade
        open={!!sharingTarget}
        size="lg"
        onClose={closeSharingModal}
        title={sharingTarget?.kind === "invite" ? "Add a family member" : "Edit sharing"}
        description={
          sharingTarget?.kind === "invite"
            ? "They must sign in with this email address to accept."
            : sharingTarget?.kind === "invitation"
              ? `Choose what ${sharingTarget.invitation.email} can view.`
              : `Choose what ${displayName(sharingTarget?.membership.member)} can view.`
        }
        icon={sharingTarget?.kind === "invite" ? <UserPlus className="h-4 w-4" /> : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={closeSharingModal} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={handleSubmitSharing} disabled={busy}>
              {busy
                ? "Saving..."
                : sharingTarget?.kind === "invite"
                  ? "Send invitation"
                  : "Save changes"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {modalError && <Alert variant="danger">{modalError}</Alert>}

          {sharingTarget?.kind === "invite" && (
            <div>
              <Label htmlFor="family-email">Email address</Label>
              <Input
                id="family-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="family@example.com"
                value={inviteEmail}
                onChange={(event) => {
                  setInviteEmail(event.target.value);
                  setModalError(null);
                }}
                className="mt-1.5"
              />
            </div>
          )}

          <div>
            <Label>Shared modules</Label>
            <div className="mt-1.5">
              <FamilyModulePicker flags={flags} onChange={setFlags} />
            </div>
          </div>

          <p className="text-[11px] leading-relaxed text-text-muted">
            All family access is read-only. You can change or revoke these modules at any time.
          </p>

          {sharingTarget?.kind === "invite" && overview.sentInvitations.length > 0 && (
            <div className="space-y-2 border-t border-border-subtle pt-4">
              <Label>Existing invitations</Label>
              <div className="space-y-2">
                {overview.sentInvitations.map((invitation) => (
                  <div
                    key={invitation.id}
                    className="rounded-xl border border-border-subtle bg-surface p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-[12px] font-medium text-text-primary">
                        {invitation.email}
                      </p>
                      <Badge variant={STATUS_VARIANTS[invitation.status]}>
                        {STATUS_LABELS[invitation.status]}
                      </Badge>
                    </div>
                    <div className="mt-1.5">
                      <FamilyModuleBadges flags={invitation} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Blade>
    </>
  );
}
