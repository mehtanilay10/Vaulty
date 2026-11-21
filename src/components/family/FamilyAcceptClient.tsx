"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Alert } from "@/components/ui/Alert";
import { FamilyModuleBadges } from "@/components/family/FamilyModuleBadges";
import { csrfHeaders } from "@/lib/csrf-client";
import type { FamilyInvitationSummary } from "@/types/family";
import { ArrowLeft, Check, Clock, Mail, ShieldCheck, UserPlus, X } from "lucide-react";

export function FamilyAcceptClient({
  token,
  invitation,
  currentEmail,
  emailMatches,
  error,
}: {
  token: string;
  invitation: FamilyInvitationSummary | null;
  currentEmail: string | null;
  emailMatches: boolean;
  error: { title: string; message: string } | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const respond = async (action: "accept" | "reject") => {
    if (!token) return;

    setBusy(action);
    setMessage(null);

    try {
      const response = await fetch(`/api/family/invitations/${action}`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Unable to respond to this invitation.");
      }

      if (action === "accept") {
        router.push("/family");
        router.refresh();
      } else {
        router.push("/family");
        router.refresh();
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to respond right now.");
    } finally {
      setBusy(null);
    }
  };

  if (error) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader
          eyebrow="Family invitation"
          title={error.title}
          icon={<UserPlus className="h-5 w-5" />}
        />
        <Card className="mt-6 text-center">
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-warning/25 bg-warning-subtle text-warning">
              <Mail className="h-6 w-6" />
            </div>
            <p className="max-w-sm text-[13px] leading-relaxed text-text-muted">{error.message}</p>
            <Link
              href="/family"
              className="btn btn-secondary mt-2 inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              Go to Family
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!invitation) return null;

  const isPending = invitation.status === "PENDING";
  const canRespond = isPending && emailMatches;

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        eyebrow="Family invitation"
        title="Join a Vaulty family"
        description="Family access is read-only. You can view only the modules the owner enables, and they can revoke access at any time."
        icon={<UserPlus className="h-5 w-5" />}
      />

      <Card className="mt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-text-muted">Invited by</p>
            <p className="mt-0.5 truncate text-[15px] font-semibold text-text-primary">
              {invitation.owner?.name || invitation.owner?.email || "A Vaulty user"}
            </p>
            {invitation.owner?.email && (
              <p className="truncate text-[12px] text-text-muted">{invitation.owner.email}</p>
            )}
          </div>
          <Badge
            variant={
              invitation.status === "PENDING"
                ? "warning"
                : invitation.status === "ACCEPTED"
                  ? "success"
                  : "default"
            }
          >
            {invitation.status}
          </Badge>
        </div>

        <div className="mt-5">
          <p className="mb-2 text-[11px] uppercase tracking-wide text-text-muted">
            Modules you can view
          </p>
          <FamilyModuleBadges flags={invitation} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-border-subtle pt-3 text-[11px] text-text-muted">
          <span className="flex items-center gap-1.5">
            <Mail className="h-3.5 w-3.5" />
            Invitation for {invitation.email}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Expires{" "}
            {new Date(invitation.expiresAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        </div>

        {message && (
          <div className="mt-4">
            <Alert variant="danger">{message}</Alert>
          </div>
        )}

        {isPending && !emailMatches && (
          <div className="mt-4">
            <Alert variant="warning">
              You are signed in as <strong>{currentEmail || "an unknown account"}</strong>, but this
              invitation was sent to <strong>{invitation.email}</strong>. Sign in with the invited
              email address to accept it.
            </Alert>
          </div>
        )}

        {!isPending && (
          <div className="mt-4">
            <Alert variant={invitation.status === "ACCEPTED" ? "success" : "info"}>
              {invitation.status === "ACCEPTED"
                ? "This invitation has already been accepted."
                : invitation.status === "EXPIRED"
                  ? "This invitation has expired. Ask the owner to send a new one."
                  : "This invitation is no longer pending."}
            </Alert>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:justify-end">
          {canRespond ? (
            <>
              <Button variant="secondary" onClick={() => respond("reject")} disabled={!!busy}>
                <X className="h-4 w-4" />
                {busy === "reject" ? "Declining..." : "Decline"}
              </Button>
              <Button onClick={() => respond("accept")} disabled={!!busy}>
                <Check className="h-4 w-4" />
                {busy === "accept" ? "Accepting..." : "Accept invitation"}
              </Button>
            </>
          ) : (
            <Link
              href="/family"
              className="btn btn-secondary inline-flex h-9 items-center justify-center gap-2 px-3.5 text-[13px]"
            >
              <ArrowLeft className="h-4 w-4" />
              Go to Family
            </Link>
          )}
        </div>
      </Card>

      <div className="mt-4 flex items-start gap-2 text-[11px] leading-relaxed text-text-muted">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          You will never be able to edit, delete, move or re-share the owner&apos;s data.
          Credentials remain end-to-end encrypted and are only decrypted in your browser.
        </span>
      </div>
    </div>
  );
}
