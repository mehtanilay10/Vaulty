import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
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
    notePage: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("/api/notes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/notes", () => {
    it("returns 401 when unauthorized", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost:3000/api/notes");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns list of notes sorted by pinned and updatedAt", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({
        id: "user-1",
        email: "user@example.com",
      } as never);

      const mockNotes = [
        {
          id: "note-1",
          userId: "user-1",
          title: "Pinned Note",
          content: "Body text",
          isPinned: true,
          updatedAt: new Date(),
        },
      ];
      vi.mocked(prisma.notePage.findMany).mockResolvedValueOnce(mockNotes as never);

      const req = new NextRequest("http://localhost:3000/api/notes?q=pinned");
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.notes).toHaveLength(1);
      expect(json.notes[0].title).toBe("Pinned Note");
      expect(prisma.notePage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            isArchived: false,
          }),
          orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }],
        }),
      );
    });
  });

  describe("POST /api/notes", () => {
    it("returns 401 when unauthorized", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost:3000/api/notes", { method: "POST" });
      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when CSRF is invalid", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(false);

      const req = new NextRequest("http://localhost:3000/api/notes", {
        method: "POST",
        body: JSON.stringify({ title: "New Note" }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it("creates note successfully with valid input", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);

      const createdNote = {
        id: "note-new",
        userId: "user-1",
        title: "Grocery List",
        content: "Milk, eggs",
        todos: [{ id: "t1", text: "Buy milk", completed: false }],
        color: "#0d9488",
        isPinned: true,
      };
      vi.mocked(prisma.notePage.create).mockResolvedValueOnce(createdNote as never);

      const req = new NextRequest("http://localhost:3000/api/notes", {
        method: "POST",
        body: JSON.stringify({
          title: "Grocery List",
          content: "Milk, eggs",
          todos: [{ id: "t1", text: "Buy milk", completed: false }],
          color: "#0d9488",
          isPinned: true,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const json = await res.json();
      expect(json.note.title).toBe("Grocery List");
      expect(prisma.notePage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            title: "Grocery List",
            color: "#0d9488",
            isPinned: true,
          }),
        }),
      );
    });
  });
});
