import { describe, expect, it, vi } from "vitest";

import {
  loadAccountDeletionRequest,
  loadEventApplication,
} from "@/lib/protected-resource-client";

function fetchSpy(response: Response) {
  return vi.fn<
    (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  >(async () => response);
}

describe("protected resource client", () => {
  it("loads authentication and event application state with one request", async () => {
    const application = {
      id: "application-1",
      eventId: "event/1",
      userId: "user-1",
      status: "PENDING" as const,
      appliedAt: "2026-07-30T00:00:00.000Z",
      decidedAt: null,
      canceledAt: null,
      updatedAt: "2026-07-30T00:00:00.000Z",
    };
    const request = fetchSpy(Response.json({ application }));

    await expect(
      loadEventApplication("event/1", {
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ authenticated: true, application });

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      "/api/events/event%2F1/applications",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(request.mock.calls[0]?.[0]).not.toBe("/api/auth/session");
  });

  it("uses the application endpoint 401 as the anonymous state", async () => {
    const request = fetchSpy(
      Response.json(
        { error: { message: "로그인이 필요합니다." } },
        { status: 401 },
      ),
    );

    await expect(
      loadEventApplication("event-1", {
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ authenticated: false });
    expect(request).toHaveBeenCalledOnce();
  });

  it("preserves the API error message for event application failures", async () => {
    const request = fetchSpy(
      Response.json(
        { error: { message: "신청 서버를 확인하고 있습니다." } },
        { status: 503 },
      ),
    );

    await expect(
      loadEventApplication("event-1", {
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).rejects.toThrow("신청 서버를 확인하고 있습니다.");
  });

  it("treats non-401 authorization failures as errors instead of an anonymous session", async () => {
    const request = fetchSpy(
      Response.json(
        { error: { message: "신청 상태를 조회할 권한을 확인하지 못했습니다." } },
        { status: 403 },
      ),
    );

    await expect(
      loadEventApplication("event-1", {
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).rejects.toThrow("신청 상태를 조회할 권한을 확인하지 못했습니다.");
  });

  it("propagates a network failure so the caller can keep a retry state", async () => {
    const request = vi.fn(async () => {
      throw new TypeError("network unavailable");
    });

    await expect(
      loadEventApplication("event-1", {
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).rejects.toThrow("network unavailable");
  });

  it("loads authentication and account deletion state with one request", async () => {
    const deletionRequest = {
      id: "deletion-1",
      status: "REQUESTED" as const,
      requestedAt: "2026-07-30T00:00:00.000Z",
      scheduledFor: "2026-08-06T00:00:00.000Z",
      completedAt: null,
    };
    const request = fetchSpy(Response.json({ deletionRequest }));

    await expect(
      loadAccountDeletionRequest({
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ authenticated: true, deletionRequest });

    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith(
      "/api/me/deletion-request",
      expect.objectContaining({
        cache: "no-store",
        credentials: "same-origin",
      }),
    );
    expect(request.mock.calls[0]?.[0]).not.toBe("/api/auth/session");
  });

  it("uses the deletion status endpoint 401 as the anonymous state", async () => {
    const request = fetchSpy(new Response(null, { status: 401 }));

    await expect(
      loadAccountDeletionRequest({
        fetchImplementation: request as unknown as typeof fetch,
      }),
    ).resolves.toEqual({ authenticated: false });
    expect(request).toHaveBeenCalledOnce();
  });
});
