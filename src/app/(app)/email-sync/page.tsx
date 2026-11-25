import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/shell/PageHeader";
import { Mail } from "lucide-react";
import { EmailSyncClient } from "./EmailSyncClient";
import { randomBytes } from "node:crypto";

export default async function EmailSyncPage({
  searchParams,
}: {
  searchParams?: Promise<{
    gmail_connected?: string;
    gmail_error?: string;
    outlook_connected?: string;
    outlook_error?: string;
  }>;
}) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const resolvedParams = searchParams ? await searchParams : {};
  let initialMessage = "";
  let initialError = "";

  if (resolvedParams.gmail_connected === "true") {
    initialMessage =
      "Gmail connected successfully. You can now scan for transactions, documents, and reminders.";
  } else if (resolvedParams.gmail_error) {
    initialError = "Gmail could not be connected. Please verify Google consent and try again.";
  } else if (resolvedParams.outlook_connected === "true") {
    initialMessage =
      "Outlook connected successfully. You can now scan for transactions, documents, and reminders.";
  } else if (resolvedParams.outlook_error) {
    initialError =
      "Outlook could not be connected. Please check your Microsoft account permissions.";
  }

  const [
    userRecord,
    gmailConnection,
    outlookConnection,
    accounts,
    folders,
    txCount,
    docCount,
    remCount,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        email: true,
        inboundEmailSlug: true,
        inboundEmailToken: true,
        inboundEmailEnabled: true,
      },
    }),
    prisma.gmailConnection.findUnique({
      where: { ownerId: session.user.id },
      select: {
        emailAddress: true,
        status: true,
        lastSyncedAt: true,
        connectedAt: true,
        syncPageToken: true,
        syncLookbackDays: true,
      },
    }),
    prisma.outlookConnection.findUnique({
      where: { ownerId: session.user.id },
      select: {
        emailAddress: true,
        status: true,
        lastSyncedAt: true,
        connectedAt: true,
        syncPageToken: true,
      },
    }),
    prisma.wealthAccount.findMany({
      where: { ownerId: session.user.id, status: "ACTIVE" },
      select: { id: true, name: true, bankName: true, type: true, currency: true },
      orderBy: { name: "asc" },
    }),
    prisma.folder.findMany({
      where: { ownerId: session.user.id },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    }),
    prisma.emailTransactionImport.count({
      where: { ownerId: session.user.id, status: "PENDING" },
    }),
    prisma.emailDocumentImport.count({
      where: { ownerId: session.user.id, status: "PENDING" },
    }),
    prisma.emailReminderImport.count({
      where: { ownerId: session.user.id, status: "PENDING" },
    }),
  ]);

  const domain = process.env.INBOUND_EMAIL_DOMAIN || "vaulty.mnilay.com";
  const defaultSlug =
    userRecord?.inboundEmailSlug ||
    userRecord?.email
      ?.split("@")[0]
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "") ||
    "user";

  let token = userRecord?.inboundEmailToken;
  if (!token) {
    token = randomBytes(4).toString("hex");
    await prisma.user.update({
      where: { id: session.user.id },
      data: { inboundEmailToken: token, inboundEmailSlug: defaultSlug },
    });
  }

  const initialInboundConfig = {
    forwardingAddress: `${defaultSlug}+${token}@${domain}`,
    enabled: userRecord?.inboundEmailEnabled ?? true,
  };

  return (
    <>
      <PageHeader title="Email Sync" icon={<Mail className="h-5 w-5" />} />

      <EmailSyncClient
        initialInboundConfig={initialInboundConfig}
        initialGmailConnection={
          gmailConnection
            ? JSON.parse(
                JSON.stringify({
                  emailAddress: gmailConnection.emailAddress,
                  status: gmailConnection.status,
                  lastSyncedAt: gmailConnection.lastSyncedAt,
                  connectedAt: gmailConnection.connectedAt,
                  syncLookbackDays: gmailConnection.syncLookbackDays,
                }),
              )
            : null
        }
        initialGmailHasMore={Boolean(gmailConnection?.syncPageToken)}
        initialGmailLookbackDays={gmailConnection?.syncLookbackDays || 7}
        initialOutlookConnection={
          outlookConnection
            ? JSON.parse(
                JSON.stringify({
                  emailAddress: outlookConnection.emailAddress,
                  status: outlookConnection.status,
                  lastSyncedAt: outlookConnection.lastSyncedAt,
                  connectedAt: outlookConnection.connectedAt,
                }),
              )
            : null
        }
        initialOutlookHasMore={Boolean(outlookConnection?.syncPageToken)}
        initialOutlookLookbackDays={7}
        accounts={accounts}
        folders={folders}
        initialCounts={{
          transactions: txCount,
          documents: docCount,
          reminders: remCount,
        }}
        initialMessage={initialMessage}
        initialError={initialError}
      />
    </>
  );
}
