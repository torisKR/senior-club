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

import { POST } from "@/app/api/posts/[id]/comments/route";

const origin = "https://seniorclub.example";
const createdAt = "2026-07-30T01:00:00.000Z";
const comment = {
  id: "comment-2",
  postId: "post-1",
  parentId: "comment-1",
  content: "저도 함께 걷고 싶습니다.",
  author: { id: "member-2", name: "이회원" },
  createdAt,
  updatedAt: createdAt,
};

function request(
  body: unknown = {
    content: `  ${comment.content}  `,
    parentId: "comment-1",
  },
  requestOrigin = origin,
) {
  return new Request(`${origin}/api/posts/post-1/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: requestOrigin },
    body: JSON.stringify(body),
  });
}

describe("POST /api/posts/:id/comments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.post.mockResolvedValue(comment);
    mocks.withBackendAccess.mockImplementation(async (_request, operation) => ({
      result: await operation("access-token"),
      refreshed: null,
    }));
  });

  it("forwards a normalized one-level reply and invalidates both public feeds", async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ id: "post-1" }),
    });

    expect(mocks.post).toHaveBeenCalledWith(
      "/v1/posts/post-1/comments",
      { content: comment.content, parentId: "comment-1" },
      { headers: { Authorization: "Bearer access-token" } },
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    await expect(response.json()).resolves.toEqual(comment);
    expect(mocks.revalidateTag.mock.calls).toEqual([
      ["post-comments", { expire: 0 }],
      ["club-posts", { expire: 0 }],
    ]);
  });

  it.each([
    [{ content: "한" }, "post-1"],
    [{ content: "함께 가요.", parentId: "../comment" }, "post-1"],
    [{ content: "함께 가요.", postId: "post-2" }, "post-1"],
    [{ content: "함께 가요." }, "../post"],
  ])("rejects invalid body or post id before authentication", async (body, id) => {
    const response = await POST(request(body), {
      params: Promise.resolve({ id }),
    });

    expect(response.status).toBe(400);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("rejects a cross-origin reply before authentication", async () => {
    const response = await POST(request(undefined, "https://evil.example"), {
      params: Promise.resolve({ id: "post-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.withBackendAccess).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
  });
});
