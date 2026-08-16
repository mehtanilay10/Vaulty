import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { notFound } from "next/navigation";
import { DocumentDetailClient } from "@/components/documents/DocumentDetailClient";

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { documentId } = await params;
  const access = await checkDocumentAccess(session.user.id, documentId);

  if (!access.hasAccess) {
    notFound();
  }

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

  if (!document) {
    notFound();
  }

  // Fetch owned folders for move dropdown
  const folders = await prisma.folder.findMany({
    where: { ownerId: session.user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <DocumentDetailClient
      document={JSON.parse(JSON.stringify(document))}
      folders={JSON.parse(JSON.stringify(folders))}
      isOwner={access.isOwner}
      permission={access.permission}
    />
  );
}
