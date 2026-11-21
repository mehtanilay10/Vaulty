import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getProviderForDocument } from "@/lib/storage/factory";
import { getShareAuthCookieName, verifyShareAuthToken } from "@/lib/share-crypto";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;

    const shareLink = await prisma.shareLink.findUnique({
      where: { token },
      include: {
        document: true,
      },
    });

    if (!shareLink || !shareLink.isActive) {
      return NextResponse.json(
        { error: "Share link not found or has been revoked." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (shareLink.expiresAt && new Date(shareLink.expiresAt) < new Date()) {
      return NextResponse.json(
        { error: "This share link has expired." },
        { status: 410, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (shareLink.maxViews && shareLink.viewCount >= shareLink.maxViews) {
      return NextResponse.json(
        { error: "This share link has reached its maximum number of views." },
        { status: 410, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (shareLink.password) {
      const cookieName = getShareAuthCookieName(shareLink.token);
      const isAuthed = verifyShareAuthToken(shareLink.token, req.cookies.get(cookieName)?.value);

      if (!isAuthed) {
        return NextResponse.json(
          { requiresPassword: true, documentName: shareLink.document.name },
          { status: 401, headers: { "Cache-Control": "private, no-store" } },
        );
      }
    }

    const doc = shareLink.document;

    // View deduplication: range requests (HTTP 206) from PDF viewers shouldn't burn multiple views
    const viewCookieName = `share_view_${shareLink.token}`;
    const hasViewSession = Boolean(req.cookies.get(viewCookieName)?.value);

    // Re-read immediately before accessing storage so a revoked/expired link is
    // rejected on the next request, even if metadata was fetched moments earlier.
    const currentLink = await prisma.shareLink.findUnique({
      where: { id: shareLink.id },
      select: { isActive: true, expiresAt: true, password: true, maxViews: true, viewCount: true },
    });
    if (!currentLink?.isActive || (currentLink.expiresAt && currentLink.expiresAt <= new Date())) {
      return NextResponse.json(
        { error: "This share link is no longer available." },
        { status: 410, headers: { "Cache-Control": "private, no-store" } },
      );
    }
    if (
      currentLink.password &&
      !verifyShareAuthToken(token, req.cookies.get(getShareAuthCookieName(token))?.value)
    ) {
      return NextResponse.json(
        { requiresPassword: true },
        { status: 401, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    if (doc.storageProvider === "GOOGLE_DRIVE" && doc.storageFileId) {
      try {
        const { provider } = await getProviderForDocument({
          id: doc.id,
          storageProvider: doc.storageProvider,
          storageFileId: doc.storageFileId,
          ownerId: doc.ownerId,
          folderId: doc.folderId,
        });

        const stream = await provider.downloadFileStream(doc.storageFileId);

        // Only consume a view once the file has actually been fetched, so
        // missing files or Drive failures do not burn the view limit.
        if (!hasViewSession) {
          const viewReservation = await prisma.shareLink.updateMany({
            where: {
              id: shareLink.id,
              isActive: true,
              ...(currentLink.maxViews ? { viewCount: { lt: currentLink.maxViews } } : {}),
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            },
            data: { viewCount: { increment: 1 } },
          });

          if (viewReservation.count === 0 && currentLink.maxViews) {
            return NextResponse.json(
              { error: "This share link has reached its maximum number of views." },
              { status: 410, headers: { "Cache-Control": "private, no-store" } },
            );
          }
        }

        const responseHeaders: Record<string, string> = {
          "Content-Type": doc.mimeType,
          "Content-Disposition": `inline; filename="${encodeURIComponent(doc.name)}"`,
          "Cache-Control": "private, no-store, max-age=0",
          Pragma: "no-cache",
          "X-Content-Type-Options": "nosniff",
        };

        if (!hasViewSession) {
          responseHeaders["Set-Cookie"] =
            `${viewCookieName}=1; Path=/api/share/${encodeURIComponent(shareLink.token)}; Max-Age=900; SameSite=Lax; HttpOnly${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
        }

        return new Response(stream, {
          headers: responseHeaders,
        });
      } catch (driveError) {
        console.error("Drive file fetch error:", driveError);
        return NextResponse.json(
          { error: "Failed to fetch document from Google Drive." },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({ error: "Document file not found." }, { status: 404 });
  } catch (error) {
    console.error("Error streaming shared document file:", error);
    return NextResponse.json(
      { error: "An unexpected error occurred while retrieving the document file." },
      { status: 500 },
    );
  }
}
