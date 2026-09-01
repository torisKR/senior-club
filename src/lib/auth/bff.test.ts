import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createJsonApiClient: () => ({ post: mocks.post }),
  };
});

import { ApiHttpError } from "@/lib/api";
import {
  apiErrorResponse,
  type BackendIssuedSession,
  RefreshedBackendOperationError,
  withBackendAccess,
} from "@/lib/auth/bff";
import {
  ACCESS_TOKEN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";

const refreshedSession: BackendIssuedSession = {
  accessToken: "a".repeat(64),
  accessTokenExpiresAt: "2099-08-01T00:00:00.000Z",
  refreshToken: "r".repeat(32),
  refreshTokenExpiresAt: "2099-09-01T00:00:00.000Z",
  sessionId: "session-1",
  user: {
    id: "leader-1",
    email: "leader@example.com",
    name: "김리더",
    role: "LEADER",
    onboardingCompletedAt: "2026-07-30T00:00:00.000Z",
  },
};

describe("authenticated BFF refresh errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue(refreshedSession);
  });

  it("preserves a rotated session when the protected operation returns 403", async () => {
    const request = new Request("https://seniorclub.example/api/leader/events", {
      headers: {
        Cookie: `${SESSION_COOKIE_NAME}=${"s".repeat(32)}`,
      },
    });
    let caught: unknown;

    try {
      await withBackendAccess(request, async (token) => {
        expect(token).toBe(refreshedSession.accessToken);
        throw new ApiHttpError(403, "담당 모임이 아닙니다.", "LEADER_SCOPE_REQUIRED");
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(RefreshedBackendOperationError);
    const response = apiErrorResponse(caught);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "LEADER_SCOPE_REQUIRED",
        message: "담당 모임이 아닙니다.",
      },
    });
    const cookies = response.headers.get("set-cookie") ?? "";
    expect(cookies).toContain(ACCESS_TOKEN_COOKIE_NAME);
    expect(cookies).toContain(refreshedSession.accessToken);
    expect(cookies).toContain(SESSION_COOKIE_NAME);
    expect(cookies).toContain(refreshedSession.refreshToken);
  });

  it("also preserves the second session when a 401 retry ends in 409", async () => {
    const request = new Request("https://seniorclub.example/api/leader/events", {
      headers: {
        Cookie: `${ACCESS_TOKEN_COOKIE_NAME}=${"o".repeat(64)}; ${SESSION_COOKIE_NAME}=${"s".repeat(32)}`,
      },
    });
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new ApiHttpError(401, "만료", "INVALID_SESSION"))
      .mockRejectedValueOnce(
        new ApiHttpError(409, "현재 상태에서 처리할 수 없습니다.", "INVALID_APPLICATION_STATE"),
      );

    let caught: unknown;
    try {
      await withBackendAccess(request, operation);
    } catch (error) {
      caught = error;
    }

    expect(operation).toHaveBeenCalledTimes(2);
    expect(caught).toBeInstanceOf(RefreshedBackendOperationError);
    const response = apiErrorResponse(caught);
    expect(response.status).toBe(409);
    expect(response.headers.get("set-cookie")).toContain(
      refreshedSession.refreshToken,
    );
  });
});
