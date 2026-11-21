import { NextRequest, NextResponse } from "next/server";
import { readJsonRecord } from "@/lib/api-validation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getVaultAccess } from "@/lib/vault-access";
import { validateCSRFRequest } from "@/lib/csrf";

// PUT - Update bank credential
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await readJsonRecord(req);
    if (!body) return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    const {
      name,
      username,
      netbankPassword,
      atmPin,
      upiPin,
      mobileAppPin,
      mobileTransactionPin,
      icon,
      iconColor,
      isFavorite,
    } = body;
    const { id } = await params;

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    // Get the credential and verify ownership
    const credential = await prisma.bankCredential.findUnique({
      where: { id },
      include: { vault: true },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    const access = await getVaultAccess(session.user.id, credential.vaultId);

    if (!access.hasAccess) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    if (!access.isOwner && access.permission !== "FULL_ACCESS") {
      return NextResponse.json({ error: "Read-only access" }, { status: 403 });
    }

    // Update credential (preserve optional fields when undefined; allow null/empty to clear)
    const updated = await prisma.bankCredential.update({
      where: { id },
      data: {
        name: name !== undefined ? name : credential.name,
        username: username !== undefined ? username : credential.username,
        netbankPassword:
          netbankPassword !== undefined
            ? netbankPassword && netbankPassword !== ""
              ? netbankPassword
              : null
            : credential.netbankPassword,
        atmPin:
          atmPin !== undefined ? (atmPin && atmPin !== "" ? atmPin : null) : credential.atmPin,
        upiPin:
          upiPin !== undefined ? (upiPin && upiPin !== "" ? upiPin : null) : credential.upiPin,
        mobileAppPin:
          mobileAppPin !== undefined
            ? mobileAppPin && mobileAppPin !== ""
              ? mobileAppPin
              : null
            : credential.mobileAppPin,
        mobileTransactionPin:
          mobileTransactionPin !== undefined
            ? mobileTransactionPin && mobileTransactionPin !== ""
              ? mobileTransactionPin
              : null
            : credential.mobileTransactionPin,
        isFavorite: isFavorite !== undefined ? isFavorite : credential.isFavorite,
        icon: icon !== undefined ? (icon && icon !== "" ? icon : null) : credential.icon,
        iconColor:
          iconColor !== undefined
            ? iconColor && iconColor !== ""
              ? iconColor
              : null
            : credential.iconColor,
      },
    });

    return NextResponse.json({ success: true, credential: updated });
  } catch (error) {
    console.error("Error updating bank credential:", error);
    return NextResponse.json({ error: "Failed to update bank credential" }, { status: 500 });
  }
}

// DELETE - Delete bank credential
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate CSRF token
    if (!validateCSRFRequest(req)) {
      return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
    }

    const { id } = await params;

    // Get the credential and verify ownership
    const credential = await prisma.bankCredential.findUnique({
      where: { id },
      include: { vault: true },
    });

    if (!credential) {
      return NextResponse.json({ error: "Credential not found" }, { status: 404 });
    }

    const access = await getVaultAccess(session.user.id, credential.vaultId);

    if (!access.hasAccess || (!access.isOwner && access.permission !== "FULL_ACCESS")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    // Delete credential
    await prisma.bankCredential.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting bank credential:", error);
    return NextResponse.json({ error: "Failed to delete bank credential" }, { status: 500 });
  }
}
