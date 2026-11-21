import { prisma } from "@/lib/prisma";
import type { Notification } from "@prisma/client";
import { sendPushToUser } from "@/lib/web-push";

export type NotificationType =
  | "DOCUMENT_EXPIRY"
  | "REMINDER_DUE"
  | "WEALTH_PAYMENT_DUE"
  | "WEALTH_EXPIRY"
  | "AI_PROCESSING_FAILED"
  | "GOOGLE_DRIVE_DISCONNECTED"
  | "SYNC_CONFLICT"
  | "FOLDER_SHARED"
  | "PUBLIC_SHARE_ACCESSED"
  | "PUBLIC_SHARE_EXPIRED"
  | "VAULT_SHARED"
  | "CREDENTIAL_ACCESS"
  | "FAMILY_INVITE"
  | "FAMILY_INVITE_ACCEPTED"
  | "FAMILY_INVITE_REJECTED"
  | "FAMILY_SHARING_UPDATED"
  | "FAMILY_ACCESS_REVOKED"
  | "FAMILY_CREDENTIAL_KEY_SHARED"
  | "FAMILY_CREDENTIAL_KEY_ROTATED"
  | "WEALTH_TRANSACTION_AUTO_IMPORTED"
  | "WEALTH_TRANSACTION_PENDING_REVIEW"
  | "WEALTH_ACCOUNT_MERGED";

export interface NotificationOptions {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  actionUrl?: string;
  /** Stable event identifier supplied by the business operation for retry safety. */
  idempotencyKey?: string;
  read?: boolean;
}

/**
 * Create a notification for a user
 */
export async function createNotification(options: NotificationOptions): Promise<void> {
  const data = {
    userId: options.userId,
    type: options.type,
    title: options.title,
    message: options.message,
    metadata: options.metadata ? JSON.stringify(options.metadata) : null,
    actionUrl: options.actionUrl || null,
    idempotencyKey: options.idempotencyKey ?? null,
    read: options.read ?? false,
  };
  let notification: Notification;
  if (options.idempotencyKey) {
    notification = await prisma.notification.upsert({
      where: { idempotencyKey: options.idempotencyKey },
      create: data,
      update: {},
    });
    // If push was already sent for this idempotent notification, return early
    if (notification.pushSentAt) {
      return;
    }
  } else {
    notification = await prisma.notification.create({ data });
  }

  const preferences = await prisma.user.findUnique({
    where: { id: options.userId },
    select: { pushNotificationsEnabled: true },
  });

  if (!preferences) {
    console.error(
      `[notifications] User preferences not found for userId: ${options.userId}. Push notification delivery skipped.`,
    );
    return;
  }

  if (preferences.pushNotificationsEnabled) {
    // Atomically claim push dispatch to eliminate race conditions between concurrent processes
    const claim = await prisma.notification.updateMany({
      where: {
        id: notification.id,
        pushSentAt: null,
      },
      data: {
        pushSentAt: new Date(),
      },
    });

    if (claim.count === 0) {
      return;
    }

    try {
      const result = await sendPushToUser(options.userId, {
        title: options.title,
        body: options.message,
        url: options.actionUrl || "/notifications",
      });
      if (result.sent > 0) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { pushLastError: null },
        });
      } else if (result.failed > 0) {
        await prisma.notification.update({
          where: { id: notification.id },
          data: { pushLastError: "Browser push delivery failed." },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "unknown error";
      console.error("[notifications] push dispatch failed", errorMessage);
      await prisma.notification
        .update({
          where: { id: notification.id },
          data: { pushLastError: errorMessage },
        })
        .catch(() => {});
    }
  }
}

/**
 * Get unread notifications for a user
 */
export async function getUnreadNotifications(userId: string, limit = 25, cursor?: string) {
  const rows = await prisma.notification.findMany({
    where: { userId, read: false },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const notifications = rows.slice(0, limit);
  return {
    notifications,
    pagination: {
      hasMore,
      nextCursor: hasMore ? (notifications[notifications.length - 1]?.id ?? null) : null,
    },
  };
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(
  notificationId: string,
  userId: string,
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      id: notificationId,
      userId,
    },
    data: {
      read: true,
    },
  });
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllNotificationsAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
    },
    data: {
      read: true,
    },
  });
}

/**
 * Delete old notifications (older than 30 days)
 */
export async function cleanupOldNotifications(): Promise<void> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  await prisma.notification.deleteMany({
    where: {
      createdAt: {
        lt: thirtyDaysAgo,
      },
      read: true,
    },
  });
}
