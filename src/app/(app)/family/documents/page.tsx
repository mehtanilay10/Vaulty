import { auth } from "@/auth";
import Link from "next/link";
import { getFamilySharedDocuments } from "@/lib/family-service";
import { PageHeader } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { notFound } from "next/navigation";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { Folder, FileText, Lock, User, ChevronRight } from "lucide-react";

export default async function FamilyDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ owner?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { owner } = await searchParams;

  if (owner) {
    const hasAccess = await hasFamilyModuleAccess(session.user.id, owner, "documents");
    if (!hasAccess) notFound();
  }

  const groups = await getFamilySharedDocuments(session.user.id, owner);

  return (
    <>
      <Breadcrumbs items={[{ label: "Family", href: "/family" }, { label: "Documents" }]} />
      <PageHeader
        eyebrow="Family shared"
        title="Documents"
        description="Read-only document folders shared by your family. Files stay in the owner's storage and cannot be edited or re-shared by you."
        icon={<Folder className="h-5 w-5" />}
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
              icon={<Folder className="h-6 w-6" />}
              title="No family documents shared"
              description="When a family member shares their Documents module, their folders will appear here."
              action={
                <Link
                  href="/family"
                  className="btn btn-primary inline-flex h-9 items-center gap-2 px-3.5 text-[13px]"
                >
                  Go to Family
                </Link>
              }
            />
          </Card>
        )}

        {groups.map((group) => (
          <section key={group.membershipId} className="space-y-3">
            <div className="flex items-center gap-2">
              <Badge variant="info" className="gap-1">
                <User className="h-3 w-3" />
                Owner: {group.owner?.name || group.owner?.email || "Family member"}
              </Badge>
              <Badge variant="default" className="gap-1">
                <Lock className="h-3 w-3" />
                Read-only
              </Badge>
            </div>

            {group.folders.length === 0 && (!group.documents || group.documents.length === 0) ? (
              <Card className="p-6 text-center text-[13px] text-text-muted">
                This owner has no shared documents or folders to show yet.
              </Card>
            ) : (
              <div className="space-y-4">
                {group.folders.length > 0 && (
                  <div className="space-y-2">
                    {group.documents && group.documents.length > 0 && (
                      <p className="text-[12px] font-semibold tracking-wider text-text-muted uppercase">
                        Folders
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.folders.map((folder) => (
                        <Link key={folder.id} href={`/folders/${folder.id}`}>
                          <Card hover className="group flex h-full items-start gap-3 p-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                              <Folder className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-text-primary">
                                {folder.name}
                              </p>
                              <p className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
                                <span className="inline-flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {folder.documentCount} files
                                </span>
                                <span>{folder.childCount} subfolders</span>
                              </p>
                            </div>
                            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {group.documents && group.documents.length > 0 && (
                  <div className="space-y-2">
                    {group.folders.length > 0 && (
                      <p className="text-[12px] font-semibold tracking-wider text-text-muted uppercase">
                        Files
                      </p>
                    )}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {group.documents.map((doc) => (
                        <Link
                          key={doc.id}
                          href={`/family/${group.owner?.id || group.ownerId}/documents/${doc.id}`}
                        >
                          <Card hover className="group flex h-full items-start gap-3 p-4">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand-subtle text-brand">
                              <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13px] font-semibold text-text-primary">
                                {doc.name}
                              </p>
                              <p className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
                                <span>{new Date(doc.createdAt).toLocaleDateString()}</span>
                              </p>
                            </div>
                            <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
                          </Card>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        ))}
      </div>
    </>
  );
}
