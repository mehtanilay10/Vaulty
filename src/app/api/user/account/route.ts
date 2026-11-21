import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { getProviderForUser } from "@/lib/storage/factory";
import { revokeGoogleTokens } from "@/lib/google-drive/oauth";

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    // 1. Attempt Google Drive cleanup & OAuth token revocation if connected
    try {
      const connection = await prisma.storageConnection.findFirst({
        where: { userId: user.id, provider: "GOOGLE_DRIVE" },
      });

      if (connection) {
        if (connection.rootFolderId) {
          try {
            const { provider } = await getProviderForUser(user.id, "GOOGLE_DRIVE");
            await provider.deleteFolder(connection.rootFolderId);
          } catch (folderErr) {
            console.error(
              "Failed to delete user Google Drive root folder during account deletion:",
              folderErr,
            );
          }
        }

        if (connection.accessToken) {
          try {
            await revokeGoogleTokens(connection.accessToken);
          } catch (tokenErr) {
            console.error("Failed to revoke Google tokens during account deletion:", tokenErr);
          }
        }
      }
    } catch (driveErr) {
      console.error("Google Drive cleanup error during account deletion:", driveErr);
    }

    // 2. Perform complete transactional cleanup of all user records
    await prisma.$transaction(async (tx) => {
      // AI and Chat
      await tx.chatMessage.deleteMany({ where: { session: { userId: user.id } } });
      await tx.chatSession.deleteMany({ where: { userId: user.id } });

      // Notifications, Reminders & Push
      await tx.reminder.deleteMany({ where: { userId: user.id } });
      await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });

      // Settings
      await tx.pdfPasswordSettings.deleteMany({ where: { userId: user.id } });

      // Family
      await tx.familyCredentialKey.deleteMany({
        where: { OR: [{ ownerId: user.id }, { memberId: user.id }] },
      });
      await tx.familyMembership.deleteMany({
        where: { OR: [{ ownerId: user.id }, { memberId: user.id }] },
      });
      await tx.familyInvitation.deleteMany({ where: { ownerId: user.id } });

      // Email Integrations
      await tx.emailTransactionImport.deleteMany({ where: { ownerId: user.id } });
      await tx.emailDocumentImport.deleteMany({ where: { ownerId: user.id } });
      await tx.emailReminderImport.deleteMany({ where: { ownerId: user.id } });
      await tx.inboundEmailAttachment.deleteMany({ where: { userId: user.id } });
      await tx.gmailConnection.deleteMany({ where: { ownerId: user.id } });
      await tx.outlookConnection.deleteMany({ where: { ownerId: user.id } });

      // Wealth
      await tx.wealthTransaction.deleteMany({ where: { account: { ownerId: user.id } } });
      await tx.wealthAccount.deleteMany({ where: { ownerId: user.id } });

      // Passwords & Credentials
      await tx.vaultShare.deleteMany({
        where: { OR: [{ sharedById: user.id }, { sharedWithId: user.id }] },
      });
      await tx.appCredential.deleteMany({ where: { vault: { userId: user.id } } });
      await tx.bankCredential.deleteMany({ where: { vault: { userId: user.id } } });
      await tx.passwordVault.deleteMany({ where: { userId: user.id } });

      // Documents & Storage
      await tx.shareLink.deleteMany({ where: { document: { ownerId: user.id } } });
      await tx.aiJob.deleteMany({ where: { document: { ownerId: user.id } } });
      await tx.aiProcessing.deleteMany({ where: { document: { ownerId: user.id } } });
      await tx.documentTag.deleteMany({ where: { document: { ownerId: user.id } } });
      await tx.document.deleteMany({ where: { ownerId: user.id } });
      await tx.folderShare.deleteMany({
        where: { OR: [{ sharedWithUserId: user.id }, { createdById: user.id }] },
      });
      await tx.folder.deleteMany({ where: { ownerId: user.id } });
      await tx.syncEvent.deleteMany({ where: { userId: user.id } });
      await tx.storageConnection.deleteMany({ where: { userId: user.id } });

      // Audit logs, Auth sessions, and rows without a user FK
      await tx.auditLog.deleteMany({ where: { userId: user.id } });
      await tx.account.deleteMany({ where: { userId: user.id } });
      await tx.session.deleteMany({ where: { userId: user.id } });
      if (user.email) {
        await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
      }
      await tx.securityRateLimit.deleteMany({
        where: { key: { endsWith: `:${user.id}` } },
      });

      // Finally, delete user record
      await tx.user.delete({ where: { id: user.id } });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/user/account error:", error);
    return NextResponse.json({ error: "Failed to delete account." }, { status: 500 });
  }
}
