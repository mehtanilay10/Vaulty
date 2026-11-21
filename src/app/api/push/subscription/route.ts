import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { getVapidPublicKey, isValidPushEndpoint, encryptPushSecret } from "@/lib/web-push";

const subscriptionSchema = z
  .object({
    endpoint: z
      .string()
      .url()
      .max(4000)
      .refine(isValidPushEndpoint, "A valid HTTPS push endpoint is required."),
    keys: z.object({ p256dh: z.string().min(1).max(512), auth: z.string().min(1).max(512) }),
  })
  .strict();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    publicKey: getVapidPublicKey(),
    enabled: Boolean(getVapidPublicKey()),
    subscribed: (await prisma.pushSubscription.count({ where: { userId: user.id } })) > 0,
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validateCSRFRequest(req))
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  if (!getVapidPublicKey())
    return NextResponse.json(
      { error: "Browser push is not configured on this server." },
      { status: 503 },
    );
  const parsed = subscriptionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    create: {
      userId: user.id,
      endpoint: parsed.data.endpoint,
      p256dh: encryptPushSecret(parsed.data.keys.p256dh),
      auth: encryptPushSecret(parsed.data.keys.auth),
      userAgent: req.headers.get("user-agent"),
    },
    update: {
      userId: user.id,
      p256dh: encryptPushSecret(parsed.data.keys.p256dh),
      auth: encryptPushSecret(parsed.data.keys.auth),
      userAgent: req.headers.get("user-agent"),
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { pushNotificationsEnabled: true } });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!validateCSRFRequest(req))
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  const parsed = z
    .object({
      endpoint: z
        .string()
        .url()
        .max(4000)
        .refine(isValidPushEndpoint, "A valid HTTPS push endpoint is required."),
    })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid push subscription." }, { status: 400 });
  await prisma.pushSubscription.deleteMany({
    where: { userId: user.id, endpoint: parsed.data.endpoint },
  });
  const remaining = await prisma.pushSubscription.count({ where: { userId: user.id } });
  if (!remaining)
    await prisma.user.update({ where: { id: user.id }, data: { pushNotificationsEnabled: false } });
  return NextResponse.json({ success: true });
}
