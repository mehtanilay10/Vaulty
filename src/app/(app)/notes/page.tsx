import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { NotesClient } from "@/components/notes/NotesClient";

export default async function NotesPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [notes, sharedFamilyCount] = await Promise.all([
    prisma.notePage.findMany({
      where: { userId: session.user.id, isArchived: false },
      orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
    }),
    prisma.familyMembership.count({
      where: { memberId: session.user.id, shareNotes: true },
    }),
  ]);

  return (
    <>
      <Breadcrumbs items={[{ label: "Dashboard", href: "/dashboard" }, { label: "Notes" }]} />
      <Suspense fallback={null}>
        <NotesClient
          initialNotes={JSON.parse(JSON.stringify(notes))}
          hasFamilyNotes={sharedFamilyCount > 0}
        />
      </Suspense>
    </>
  );
}
