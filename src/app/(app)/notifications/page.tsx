import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shell/PageHeader";
import { Bell } from "lucide-react";
import {
  NotificationsClient,
  type NotificationDTO,
} from "@/components/notifications/NotificationsClient";

export const metadata = {
  title: "Notifications | Vaulty",
  description: "View and manage your account, document, and reminder alerts.",
};

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const rawNotifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const initialNotifications: NotificationDTO[] = rawNotifications.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    message: n.message,
    actionUrl: n.actionUrl,
    read: n.read,
    createdAt: n.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-6">
      <PageHeader title="Notifications" icon={<Bell className="h-5 w-5" />} />
      <NotificationsClient initialNotifications={initialNotifications} />
    </div>
  );
}
