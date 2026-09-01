import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { GET } from "@/app/api/chat/rooms/route";

describe("GET /api/chat/rooms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("proxies the authenticated room list without exposing the token", async () => {
    const rooms = {
      data: [{ id: "room-1" }],
      page: { hasNextPage: false, nextCursor: null },
    };
    mocks.get.mockResolvedValue(rooms);
    const request = new Request("https://seniorclub.example/api/chat/rooms");

    const response = await GET(request);

    expect(mocks.withBackendAccess).toHaveBeenCalledWith(
      request,
      expect.any(Function),
    );
    expect(mocks.get).toHaveBeenCalledWith("/v1/chat/rooms?limit=50", {
      headers: { Authorization: "Bearer access" },
    });
    expect(await response.json()).toEqual(rooms);
  });

  it("rotates cookies when withBackendAccess refreshes the session", async () => {
    const refreshed = { accessToken: "new-access" };
    mocks.get.mockResolvedValue({
      data: [],
      page: { hasNextPage: false, nextCursor: null },
    });
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("new-access"),
      refreshed,
    }));

    const response = await GET(
      new Request("https://seniorclub.example/api/chat/rooms"),
    );

    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, refreshed);
  });

  it("preserves membership and authentication errors from the shared envelope", async () => {
    const forbidden = new Error("membership required");
    const errorResponse = NextResponse.json(
      { error: { code: "CHAT_MEMBERSHIP_REQUIRED" } },
      { status: 403 },
    );
    mocks.withBackendAccess.mockRejectedValue(forbidden);
    mocks.apiErrorResponse.mockReturnValue(errorResponse);

    await expect(
      GET(new Request("https://seniorclub.example/api/chat/rooms")),
    ).resolves.toBe(errorResponse);
    expect(mocks.apiErrorResponse).toHaveBeenCalledWith(forbidden);
  });
});
