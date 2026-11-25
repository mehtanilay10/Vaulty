import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getFamilySharedCredentials } from "@/lib/family-service";
import { FamilyCredentialsClient } from "@/components/family/FamilyCredentialsClient";
import { notFound } from "next/navigation";
import { hasFamilyModuleAccess } from "@/lib/family-access";

export default async function FamilyOwnerCredentialsPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const { ownerId } = await params;

  if (!ownerId || typeof ownerId !== "string") notFound();

  const hasAccess = await hasFamilyModuleAccess(session.user.id, ownerId, "credentials");
  if (!hasAccess) notFound();

  const [vault, groups] = await Promise.all([
    prisma.passwordVault.findUnique({
      where: { userId: session.user.id },
      select: { id: true, isConfigured: true },
    }),
    getFamilySharedCredentials(session.user.id, ownerId),
  ]);

  return (
    <>
      <FamilyCredentialsClient
        hasVault={!!vault?.isConfigured}
        initialGroups={JSON.parse(JSON.stringify(groups))}
      />
    </>
  );
}
