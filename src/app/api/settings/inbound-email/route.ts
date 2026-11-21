import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { createAuditLog } from "@/lib/audit-log";
import { z } from "zod";
import { randomBytes } from "node:crypto";

const updateSchema = z.object({
  enabled: z.boolean().optional(),
  slug: z
    .string()
    .min(3)
    .max(30)
    .regex(
      /^[a-z0-9_-]+$/,
      "Slug can only contain lowercase alphanumeric characters, underscores, and dashes",
    )
    .optional(),
  allowedSenders: z.array(z.string().email()).optional(),
  regenerateToken: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const userData = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        email: true,
        name: true,
        inboundEmailToken: true,
        inboundEmailSlug: true,
        inboundEmailEnabled: true,
        inboundAllowedSenders: true,
      },
    });

    if (!userData) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const domain = process.env.INBOUND_EMAIL_DOMAIN || "vaulty.mnilay.com";
    const defaultSlug =
      userData.inboundEmailSlug ||
      userData.email
        ?.split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "") ||
      `user_${userData.id.slice(-6)}`;

    // Ensure user has a token generated
    let token = userData.inboundEmailToken;
    if (!token) {
      token = randomBytes(4).toString("hex");
      await prisma.user.update({
        where: { id: user.id },
        data: { inboundEmailToken: token, inboundEmailSlug: defaultSlug },
      });
    }

    const forwardingAddress = `${defaultSlug}+${token}@${domain}`;
    const tokenAddress = `${defaultSlug}.${token}@${domain}`;

    return NextResponse.json({
      enabled: userData.inboundEmailEnabled,
      slug: defaultSlug,
      token,
      domain,
      forwardingAddress,
      tokenAddress,
      allowedSenders: userData.inboundAllowedSenders || [],
    });
  } catch (error) {
    console.error("[inbound-email-settings] GET error:", error);
    return NextResponse.json({ error: "Failed to retrieve inbound settings." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid settings payload." }, { status: 400 });
    }

    const { enabled, slug, allowedSenders, regenerateToken } = parsed.data;
    const updateData: Record<string, unknown> = {};

    if (typeof enabled === "boolean") {
      updateData.inboundEmailEnabled = enabled;
    }

    if (slug) {
      // Ensure slug uniqueness
      const existing = await prisma.user.findFirst({
        where: { inboundEmailSlug: slug, id: { not: user.id } },
      });
      if (existing) {
        return NextResponse.json(
          { error: "This email username is already taken." },
          { status: 409 },
        );
      }
      updateData.inboundEmailSlug = slug;
    }

    if (allowedSenders) {
      updateData.inboundAllowedSenders = allowedSenders;
    }

    if (regenerateToken) {
      updateData.inboundEmailToken = randomBytes(4).toString("hex");
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updateData,
      select: {
        inboundEmailEnabled: true,
        inboundEmailSlug: true,
        inboundEmailToken: true,
        inboundAllowedSenders: true,
        email: true,
      },
    });

    const domain = process.env.INBOUND_EMAIL_DOMAIN || "vaulty.mnilay.com";
    const activeSlug =
      updated.inboundEmailSlug ||
      updated.email
        ?.split("@")[0]
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "") ||
      `user_${user.id.slice(-6)}`;

    await createAuditLog({
      userId: user.id,
      action: "INBOUND_EMAIL_SETTINGS_UPDATED",
      metadata: { enabled, slug: activeSlug, regenerateToken },
    });

    return NextResponse.json({
      success: true,
      enabled: updated.inboundEmailEnabled,
      slug: activeSlug,
      token: updated.inboundEmailToken,
      domain,
      forwardingAddress: `${activeSlug}+${updated.inboundEmailToken}@${domain}`,
      tokenAddress: `${activeSlug}.${updated.inboundEmailToken}@${domain}`,
      allowedSenders: updated.inboundAllowedSenders,
    });
  } catch (error) {
    console.error("[inbound-email-settings] PATCH error:", error);
    return NextResponse.json({ error: "Failed to update inbound settings." }, { status: 500 });
  }
}
