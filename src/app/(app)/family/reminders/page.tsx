import { auth } from "@/auth";
import Link from "next/link";
import { getFamilySharedReminders } from "@/lib/family-service";
import { PageHeader } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notFound } from "next/navigation";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { Bell, Clock3, Lock, User } from "lucide-react";

export default async function FamilyRemindersPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { owner } = await searchParams;

  if (owner) {
    const hasAccess = await hasFamilyModuleAccess(session.user.id, owner, "reminders");
    if (!hasAccess) notFound();
  }

  const groups = await getFamilySharedReminders(session.user.id, owner);

  return (
    <>
      <Breadcrumbs items={[{ label: "Family", href: "/family" }, { label: "Reminders" }]} />
      <PageHeader
        eyebrow="Family shared"
        title="Reminders"
        description="Read-only reminders shared by your family members. You can view upcoming payment due dates and renewals."
        icon={<Bell className="h-5 w-5" />}
        actions={
          <Link
            href="/family"
            className="btn btn-secondary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
          >
            Manage family
          </Link>
        }
      />

      <div className="mt-6 space-y-6">
        {groups.length === 0 && (
          <Card>
            <EmptyState
              icon={<Bell className="h-6 w-6" />}
              title="No reminders shared"
              description="When a family member shares their Reminders module, their reminders will appear here."
              action={
                <Link
                  href="/family"
                  className="btn btn-primary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
                >
                  Manage family
                </Link>
              }
            />
          </Card>
        )}

        {groups.map((group) => {
          const ownerLabel = group.owner?.name || group.owner?.email || "Family member";
          return (
            <div key={group.membershipId} className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-muted text-text-muted">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-text-primary">
                      {ownerLabel}&apos;s Reminders
                    </h2>
                    <p className="text-[11px] text-text-muted">
                      {group.reminders.length} active reminder
                      {group.reminders.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <Badge variant="violet" className="gap-1.5 text-[11px]">
                  <Lock className="h-3 w-3" />
                  Read-only
                </Badge>
              </div>

              {group.reminders.length === 0 ? (
                <Card>
                  <EmptyState
                    icon={<Bell className="h-6 w-6" />}
                    title="No upcoming reminders"
                    description={`${ownerLabel} has no active reminders scheduled.`}
                  />
                </Card>
              ) : (
                <div className="space-y-3">
                  {group.reminders.map((reminder) => {
                    const dueDate = new Date(reminder.dueAt);
                    const isOverdue = dueDate.getTime() < Date.now();
                    return (
                      <Card
                        key={reminder.id}
                        className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isOverdue
                                ? "bg-red-500/10 text-red-600"
                                : "bg-amber-500/10 text-amber-600"
                            }`}
                          >
                            <Clock3 className="h-4 w-4" />
                          </div>

                          <div className="space-y-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-sm text-text-primary truncate">
                                {reminder.title}
                              </span>
                              <Badge variant={isOverdue ? "danger" : "warning"}>
                                {reminder.category}
                              </Badge>
                              <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                Due: {dueDate.toLocaleDateString()}
                              </span>
                            </div>

                            {reminder.description && (
                              <p className="text-xs text-text-muted line-clamp-2">
                                {reminder.description}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                          <Badge variant="default" className="text-[11px]">
                            {reminder.recurrence || "NONE"}
                          </Badge>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
