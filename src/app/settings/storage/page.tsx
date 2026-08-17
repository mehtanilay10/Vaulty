import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { StorageSettingsClient } from "@/components/settings/StorageSettingsClient";

export default async function StorageSettingsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      defaultStorageProvider: true,
      storageConnections: {
        where: { provider: "GOOGLE_DRIVE" },
      },
    },
  });

  if (!user) return null;

  return (
    <StorageSettingsClient
      user={user}
    />
  );
}
