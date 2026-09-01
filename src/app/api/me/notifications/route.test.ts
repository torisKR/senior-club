import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn(),
  post: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/bff")>();
  return {
    ...actual,
    backendApi: () => ({
      get: mocks.get,
      patch: mocks.patch,
      post: mocks.post,
    }),
    withBackendAccess: mocks.withBackendAccess,
  };
});

import { PATCH as markNotificationRead } from "@/app/api/me/notifications/[id]/read/route";
import { POST as markAllNotificationsRead } from "@/app/api/me/notifications/read-all/route";
import { GET as listNotifications } from "@/app/api/me/notifications/route";
import { GET as unreadNotificationCount } from "@/app/api/me/notifications/unread-count/route";
import type { BackendIssuedSession } from "@/lib/auth/bff";

const origin = "https://seniorclub.example";
const refreshedSession: BackendIssuedSession = {
  accessToken: "a".repeat(64),
  accessTokenExpiresAt: "2099-08-01T00:00:00.000Z",
  refreshToken: "r".repeat(32),
  refreshTokenExpiresAt: "2099-09-01T00:00:00.000Z",
  sessionId: "session-1",
  user: {
    id: "member-1",
    email: "member@example.com",
    name: "김회원",
    role: "MEMBER",
    onboardingCompletedAt: "2026-07-30T00:00:00.000Z",
  },
};

function mutationRequest(
  path: string,
  method: "PATCH" | "POST",
  options: { requestOrigin?: string; contentType?: string; body?: string } = {},
) {
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      "Content-Type": options.contentType ?? "application/json",
      Origin: options.requestOrigin ?? origin,
    },
    body: options.body ?? "{}",
  });
}

describe("notification BFF routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access-token"),
      refreshed: null,
    }));
  });

  it("forwards an allowlisted cursor query and keeps the list private", async () => {
    const payload = {
      data: [],
      page: { hasNextPage: false, nextCursor: null },
    };
    mocks.get.mockResolvedValue(payload);

    const response = await listNotifications(
      new Request(
        `${origin}/api/me/notifications?cursor=opaque-cursor_123&limit=25`,
      ),
    );

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/me/notifications?limit=25&cursor=opaque-cursor_123",
      {
        cache: "no-store",
        headers: { Authorization: "Bearer access-token" },
      },
    );
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    await expect(response.json()).resolves.toEqual(payload);
  });

  it.each([
    "?limit=0",
    "?limit=20x",
    "?limit=10&limit=20",
    "?cursor=short",
    "?cursor=opaque-cursor&cursor=second-cursor",
    "?unexpected=value",
  ])("rejects the invalid list query %s before authentication", async (query) => {
    const response = await listNotifications(
      new Request(`${origin}/api/me/notifications${query}`),
    );

    expect(response.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });

  it("loads the exact unread-count resource", async () => {
    mocks.get.mockResolvedValue({ unreadCount: 7 });

    const response = await unreadNotificationCount(
      new Request(`${origin}/api/me/notifications/unread-count`),
    );

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/me/notifications/unread-count",
      {
        cache: "no-store",
        headers: { Authorization: "Bearer access-token" },
      },
    );
    await expect(response.json()).resolves.toEqual({ unreadCount: 7 });
  });

  it("writes both rotated authentication cookies on a refreshed list response", async () => {
    mocks.get.mockResolvedValue({
      data: [],
      page: { hasNextPage: false, nextCursor: null },
    });
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation(refreshedSession.accessToken),
      refreshed: refreshedSession,
    }));

    const response = await listNotifications(
      new Request(`${origin}/api/me/notifications`),
    );
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(cookies).toContain(refreshedSession.accessToken);
    expect(cookies).toContain(refreshedSession.refreshToken);
  });

  it("marks one notification read only after same-origin JSON validation", async () => {
    mocks.patch.mockResolvedValue({ success: true });
    const request = mutationRequest(
      "/api/me/notifications/notification-1/read",
      "PATCH",
    );

    const response = await markNotificationRead(request, {
      params: Promise.resolve({ id: "notification-1" }),
    });

    expect(mocks.patch).toHaveBeenCalledWith(
      "/v1/me/notifications/notification-1/read",
      {},
      { headers: { Authorization: "Bearer access-token" } },
    );
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it.each([
    "event-cancel:application-1",
    "review-request:application-2",
  ])("forwards the generated namespaced notification id %s safely", async (id) => {
    mocks.patch.mockResolvedValue({ success: true });

    const response = await markNotificationRead(
      mutationRequest(
        `/api/me/notifications/${encodeURIComponent(id)}/read`,
        "PATCH",
      ),
      { params: Promise.resolve({ id }) },
    );

    expect(mocks.patch).toHaveBeenCalledWith(
      `/v1/me/notifications/${encodeURIComponent(id)}/read`,
      {},
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(response.status).toBe(200);
  });

  it("fails closed on a cross-origin individual read request", async () => {
    const response = await markNotificationRead(
      mutationRequest(
        "/api/me/notifications/notification-1/read",
        "PATCH",
        { requestOrigin: "https://evil.example" },
      ),
      { params: Promise.resolve({ id: "notification-1" }) },
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_ORIGIN" },
    });
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("rejects a non-JSON or non-empty read request before the backend", async () => {
    const unsupported = await markNotificationRead(
      mutationRequest(
        "/api/me/notifications/notification-1/read",
        "PATCH",
        { contentType: "text/plain" },
      ),
      { params: Promise.resolve({ id: "notification-1" }) },
    );
    const unexpectedBody = await markNotificationRead(
      mutationRequest(
        "/api/me/notifications/notification-1/read",
        "PATCH",
        { body: JSON.stringify({ read: true }) },
      ),
      { params: Promise.resolve({ id: "notification-1" }) },
    );

    expect(unsupported.status).toBe(415);
    expect(unexpectedBody.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON and notification ids before authentication", async () => {
    const malformedJson = await markNotificationRead(
      mutationRequest(
        "/api/me/notifications/notification-1/read",
        "PATCH",
        { body: "{" },
      ),
      { params: Promise.resolve({ id: "notification-1" }) },
    );
    const invalidId = await markNotificationRead(
      mutationRequest(
        "/api/me/notifications/not-valid/read",
        "PATCH",
      ),
      { params: Promise.resolve({ id: "../admin" }) },
    );

    expect(malformedJson.status).toBe(400);
    expect(invalidId.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("marks all notifications read through the dedicated endpoint", async () => {
    mocks.post.mockResolvedValue({ success: true, updatedCount: 4 });

    const response = await markAllNotificationsRead(
      mutationRequest("/api/me/notifications/read-all", "POST"),
    );

    expect(mocks.post).toHaveBeenCalledWith(
      "/v1/me/notifications/read-all",
      {},
      { headers: { Authorization: "Bearer access-token" } },
    );
    await expect(response.json()).resolves.toEqual({
      success: true,
      updatedCount: 4,
    });
  });

  it("fails closed on a cross-origin mark-all request", async () => {
    const response = await markAllNotificationsRead(
      mutationRequest("/api/me/notifications/read-all", "POST", {
        requestOrigin: "https://evil.example",
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_ORIGIN" },
    });
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("also rotates both cookies after a refreshed mark-all request", async () => {
    mocks.post.mockResolvedValue({ success: true, updatedCount: 1 });
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation(refreshedSession.accessToken),
      refreshed: refreshedSession,
    }));

    const response = await markAllNotificationsRead(
      mutationRequest("/api/me/notifications/read-all", "POST"),
    );
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(cookies).toContain(refreshedSession.accessToken);
    expect(cookies).toContain(refreshedSession.refreshToken);
  });
});
