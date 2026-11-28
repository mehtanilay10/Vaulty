import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST, DELETE } from "./route";
import * as authModule from "@/auth";
import * as csrfModule from "@/lib/csrf";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFRequest: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    // Rate limiter (security-rate-limit) uses a raw upsert; allow all attempts in tests.
    $queryRaw: vi.fn().mockResolvedValue([{ attempts: 1, blockedUntil: null }]),
    notePage: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("/api/notes/[id]/images route", () => {
  const routeParams = { params: Promise.resolve({ id: "note-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("POST /api/notes/[id]/images", () => {
    it("returns 401 when unauthorized", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost:3000/api/notes/note-1/images", {
        method: "POST",
      });
      const res = await POST(req, routeParams);
      expect(res.status).toBe(401);
    });

    it("accepts base64 image data and appends to note images", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
        images: [],
      } as never);
      vi.mocked(prisma.notePage.update).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
      } as never);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "screenshot.png",
          url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
          mimeType: "image/png",
        }),
      });

      const res = await POST(req, routeParams);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.image).toBeDefined();
      expect(json.image.name).toBe("screenshot.png");
      expect(prisma.notePage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "note-1" },
          data: expect.objectContaining({
            images: expect.arrayContaining([expect.objectContaining({ name: "screenshot.png" })]),
          }),
        }),
      );
    });
  });

  describe("DELETE /api/notes/[id]/images", () => {
    it("removes specified image from note images array", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
        images: [
          { id: "img-1", name: "one.png", url: "data:image/png;base64,abc" },
          { id: "img-2", name: "two.png", url: "data:image/png;base64,def" },
        ],
      } as never);
      vi.mocked(prisma.notePage.update).mockResolvedValueOnce({} as never);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1/images?imageId=img-1", {
        method: "DELETE",
      });

      const res = await DELETE(req, routeParams);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.images).toHaveLength(1);
      expect(json.images[0].id).toBe("img-2");
    });
  });
});
