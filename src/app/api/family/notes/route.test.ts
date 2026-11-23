import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import * as authModule from "@/auth";
import * as familyAccessModule from "@/lib/family-access";
import * as familyServiceModule from "@/lib/family-service";
import * as rateLimitModule from "@/lib/family-rate-limit";

vi.mock("@/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/family-access", () => ({
  hasFamilyModuleAccess: vi.fn(),
}));

vi.mock("@/lib/family-service", () => ({
  getFamilySharedNotes: vi.fn(),
}));

vi.mock("@/lib/family-rate-limit", () => ({
  rateLimit: vi.fn(),
  createRateLimitResponse: vi.fn(),
}));

describe("/api/family/notes route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(rateLimitModule.rateLimit).mockResolvedValue({
      allowed: true,
      remaining: 50,
    });
  });

  it("returns 401 when unauthorized", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
    const req = new NextRequest("http://localhost:3000/api/family/notes");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("returns 403 when user does not have notes access to owner", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
    vi.mocked(familyAccessModule.hasFamilyModuleAccess).mockResolvedValueOnce(false);

    const req = new NextRequest("http://localhost:3000/api/family/notes?ownerId=owner-99");
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns shared notes groups when authorized", async () => {
    vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-1" } as never);
    vi.mocked(familyAccessModule.hasFamilyModuleAccess).mockResolvedValueOnce(true);
    const mockGroups = [
      {
        membershipId: "mem-1",
        ownerId: "owner-1",
        owner: { id: "owner-1", name: "Alice", email: "alice@example.com", image: null },
        notes: [
          {
            id: "note-1",
            userId: "owner-1",
            title: "Shared Recipe",
            content: "Flour and sugar",
            isPinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    ];
    vi.mocked(familyServiceModule.getFamilySharedNotes).mockResolvedValueOnce(mockGroups as never);

    const req = new NextRequest("http://localhost:3000/api/family/notes?ownerId=owner-1");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.groups).toHaveLength(1);
    expect(json.groups[0].notes[0].title).toBe("Shared Recipe");
  });
});
