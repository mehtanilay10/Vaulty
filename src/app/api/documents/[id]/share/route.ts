import { NextRequest, NextResponse } from "next/server";
import { randomInt } from "node:crypto";
import { readJsonRecord } from "@/lib/api-validation";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkDocumentAccess } from "@/lib/authz";
import { hashSharePassword } from "@/lib/share-crypto";
import { validateCSRFRequest } from "@/lib/csrf";
import { getAppBaseUrl } from "@/lib/url";

const MAX_SHARE_EXPIRY_HOURS = 8760;
const MAX_SHARE_VIEWS = 1000;
const SHARE_PASSWORD_MIN_LENGTH = 8;
const SHARE_PASSWORD_MAX_LENGTH = 128;
const SHARE_PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;

function generateToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  // randomInt avoids the modulo bias of bytes % chars.length.
  return Array.from({ length: 32 }, () => chars[randomInt(chars.length)]).join("");
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const access = await checkDocumentAccess(user.id, id);
    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the document owner can create share links." },
        { status: 403 },
      );
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const { expiresInHours, maxViews, password } = body;

    if (
      expiresInHours !== undefined &&
      expiresInHours !== null &&
      (typeof expiresInHours !== "number" ||
        !Number.isFinite(expiresInHours) ||
        expiresInHours <= 0 ||
        expiresInHours > MAX_SHARE_EXPIRY_HOURS)
    ) {
      return NextResponse.json(
        { error: `expiresInHours must be between 1 and ${MAX_SHARE_EXPIRY_HOURS}.` },
        { status: 400 },
      );
    }

    if (
      maxViews !== undefined &&
      maxViews !== null &&
      (typeof maxViews !== "number" ||
        !Number.isInteger(maxViews) ||
        maxViews <= 0 ||
        maxViews > MAX_SHARE_VIEWS)
    ) {
      return NextResponse.json(
        { error: `maxViews must be between 1 and ${MAX_SHARE_VIEWS}.` },
        { status: 400 },
      );
    }

    const hours =
      typeof expiresInHours === "number" && Number.isFinite(expiresInHours) && expiresInHours > 0
        ? expiresInHours
        : null;
    const views =
      typeof maxViews === "number" && Number.isInteger(maxViews) && maxViews > 0 ? maxViews : null;

    let sharePassword: string | null = null;
    if (password !== undefined && password !== null && password !== "") {
      if (
        typeof password !== "string" ||
        password.length < SHARE_PASSWORD_MIN_LENGTH ||
        password.length > SHARE_PASSWORD_MAX_LENGTH ||
        !SHARE_PASSWORD_PATTERN.test(password)
      ) {
        return NextResponse.json(
          {
            error: `Password must be ${SHARE_PASSWORD_MIN_LENGTH}-${SHARE_PASSWORD_MAX_LENGTH} characters and include at least one letter and one number.`,
          },
          { status: 400 },
        );
      }
      sharePassword = password;
    }

    const expiresAt = hours ? new Date(Date.now() + hours * 60 * 60 * 1000) : null;

    const token = generateToken();
    const hashedPassword = sharePassword ? hashSharePassword(sharePassword) : null;

    const shareLink = await prisma.shareLink.create({
      data: {
        documentId: id,
        token,
        password: hashedPassword,
        expiresAt,
        maxViews: views,
        createdBy: user.id,
      },
      select: {
        id: true,
        token: true,
        expiresAt: true,
        maxViews: true,
        viewCount: true,
        createdAt: true,
      },
    });

    const baseUrl = getAppBaseUrl();
    const shareUrl = `${baseUrl}/share/${shareLink.token}`;

    return NextResponse.json({
      success: true,
      shareLink: { ...shareLink, url: shareUrl, hasPassword: !!sharePassword },
    });
  } catch (error) {
    console.error("POST /api/documents/[id]/share error:", error);
    return NextResponse.json({ error: "Failed to create share link." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }
    const access = await checkDocumentAccess(user.id, id);
    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the document owner can revoke share links." },
        { status: 403 },
      );
    }

    const body = await readJsonRecord(req);
    const token = typeof body?.token === "string" ? body.token.trim() : "";
    if (!token || token.length > 128) {
      return NextResponse.json({ error: "A valid share link token is required." }, { status: 400 });
    }

    const result = await prisma.shareLink.deleteMany({
      where: { documentId: id, createdBy: user.id, token },
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Share link not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/documents/[id]/share error:", error);
    return NextResponse.json({ error: "Failed to revoke share links." }, { status: 500 });
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const access = await checkDocumentAccess(user.id, id);
    if (!access.isOwner) {
      return NextResponse.json(
        { error: "Only the document owner can view share links." },
        { status: 403 },
      );
    }

    const shareLinks = await prisma.shareLink.findMany({
      where: { documentId: id, createdBy: user.id },
      select: {
        id: true,
        token: true,
        password: true,
        expiresAt: true,
        maxViews: true,
        viewCount: true,
        isActive: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = getAppBaseUrl();
    const links = shareLinks.map((link) => ({
      id: link.id,
      token: link.token,
      expiresAt: link.expiresAt,
      maxViews: link.maxViews,
      viewCount: link.viewCount,
      isActive: link.isActive,
      createdAt: link.createdAt,
      url: `${baseUrl}/share/${link.token}`,
      hasPassword: !!link.password,
    }));

    return NextResponse.json({ shareLinks: links });
  } catch (error) {
    console.error("GET /api/documents/[id]/share error:", error);
    return NextResponse.json({ error: "Failed to fetch share links." }, { status: 500 });
  }
}
