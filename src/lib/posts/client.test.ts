import { describe, expect, it, vi } from "vitest";

import {
  createCommunityComment,
  createCommunityPost,
} from "@/lib/posts/client";

const createdAt = "2026-07-30T01:00:00.000Z";
const post = {
  id: "post-1",
  clubId: "club-1",
  title: "함께 걷고 싶은 길",
  content: "다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.",
  author: { id: "member-1", name: "김회원" },
  club: {
    id: "club-1",
    slug: "forest-walkers",
    title: "숲길을 걷는 사람들",
  },
  createdAt,
  updatedAt: createdAt,
};
const comment = {
  id: "comment-1",
  postId: "post-1",
  parentId: "comment-root",
  content: "저도 함께 걷고 싶습니다.",
  author: { id: "member-2", name: "이회원" },
  createdAt,
  updatedAt: createdAt,
};

describe("community posts browser client", () => {
  it("submits a normalized post to the same-origin BFF and validates its club", async () => {
    const request = vi.fn(async () => Response.json(post, { status: 201 }));

    await expect(
      createCommunityPost(
        "forest-walkers",
        {
          title: "  함께 걷고 싶은 길  ",
          content: `  ${post.content}  `,
        },
        { fetchImplementation: request as unknown as typeof fetch },
      ),
    ).resolves.toEqual(post);

    expect(request).toHaveBeenCalledWith(
      "/api/clubs/forest-walkers/posts",
      expect.objectContaining({
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: post.title, content: post.content }),
      }),
    );
  });

  it("submits a reply target without allowing caller-owned post fields", async () => {
    const request = vi.fn(async () => Response.json(comment, { status: 201 }));

    await expect(
      createCommunityComment(
        "post-1",
        { content: `  ${comment.content}  `, parentId: "comment-root" },
        { fetchImplementation: request as unknown as typeof fetch },
      ),
    ).resolves.toEqual(comment);

    expect(request).toHaveBeenCalledWith(
      "/api/posts/post-1/comments",
      expect.objectContaining({
        method: "POST",
        credentials: "same-origin",
        body: JSON.stringify({
          content: comment.content,
          parentId: "comment-root",
        }),
      }),
    );
  });

  it("rejects invalid identifiers and payloads without spending a request", async () => {
    const request = vi.fn();
    const options = { fetchImplementation: request as unknown as typeof fetch };

    await expect(
      createCommunityPost(
        "../admin",
        { title: post.title, content: post.content },
        options,
      ),
    ).rejects.toThrow();
    await expect(
      createCommunityPost(
        "forest-walkers",
        { title: "한", content: post.content },
        options,
      ),
    ).rejects.toThrow();
    await expect(
      createCommunityComment(
        "post-1",
        { content: "좋아요", parentId: "../comment" },
        options,
      ),
    ).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("preserves authentication and onboarding error details", async () => {
    const request = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "ONBOARDING_REQUIRED",
            message: "시작 설정을 먼저 완료해 주세요.",
          },
        },
        { status: 403 },
      ),
    );

    await expect(
      createCommunityPost(
        "forest-walkers",
        { title: post.title, content: post.content },
        { fetchImplementation: request as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "ONBOARDING_REQUIRED",
      message: "시작 설정을 먼저 완료해 주세요.",
    });
  });

  it("fails closed for malformed or mismatched success responses", async () => {
    const malformed = vi.fn(async () => Response.json({ id: "post-1" }));
    const wrongClub = vi.fn(async () =>
      Response.json({
        ...post,
        club: { ...post.club, slug: "other-club" },
      }),
    );
    const wrongPost = vi.fn(async () =>
      Response.json({ ...comment, postId: "post-2" }),
    );

    await expect(
      createCommunityPost(
        "forest-walkers",
        { title: post.title, content: post.content },
        { fetchImplementation: malformed as unknown as typeof fetch },
      ),
    ).rejects.toThrow();
    await expect(
      createCommunityPost(
        "forest-walkers",
        { title: post.title, content: post.content },
        { fetchImplementation: wrongClub as unknown as typeof fetch },
      ),
    ).rejects.toThrow("등록된 게시글의 커뮤니티를 확인하지 못했습니다.");
    await expect(
      createCommunityComment(
        "post-1",
        { content: comment.content },
        { fetchImplementation: wrongPost as unknown as typeof fetch },
      ),
    ).rejects.toThrow("등록된 댓글의 게시글을 확인하지 못했습니다.");
  });

  it("does not hide a non-JSON upstream response behind a success value", async () => {
    const request = vi.fn(async () =>
      new Response("gateway unavailable", {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    await expect(
      createCommunityPost(
        "forest-walkers",
        { title: post.title, content: post.content },
        { fetchImplementation: request as unknown as typeof fetch },
      ),
    ).rejects.toMatchObject({
      status: 502,
      message: "서버 응답을 확인하지 못했습니다.",
    });
  });
});
