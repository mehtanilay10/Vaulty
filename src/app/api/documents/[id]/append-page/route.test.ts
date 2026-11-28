import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "./route";
import { NextRequest } from "next/server";
import * as authModule from "@/auth";
import * as csrfModule from "@/lib/csrf";
import * as authzModule from "@/lib/authz";
import * as storageFactory from "@/lib/storage/factory";
import * as jobService from "@/lib/ai/job-service";
import { prisma } from "@/lib/prisma";
import { PDFDocument } from "pdf-lib";

vi.mock("@/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFRequest: vi.fn(),
}));

vi.mock("@/lib/authz", () => ({
  checkDocumentAccess: vi.fn(),
}));

vi.mock("@/lib/storage/factory", () => ({
  getProviderForDocument: vi.fn(),
}));

vi.mock("@/lib/ai/job-service", () => ({
  ensureAiJobAndProcessing: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Rate limiter (security-rate-limit) uses a raw upsert; allow all attempts in tests.
    $queryRaw: vi.fn().mockResolvedValue([{ attempts: 1, blockedUntil: null }]),
    document: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    aiProcessing: {
      findUnique: vi.fn(),
    },
    syncEvent: {
      create: vi.fn(),
    },
  },
}));

describe("POST /api/documents/[id]/append-page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3000/api/documents/doc-1/append-page", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(401);
  });

  it("returns 403 when CSRF token is invalid", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "u-1" } as never);
    vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(false);

    const req = new NextRequest("http://localhost:3000/api/documents/doc-1/append-page", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 403 when user is not document owner", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "u-1" } as never);
    vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);
    vi.mocked(authzModule.checkDocumentAccess).mockResolvedValueOnce({
      hasAccess: true,
      isOwner: false,
      isShared: true,
      permission: "READ_ONLY",
    });

    const req = new NextRequest("http://localhost:3000/api/documents/doc-1/append-page", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(403);
  });

  it("appends page to existing PDF and re-triggers AI when AI was enabled", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "u-1" } as never);
    vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);
    vi.mocked(authzModule.checkDocumentAccess).mockResolvedValueOnce({
      hasAccess: true,
      isOwner: true,
      isShared: false,
      permission: "OWNER",
    });

    vi.mocked(prisma.document.findUnique).mockResolvedValueOnce({
      id: "doc-1",
      name: "contract.pdf",
      mimeType: "application/pdf",
      storageProvider: "GOOGLE_DRIVE",
      storageFileId: "drive-file-123",
      storageParentId: "parent-1",
      ownerId: "u-1",
      folderId: "folder-1",
    } as never);

    // Initial 1-page PDF
    const initialDoc = await PDFDocument.create();
    initialDoc.addPage([200, 300]);
    const initialPdfBytes = await initialDoc.save();

    const mockProvider = {
      downloadFile: vi.fn().mockResolvedValue(Buffer.from(initialPdfBytes)),
      updateFileContent: vi.fn().mockResolvedValue({ id: "drive-file-123" }),
    };

    vi.mocked(storageFactory.getProviderForDocument).mockResolvedValueOnce({
      provider: mockProvider,
    } as never);

    vi.mocked(prisma.document.update).mockResolvedValueOnce({
      id: "doc-1",
      name: "contract.pdf",
      mimeType: "application/pdf",
      sizeBytes: 1500,
    } as never);

    vi.mocked(prisma.aiProcessing.findUnique).mockResolvedValueOnce({
      id: "ai-1",
      status: "COMPLETED",
    } as never);

    // Page 2 PDF to append
    const page2Doc = await PDFDocument.create();
    page2Doc.addPage([200, 300]);
    const page2PdfBytes = await page2Doc.save();

    const formData = new FormData();
    const file = new File([page2PdfBytes.buffer as ArrayBuffer], "page2.pdf", {
      type: "application/pdf",
    });
    formData.append("file", file);

    const req = new NextRequest("http://localhost:3000/api/documents/doc-1/append-page", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req, { params: Promise.resolve({ id: "doc-1" }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.retriggeredAi).toBe(true);

    // Check Google Drive updateFileContent was called
    expect(mockProvider.updateFileContent).toHaveBeenCalled();

    // Check AI job was re-queued
    expect(jobService.ensureAiJobAndProcessing).toHaveBeenCalledWith("doc-1", expect.any(String));

    // Check SyncEvent was logged
    expect(prisma.syncEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentId: "doc-1",
        operation: "UPDATE",
        status: "SUCCESS",
      }),
    });
  });
});
