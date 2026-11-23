import { auth } from "@/auth";
import Link from "next/link";
import { getFamilySharedNotes } from "@/lib/family-service";
import { PageHeader } from "@/components/shell/PageHeader";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { notFound } from "next/navigation";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { StickyNote, User, Pin, CheckSquare, Image as ImageIcon } from "lucide-react";
import type { NoteTodo, NoteImage } from "@/types/notes";

export default async function FamilyOwnerNotesPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { ownerId } = await params;
  if (!ownerId || typeof ownerId !== "string") notFound();

  const hasAccess = await hasFamilyModuleAccess(session.user.id, ownerId, "notes");
  if (!hasAccess) notFound();

  const groups = await getFamilySharedNotes(session.user.id, ownerId);

  return (
    <>
      <Breadcrumbs items={[{ label: "Family", href: "/family" }, { label: "Notes" }]} />
      <PageHeader
        eyebrow="Family shared"
        title="Notes & Lists"
        description="Read-only note pages, to-dos, and attachments shared by your family member."
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
              icon={<StickyNote className="h-6 w-6" />}
              title="No notes shared"
              description="When a family member shares their Notes module, their note pages will appear here."
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
                      {ownerLabel}&apos;s Notes
                    </h2>
                    <p className="text-[11px] text-text-muted">
                      {group.notes.length} shared note page{group.notes.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </div>

              {group.notes.length === 0 ? (
                <Card>
                  <p className="p-6 text-center text-sm text-text-muted">
                    No note pages have been created yet.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {group.notes.map((note) => {
                    const todos = Array.isArray(note.todos)
                      ? (note.todos as unknown as NoteTodo[])
                      : [];
                    const images = Array.isArray(note.images)
                      ? (note.images as unknown as NoteImage[])
                      : [];
                    const completedTodos = todos.filter((t) => t.completed).length;

                    return (
                      <div
                        key={note.id}
                        className="flex flex-col rounded-xl overflow-hidden"
                        style={note.color ? { borderTop: `4px solid ${note.color}` } : undefined}
                      >
                        <Card className="flex flex-col flex-1 transition-all hover:shadow-md h-full">
                          <div className="space-y-3 flex-1 flex flex-col">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold text-text-primary line-clamp-1">
                                {note.title}
                              </h3>
                              {note.isPinned && (
                                <Badge variant="warning" className="gap-1 shrink-0 text-[10px]">
                                  <Pin className="h-2.5 w-2.5" /> Pinned
                                </Badge>
                              )}
                            </div>

                            {note.content && (
                              <div
                                className="text-xs text-text-secondary line-clamp-4 leading-relaxed flex-1 prose dark:prose-invert max-w-none"
                                dangerouslySetInnerHTML={{ __html: note.content }}
                              />
                            )}

                            {todos.length > 0 && (
                              <div className="space-y-1.5 pt-2 border-t border-border-subtle">
                                <div className="flex items-center justify-between text-[11px] font-medium text-text-muted">
                                  <span className="flex items-center gap-1">
                                    <CheckSquare className="h-3 w-3" /> To-Dos
                                  </span>
                                  <span>
                                    {completedTodos}/{todos.length}
                                  </span>
                                </div>
                                <div className="space-y-1 max-h-28 overflow-y-auto pr-1">
                                  {todos.slice(0, 4).map((todo) => (
                                    <div
                                      key={todo.id}
                                      className="flex items-center gap-2 text-xs text-text-secondary"
                                    >
                                      <input
                                        type="checkbox"
                                        checked={todo.completed}
                                        readOnly
                                        className="rounded border-border text-brand-600 focus:ring-brand-500 h-3 w-3"
                                      />
                                      <span
                                        className={`truncate ${
                                          todo.completed ? "line-through opacity-60" : ""
                                        }`}
                                      >
                                        {todo.text}
                                      </span>
                                    </div>
                                  ))}
                                  {todos.length > 4 && (
                                    <p className="text-[10px] text-text-muted italic">
                                      +{todos.length - 4} more items
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}

                            {images.length > 0 && (
                              <div className="pt-2 border-t border-border-subtle space-y-1.5">
                                <p className="text-[11px] font-medium text-text-muted flex items-center gap-1">
                                  <ImageIcon className="h-3 w-3" /> {images.length} attachment
                                  {images.length === 1 ? "" : "s"}
                                </p>
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                  {images.map((img) => (
                                    <a
                                      key={img.id}
                                      href={img.url}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="shrink-0 group relative rounded-lg overflow-hidden border border-border-subtle h-14 w-14 bg-surface-muted"
                                    >
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={img.url}
                                        alt={img.name || "Attachment"}
                                        className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                                      />
                                    </a>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="pt-2 text-[10px] text-text-muted">
                              Updated {new Date(note.updatedAt).toLocaleDateString()}
                            </div>
                          </div>
                        </Card>
                      </div>
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
