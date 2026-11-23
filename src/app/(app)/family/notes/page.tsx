import { auth } from "@/auth";
import Link from "next/link";
import { getFamilySharedNotes } from "@/lib/family-service";
import { PageHeader } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notFound } from "next/navigation";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { StickyNote, User, Pin, ChevronRight } from "lucide-react";

export const metadata = {
  title: "Family Notes | Vaulty",
  description: "Read-only notes, checklists, and pages shared by your family members.",
};

export default async function FamilyNotesPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { owner } = await searchParams;

  if (owner) {
    const hasAccess = await hasFamilyModuleAccess(session.user.id, owner, "notes");
    if (!hasAccess) notFound();
  }

  const groups = await getFamilySharedNotes(session.user.id, owner);

  return (
    <>
      <Breadcrumbs items={[{ label: "Family", href: "/family" }, { label: "Notes" }]} />
      <PageHeader
        eyebrow="Family shared"
        title="Family Notes"
        description="Read-only notes, checklists, and rich pages shared by your family members."
        icon={<StickyNote className="h-5 w-5 text-teal-600 dark:text-teal-400" />}
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
              icon={<StickyNote className="h-8 w-8 text-text-muted" />}
              title="No shared notes"
              description="No family members have shared notes with you yet."
              action={
                <Link
                  href="/family"
                  className="btn btn-primary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
                >
                  Manage family sharing
                </Link>
              }
            />
          </Card>
        )}

        {groups.map((group) => {
          const owner = group.owner;
          if (!owner) return null;
          return (
            <div key={group.membershipId} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-subtle text-brand">
                    <User className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-text-primary">
                      {owner.name || owner.email}&apos;s Notes
                    </h3>
                    <p className="text-xs text-text-muted">
                      {group.notes.length} note {group.notes.length === 1 ? "page" : "pages"} shared
                    </p>
                  </div>
                </div>
                <Badge variant="default">Read-only</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.notes.map((note) => (
                  <Link key={note.id} href={`/family/${owner.id}/notes`} className="group block">
                    <Card className="p-4 hover:border-brand/40 transition-colors h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-semibold text-text-primary group-hover:text-brand transition-colors truncate">
                            {note.title}
                          </h4>
                          {note.isPinned && (
                            <Pin className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
                          )}
                        </div>
                        <div
                          className="mt-2 text-xs text-text-muted line-clamp-3 prose dark:prose-invert"
                          dangerouslySetInnerHTML={{ __html: note.content || "Empty page" }}
                        />
                      </div>
                      <div className="mt-3 pt-2 border-t border-border-subtle flex items-center justify-between text-[11px] text-text-muted">
                        <span>View note</span>
                        <ChevronRight className="h-3.5 w-3.5 text-text-muted group-hover:text-brand transition-colors" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
