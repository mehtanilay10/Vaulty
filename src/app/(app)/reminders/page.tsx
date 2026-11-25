import { Suspense } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { RemindersClient } from "@/components/reminders/RemindersClient";

export default async function RemindersPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const [reminders, sharedFamilyCount] = await Promise.all([
    prisma.reminder.findMany({
      where: { userId: session.user.id, isActive: true },
      orderBy: [{ isCompleted: "asc" }, { dueAt: "asc" }],
    }),
    prisma.familyMembership.count({
      where: { memberId: session.user.id, shareReminders: true },
    }),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <RemindersClient
          initialReminders={JSON.parse(JSON.stringify(reminders))}
          hasFamilyReminders={sharedFamilyCount > 0}
        />
      </Suspense>
    </>
  );
}
