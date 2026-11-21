import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { validateCSRFRequest } from "@/lib/csrf";
import { readJsonRecord } from "@/lib/api-validation";
import { sha256Hex } from "@/lib/server-crypto";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vault = await prisma.passwordVault.findUnique({
    where: { userId: session.user.id },
    select: {
      appLockPinHash: true,
      appLockWrappedKey: true,
    },
  });

  return NextResponse.json({
    hasPin: Boolean(vault?.appLockPinHash),
    wrappedKey: vault?.appLockWrappedKey || null,
  });
}

export async function POST(req: NextRequest) {
  if (!validateCSRFRequest(req)) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await readJsonRecord(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const pinHash =
    typeof body.pinHash === "string" ? body.pinHash : body.pinHash === null ? null : undefined;
  const wrappedKey =
    typeof body.wrappedKey === "string"
      ? body.wrappedKey
      : body.wrappedKey === null
        ? null
        : undefined;

  if (pinHash === undefined && wrappedKey === undefined) {
    return NextResponse.json({ error: "pinHash or wrappedKey is required" }, { status: 400 });
  }

  const updateData: { appLockPinHash?: string | null; appLockWrappedKey?: string | null } = {};
  if (pinHash !== undefined) {
    // Store only a one-way verification hash on the server. Never store the raw
    // pinHash used client-side for unwrapping the vault key.
    updateData.appLockPinHash = pinHash ? sha256Hex(`app-lock-verifier:${pinHash}`) : null;
    // When changing PIN without an updated wrapped key, clear any existing wrap to prevent mismatch
    if (wrappedKey === undefined) {
      updateData.appLockWrappedKey = null;
    }
  }
  if (wrappedKey !== undefined) {
    updateData.appLockWrappedKey = wrappedKey || null;
  }

  await prisma.passwordVault.upsert({
    where: { userId: session.user.id },
    create: {
      userId: session.user.id,
      isConfigured: false,
      ...updateData,
    },
    update: updateData,
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  if (!validateCSRFRequest(req)) {
    return NextResponse.json({ error: "Invalid CSRF token." }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "all";

  if (action === "pin" || action === "all") {
    await prisma.passwordVault.updateMany({
      where: { userId: session.user.id },
      data: {
        appLockPinHash: null,
        appLockWrappedKey: null,
      },
    });
  }

  return NextResponse.json({ success: true, action });
}
