import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { hasFamilyModuleAccess } from "@/lib/family-access";
import { notFound } from "next/navigation";
import { DocumentDetailClient } from "@/components/documents/DocumentDetailClient";

export default async function FamilyDocumentDetailPage({
  params,
}: {
  params: Promise<{ ownerId: string; documentId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { ownerId, documentId } = await params;

  if (!ownerId || !documentId || typeof ownerId !== "string" || typeof documentId !== "string") {
    notFound();
  }

  // Verify family document access from the specific owner
  const hasFamilyAccess = await hasFamilyModuleAccess(session.user.id, ownerId, "documents");
  if (!hasFamilyAccess) notFound();

  // Verify document access
  const access = await checkDocumentAccess(session.user.id, documentId);
  if (!access.hasAccess) notFound();

  const document = await prisma.document.findUnique({
    where: { id: documentId },
    include: {
      owner: { select: { id: true, name: true, email: true, image: true } },
      folder: {
        select: {
          id: true,
          name: true,
          parent: { select: { id: true, name: true } },
        },
      },
      tags: { include: { tag: true } },
      aiProcessing: true,
    },
  });

  if (!document || document.ownerId !== ownerId) notFound();

  const folders = await prisma.folder.findMany({
    where: { ownerId: session.user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  const familyOwner = await prisma.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true },
  });

  return (
    <DocumentDetailClient
      document={JSON.parse(JSON.stringify(document))}
      folders={JSON.parse(JSON.stringify(folders))}
      isOwner={document.ownerId === session.user.id}
      familyOwner={familyOwner}
    />
  );
}
