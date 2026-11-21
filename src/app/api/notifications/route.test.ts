import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, PATCH } from "./route";
import { NextRequest } from "next/server";
import * as authModule from "@/auth";
import * as csrfModule from "@/lib/csrf";
import * as notificationsModule from "@/lib/notifications";

vi.mock("@/auth", () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/csrf", () => ({
  validateCSRFRequest: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  getUnreadNotifications: vi.fn(),
  markAllNotificationsAsRead: vi.fn(),
  markNotificationAsRead: vi.fn(),
}));

describe("/api/notifications route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /api/notifications", () => {
    it("returns 401 when user is not authenticated", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost:3000/api/notifications");
      const res = await GET(req);
      expect(res.status).toBe(401);
    });

    it("returns notifications for authenticated user", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({
        id: "user-123",
        email: "user@example.com",
      } as never);
      vi.mocked(notificationsModule.getUnreadNotifications).mockResolvedValueOnce({
        notifications: [{ id: "notif-1", title: "Test", message: "Msg", read: false } as never],
        pagination: { hasMore: false, nextCursor: null },
      });

      const req = new NextRequest("http://localhost:3000/api/notifications?limit=10");
      const res = await GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.notifications).toHaveLength(1);
      expect(notificationsModule.getUnreadNotifications).toHaveBeenCalledWith(
        "user-123",
        10,
        undefined,
      );
    });
  });

  describe("PATCH /api/notifications", () => {
    it("returns 401 when unauthenticated", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce(null);
      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ markAllRead: true }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(401);
    });

    it("returns 403 when CSRF token is invalid", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-123" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(false);

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ markAllRead: true }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(403);
    });

    it("marks all notifications as read when markAllRead is true", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-123" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ markAllRead: true }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(notificationsModule.markAllNotificationsAsRead).toHaveBeenCalledWith("user-123");
    });

    it("marks single notification as read when id is provided", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-123" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ id: "notif-abc", read: true }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      expect(notificationsModule.markNotificationAsRead).toHaveBeenCalledWith(
        "notif-abc",
        "user-123",
      );
    });

    it("returns 400 when body does not specify markAllRead or id", async () => {
      vi.mocked(authModule.getCurrentUser).mockResolvedValueOnce({ id: "user-123" } as never);
      vi.mocked(csrfModule.validateCSRFRequest).mockReturnValueOnce(true);

      const req = new NextRequest("http://localhost:3000/api/notifications", {
        method: "PATCH",
        body: JSON.stringify({ foo: "bar" }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(400);
    });
  });
});
