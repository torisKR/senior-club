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

import { GET } from "@/app/api/leader/events/[id]/applications/route";

describe("GET /api/leader/events/:id/applications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("encodes the event id and requests a private projection", async () => {
    const payload = { event: { id: "event/1" }, applications: [] };
    mocks.get.mockResolvedValue(payload);
    const request = new Request(
      "https://seniorclub.example/api/leader/events/event%2F1/applications",
    );

    const response = await GET(request, {
      params: Promise.resolve({ id: "event/1" }),
    });

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/events/event%2F1/applications",
      {
        cache: "no-store",
        headers: { Authorization: "Bearer access" },
      },
    );
    expect(await response.json()).toEqual(payload);
  });

  it("forwards application cursors without decoding them in the BFF", async () => {
    mocks.get.mockResolvedValue({
      event: { id: "event-1" },
      applications: [],
      page: { nextCursor: null },
    });
    const request = new Request(
      "https://seniorclub.example/api/leader/events/event-1/applications?limit=100&cursor=opaque-cursor",
    );

    await GET(request, { params: Promise.resolve({ id: "event-1" }) });

    expect(mocks.get).toHaveBeenCalledWith(
      "/v1/events/event-1/applications?limit=100&cursor=opaque-cursor",
      expect.objectContaining({ cache: "no-store" }),
    );
  });
});
