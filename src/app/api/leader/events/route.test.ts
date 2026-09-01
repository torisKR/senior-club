import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn(),
  authorizedHeaders: vi.fn(),
  get: vi.fn(),
  privateNextJson: vi.fn(),
  setSessionCookies: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  apiErrorResponse: mocks.apiErrorResponse,
  authorizedHeaders: mocks.authorizedHeaders,
  backendApi: () => ({ get: mocks.get }),
  privateNextJson: mocks.privateNextJson,
  setSessionCookies: mocks.setSessionCookies,
  withBackendAccess: mocks.withBackendAccess,
}));

import { GET } from "@/app/api/leader/events/route";
import { leaderEventsBackendPath } from "@/lib/leader-events/bff";

describe("GET /api/leader/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("loads only the authenticated no-store leader catalog", async () => {
    const payload = { data: [{ id: "event-1" }] };
    mocks.get.mockResolvedValue(payload);
    const request = new Request("https://seniorclub.example/api/leader/events");

    const response = await GET(request);

    expect(mocks.withBackendAccess).toHaveBeenCalledWith(
      request,
      expect.any(Function),
    );
    expect(mocks.get).toHaveBeenCalledWith("/v1/leader/events", {
      cache: "no-store",
      headers: { Authorization: "Bearer access" },
    });
    expect(await response.json()).toEqual(payload);
  });

  it("rotates refreshed authentication cookies", async () => {
    const refreshed = { accessToken: "new-access" };
    mocks.get.mockResolvedValue({ data: [] });
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("new-access"),
      refreshed,
    }));

    const response = await GET(
      new Request("https://seniorclub.example/api/leader/events"),
    );

    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, refreshed);
  });

  it("forwards cursor pagination parameters for backend validation", async () => {
    mocks.get.mockResolvedValue({ data: [], page: { nextCursor: null } });

    await GET(
      new Request(
        "https://seniorclub.example/api/leader/events?limit=50&cursor=opaque-cursor",
      ),
    );

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/leader/events?limit=50&cursor=opaque-cursor",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("strictly forwards the attendance view with bounded pagination fields", async () => {
    mocks.get.mockResolvedValue({ data: [], page: { nextCursor: null } });

    await GET(
      new Request(
        "https://seniorclub.example/api/leader/events?view=attendance&limit=50&cursor=opaque-cursor",
      ),
    );

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/leader/events?limit=50&cursor=opaque-cursor&view=attendance",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("forwards the private draft catalog without weakening query validation", async () => {
    mocks.get.mockResolvedValue({ data: [], page: { nextCursor: null } });

    await GET(
      new Request(
        "https://seniorclub.example/api/leader/events?view=drafts&limit=50",
      ),
    );

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/leader/events?limit=50&view=drafts",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("rejects unknown views, duplicate fields, and unrelated filters before auth", async () => {
    expect(() =>
      leaderEventsBackendPath(
        "https://seniorclub.example/api/leader/events?view=completed",
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() =>
      leaderEventsBackendPath(
        "https://seniorclub.example/api/leader/events?view=upcoming&view=attendance",
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() =>
      leaderEventsBackendPath(
        "https://seniorclub.example/api/leader/events?status=PUBLISHED",
      ),
    ).toThrowError(expect.objectContaining({ status: 400 }));

    const errorResponse = NextResponse.json(
      { error: { code: "INVALID_LEADER_EVENT_VIEW" } },
      { status: 400 },
    );
    mocks.apiErrorResponse.mockReturnValue(errorResponse);
    const response = await GET(
      new Request(
        "https://seniorclub.example/api/leader/events?view=completed",
      ),
    );

    expect(response).toBe(errorResponse);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.get).not.toHaveBeenCalled();
  });
});
