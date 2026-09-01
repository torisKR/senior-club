import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("@/lib/auth/bff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/bff")>();
  return {
    ...actual,
    backendApi: () => ({ post: mocks.post }),
    withBackendAccess: mocks.withBackendAccess,
  };
});

import { POST } from "@/app/api/events/[id]/reviews/route";
import type { BackendIssuedSession } from "@/lib/auth/bff";

const origin = "https://seniorclub.example";
const review = {
  id: "review-1",
  eventId: "event-1",
  rating: 5,
  content: "처음 만난 분들과도 편안하게 이야기할 수 있었습니다.",
  author: { id: "member-1", name: "김회원" },
  createdAt: "2026-07-30T01:00:00.000Z",
  updatedAt: "2026-07-30T01:00:00.000Z",
};

function request(
  body: unknown = { rating: 5, content: `  ${review.content}  ` },
  options: { requestOrigin?: string; contentType?: string; rawBody?: string } = {},
) {
  return new Request(`${origin}/api/events/event-1/reviews`, {
    method: "POST",
    headers: {
      "Content-Type": options.contentType ?? "application/json",
      Origin: options.requestOrigin ?? origin,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

describe("POST /api/events/:id/reviews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue(review);
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access-token"),
      refreshed: null,
    }));
  });

  it("validates and forwards one normalized review through the authenticated API", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: "event-1" }),
    });

    expect(mocks.post).toHaveBeenCalledWith(
      "/v1/events/event-1/reviews",
      { rating: 5, content: review.content },
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    await expect(response.json()).resolves.toEqual(review);
  });

  it("keeps an identical retry identical so the backend can resolve it idempotently", async () => {
    const first = await POST(request(), {
      params: Promise.resolve({ id: "event-1" }),
    });
    const second = await POST(request(), {
      params: Promise.resolve({ id: "event-1" }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post.mock.calls[0]).toEqual(mocks.post.mock.calls[1]);
  });

  it.each([
    [{ rating: 0, content: review.content }, "event-1"],
    [{ rating: 4.5, content: review.content }, "event-1"],
    [{ rating: 5, content: "짧은 후기" }, "event-1"],
    [{ rating: 5, content: review.content, userId: "member-2" }, "event-1"],
    [{ rating: 5, content: review.content }, "../admin"],
  ])("rejects an invalid review or event id before authentication", async (body, id) => {
    const response = await POST(request(body), {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, non-JSON, and malformed JSON requests", async () => {
    const crossOrigin = await POST(
      request(undefined, { requestOrigin: "https://evil.example" }),
      { params: Promise.resolve({ id: "event-1" }) },
    );
    const nonJson = await POST(
      request(undefined, { contentType: "text/plain" }),
      { params: Promise.resolve({ id: "event-1" }) },
    );
    const malformed = await POST(
      request(undefined, { rawBody: "{" }),
      { params: Promise.resolve({ id: "event-1" }) },
    );

    expect(crossOrigin.status).toBe(403);
    expect(nonJson.status).toBe(415);
    expect(malformed.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("rotates both HttpOnly session cookies after an access-token refresh", async () => {
    const refreshed: BackendIssuedSession = {
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
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation(refreshed.accessToken),
      refreshed,
    }));

    const response = await POST(request(), {
      params: Promise.resolve({ id: "event-1" }),
    });
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(cookies).toContain(refreshed.accessToken);
    expect(cookies).toContain(refreshed.refreshToken);
  });
});
