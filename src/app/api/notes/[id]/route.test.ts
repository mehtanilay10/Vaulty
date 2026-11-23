import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, PATCH, DELETE } from "./route";
import * as authModule from "@/auth";
import * as csrfModule from "@/lib/csrf";
import * as familyAccessModule from "@/lib/family-access";
import { prisma } from "@/lib/prisma";

vi.mock("@/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFRequest: vi.fn(),
}));

vi.mock("@/lib/family-access", () => ({
  hasFamilyModuleAccess: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    notePage: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("/api/notes/[id] route", () => {
  const routeParams = { params: Promise.resolve({ id: "note-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/notes/[id]", () => {
    it("returns 401 when unauthorized", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost:3000/api/notes/note-1");
      const res = await GET(req, routeParams);
      expect(res.status).toBe(401);
    });

    it("returns 404 when note does not exist", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce(null);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1");
      const res = await GET(req, routeParams);
      expect(res.status).toBe(404);
    });

    it("returns 200 when note belongs to user", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
        title: "Secret Note",
      } as never);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1");
      const res = await GET(req, routeParams);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.note.title).toBe("Secret Note");
    });

    it("returns 200 when note belongs to family member who shared notes", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-member" } as never);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce({
        id: "note-1",
        userId: "owner-1",
        title: "Family Shared Note",
      } as never);
      vi.mocked(familyAccessModule.hasFamilyModuleAccess).mockResolvedValueOnce(true);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1");
      const res = await GET(req, routeParams);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.note.title).toBe("Family Shared Note");
    });
  });

  describe("PATCH /api/notes/[id]", () => {
    it("returns 403 when CSRF is invalid", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(false);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "Updated" }),
      });
      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(403);
    });

    it("updates note when owner sends valid payload", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
        title: "Old Title",
      } as never);
      vi.mocked(prisma.notePage.update).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
        title: "New Title",
        isPinned: true,
      } as never);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1", {
        method: "PATCH",
        body: JSON.stringify({ title: "New Title", isPinned: true }),
      });
      const res = await PATCH(req, routeParams);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.note.title).toBe("New Title");
      expect(prisma.notePage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "note-1" },
          data: expect.objectContaining({ title: "New Title", isPinned: true }),
        }),
      );
    });
  });

  describe("DELETE /api/notes/[id]", () => {
    it("deletes note when user is owner", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);
      vi.mocked(prisma.notePage.findUnique).mockResolvedValueOnce({
        id: "note-1",
        userId: "user-1",
      } as never);

      const req = new NextRequest("http://localhost:3000/api/notes/note-1", {
        method: "DELETE",
      });
      const res = await DELETE(req, routeParams);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(prisma.notePage.delete).toHaveBeenCalledWith({ where: { id: "note-1" } });
    });
  });
});
