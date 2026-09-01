import { NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  apiErrorResponse: vi.fn(),
  assertSameOrigin: vi.fn(),
  authorizedHeaders: vi.fn(),
  patch: vi.fn(),
  privateNextJson: vi.fn(),
  setSessionCookies: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", () => ({
  apiErrorResponse: mocks.apiErrorResponse,
  assertSameOrigin: mocks.assertSameOrigin,
  authorizedHeaders: mocks.authorizedHeaders,
  backendApi: () => ({ patch: mocks.patch }),
  privateNextJson: mocks.privateNextJson,
  setSessionCookies: mocks.setSessionCookies,
  withBackendAccess: mocks.withBackendAccess,
}));

import { PATCH } from "@/app/api/chat/rooms/[roomId]/read/route";

describe("PATCH /api/chat/rooms/:roomId/read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: { accessToken: "new-access" },
    }));
    mocks.apiErrorResponse.mockImplementation(() =>
      NextResponse.json({ error: { code: "INVALID_REQUEST" } }, { status: 400 }),
    );
  });

  it("requires same-origin empty JSON and rotates a refreshed session", async () => {
    const result = { success: true, lastReadAt: "2026-07-30T01:00:00.000Z" };
    mocks.patch.mockResolvedValue(result);
    const request = new Request(
      "https://seniorclub.example/api/chat/rooms/room-1/read",
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://seniorclub.example",
        },
        body: "{}",
      },
    );

    const response = await PATCH(request, {
      params: Promise.resolve({ roomId: "room-1" }),
    });

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(request);
    expect(mocks.patch).toHaveBeenCalledWith(
      "/v1/chat/rooms/room-1/read",
      {},
      { headers: { Authorization: "Bearer access" } },
    );
    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, {
      accessToken: "new-access",
    });
    expect(await response.json()).toEqual(result);
  });

  it("rejects non-empty JSON without a backend mutation", async () => {
    const response = await PATCH(
      new Request("https://seniorclub.example/api/chat/rooms/room-1/read", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Origin: "https://seniorclub.example",
        },
        body: JSON.stringify({ all: true }),
      }),
      { params: Promise.resolve({ roomId: "room-1" }) },
    );

    expect(response.status).toBe(400);
    expect(mocks.patch).not.toHaveBeenCalled();
  });
});
