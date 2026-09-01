import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  revalidateTag: vi.fn(),
  withBackendAccess: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }));
vi.mock("@/lib/auth/bff", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/bff")>();
  return {
    ...actual,
    backendApi: () => ({ post: mocks.post }),
    withBackendAccess: mocks.withBackendAccess,
  };
});

import { POST } from "@/app/api/clubs/[slug]/posts/route";
import { ApiHttpError } from "@/lib/api";
import type { BackendIssuedSession } from "@/lib/auth/bff";

const origin = "https://seniorclub.example";
const content = "다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.";
const createdAt = "2026-07-30T01:00:00.000Z";
const post = {
  id: "post-1",
  clubId: "club-1",
  title: "함께 걷고 싶은 길",
  content,
  author: { id: "member-1", name: "김회원" },
  club: {
    id: "club-1",
    slug: "forest-walkers",
    title: "숲길을 걷는 사람들",
  },
  createdAt,
  updatedAt: createdAt,
};

function request(
  body: unknown = { title: "  함께   걷고 싶은 길  ", content: `  ${content}  ` },
  options: { requestOrigin?: string; contentType?: string; rawBody?: string } = {},
) {
  return new Request(`${origin}/api/clubs/forest-walkers/posts`, {
    method: "POST",
    headers: {
      "Content-Type": options.contentType ?? "application/json",
      Origin: options.requestOrigin ?? origin,
    },
    body: options.rawBody ?? JSON.stringify(body),
  });
}

describe("POST /api/clubs/:slug/posts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue(post);
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access-token"),
      refreshed: null,
    }));
  });

  it("validates and forwards one normalized post through the authenticated API", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });

    expect(mocks.post).toHaveBeenCalledWith(
      "/v1/clubs/forest-walkers/posts",
      { title: "함께 걷고 싶은 길", content },
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    await expect(response.json()).resolves.toEqual(post);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("club-posts", { expire: 0 });
  });

  it("does not claim create idempotency: identical retries reach the backend twice", async () => {
    const first = await POST(request(), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });
    const second = await POST(request(), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(mocks.post).toHaveBeenCalledTimes(2);
    expect(mocks.post.mock.calls[0]).toEqual(mocks.post.mock.calls[1]);
    expect(mocks.post.mock.calls[0]?.[2]).toEqual({
      headers: { Authorization: "Bearer access-token" },
    });
  });

  it.each([
    [{ title: "한", content }, "forest-walkers"],
    [{ title: "올바른 제목", content: "짧음" }, "forest-walkers"],
    [{ title: "올바른 제목", content, userId: "other-user" }, "forest-walkers"],
    [{ title: "올바른 제목", content }, "../admin"],
  ])("rejects invalid body or slug before authentication", async (body, slug) => {
    const response = await POST(request(body), {
      params: Promise.resolve({ slug }),
    });

    expect(response.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects cross-origin, non-JSON, and malformed JSON requests", async () => {
    const crossOrigin = await POST(
      request(undefined, { requestOrigin: "https://evil.example" }),
      { params: Promise.resolve({ slug: "forest-walkers" }) },
    );
    const nonJson = await POST(request(undefined, { contentType: "text/plain" }), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });
    const malformed = await POST(request(undefined, { rawBody: "{" }), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });

    expect(crossOrigin.status).toBe(403);
    expect(nonJson.status).toBe(415);
    expect(malformed.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("preserves an onboarding error without invalidating public caches", async () => {
    mocks.withBackendAccess.mockRejectedValue(
      new ApiHttpError(
        403,
        "시작 설정을 먼저 완료해 주세요.",
        "ONBOARDING_REQUIRED",
      ),
    );

    const response = await POST(request(), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ONBOARDING_REQUIRED",
        message: "시작 설정을 먼저 완료해 주세요.",
      },
    });
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("returns the committed result and rotated cookies even if cache expiry fails", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
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
    mocks.revalidateTag.mockImplementationOnce(() => {
      throw new Error("cache unavailable");
    });

    const response = await POST(request(), {
      params: Promise.resolve({ slug: "forest-walkers" }),
    });
    const cookies = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual(post);
    expect(cookies).toContain(refreshed.accessToken);
    expect(cookies).toContain(refreshed.refreshToken);
    expect(cookies.toLocaleLowerCase("en-US")).toContain("httponly");
    expect(log).toHaveBeenCalledWith(
      "Failed to expire community cache tag: club-posts",
      expect.any(Error),
    );
    log.mockRestore();
  });
});
