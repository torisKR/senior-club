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

import { PATCH } from "@/app/api/me/profile/route";

const body = {
  name: "김정희",
  region: "서울",
  birthYear: 1962,
  interestSlugs: ["hiking", "photo", "history"],
};

function request() {
  return new Request("https://seniorclub.example/api/me/profile", {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://seniorclub.example",
    },
    body: JSON.stringify(body),
  });
}

describe("PATCH /api/me/profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizedHeaders.mockReturnValue({ Authorization: "Bearer access" });
    mocks.privateNextJson.mockImplementation((value) => NextResponse.json(value));
    mocks.withBackendAccess.mockImplementation(async (incoming, operation) => ({
      result: await operation("access"),
      refreshed: null,
    }));
  });

  it("validates the browser origin and forwards the exact profile contract", async () => {
    const updated = { id: "user-1", ...body };
    mocks.patch.mockResolvedValue(updated);
    const incoming = request();

    const response = await PATCH(incoming);

    expect(mocks.assertSameOrigin).toHaveBeenCalledWith(incoming);
    expect(mocks.withBackendAccess).toHaveBeenCalledWith(
      incoming,
      expect.any(Function),
    );
    expect(mocks.patch).toHaveBeenCalledWith("/v1/me/profile", body, {
      headers: { Authorization: "Bearer access" },
    });
    expect(await response.json()).toEqual(updated);
  });

  it("rotates refreshed session cookies on the profile response", async () => {
    const refreshed = { accessToken: "new-access" };
    mocks.patch.mockResolvedValue({ id: "user-1" });
    mocks.withBackendAccess.mockImplementation(async (_incoming, operation) => ({
      result: await operation("new-access"),
      refreshed,
    }));

    const response = await PATCH(request());

    expect(mocks.setSessionCookies).toHaveBeenCalledWith(response, refreshed);
  });

  it("returns the shared error response without calling the backend after origin rejection", async () => {
    const originError = new Error("invalid origin");
    const errorResponse = NextResponse.json({ error: { code: "INVALID_ORIGIN" } }, { status: 403 });
    mocks.assertSameOrigin.mockImplementation(() => {
      throw originError;
    });
    mocks.apiErrorResponse.mockReturnValue(errorResponse);

    await expect(PATCH(request())).resolves.toBe(errorResponse);
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.apiErrorResponse).toHaveBeenCalledWith(originError);
  });
});
