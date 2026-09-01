import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let getPublicClubPosts: typeof import("./server").getPublicClubPosts;
let getPublicPost: typeof import("./server").getPublicPost;
let getPublicPostComments: typeof import("./server").getPublicPostComments;
let isSafePublicPostCursor: typeof import("./server").isSafePublicPostCursor;

const createdAt = "2026-07-30T01:00:00.000Z";

function postDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "post-1",
    clubId: "club-1",
    type: "GENERAL",
    title: "함께 걷고 싶은 길",
    content: "다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.",
    author: { id: "member-1", name: "김회원" },
    commentCount: 2,
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function detailDto(overrides: Record<string, unknown> = {}) {
  return {
    ...postDto(),
    club: {
      id: "club-1",
      slug: "forest-walkers",
      title: "숲길을 걷는 사람들",
      region: "서울특별시",
      interest: {
        id: "interest-1",
        slug: "hiking",
        name: "등산",
        icon: "mountain",
      },
    },
    ...overrides,
  };
}

function commentDto(overrides: Record<string, unknown> = {}) {
  return {
    id: "comment-1",
    postId: "post-1",
    parentId: null,
    content: "저도 남산 둘레길을 추천합니다.",
    author: { id: "member-2", name: "이회원" },
    createdAt,
    updatedAt: createdAt,
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeAll(async () => {
  ({
    getPublicClubPosts,
    getPublicPost,
    getPublicPostComments,
    isSafePublicPostCursor,
  } = await import("./server"));
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("SENIOR_CLUB_API_BASE_URL", "https://api.example.test");
});

describe("public posts server adapter", () => {
  it("fetches a validated club feed with bounded pagination and cache tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        club: {
          id: "club-1",
          slug: "forest-walkers",
          title: "숲길을 걷는 사람들",
        },
        data: [postDto()],
        page: { nextCursor: "cursor-page-02", hasNextPage: true },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getPublicClubPosts("forest-walkers", {
      limit: 10,
      cursor: "cursor-page-01",
    });

    expect(catalog.posts).toHaveLength(1);
    expect(catalog.posts[0]).toMatchObject({
      id: "post-1",
      dateLabel: expect.stringContaining("7월 30일"),
    });
    expect(catalog).toMatchObject({
      nextCursor: "cursor-page-02",
      hasNextPage: true,
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe(
      "https://api.example.test/v1/clubs/forest-walkers/posts?limit=10&cursor=cursor-page-01",
    );
    expect(options).toMatchObject({
      cache: "force-cache",
      method: "GET",
      next: { revalidate: 120, tags: ["club-posts"] },
    });
  });

  it("rejects unsafe cursors and slugs before spending a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isSafePublicPostCursor("cursor-page-01")).toBe(true);
    expect(isSafePublicPostCursor("short")).toBe(false);
    await expect(
      getPublicClubPosts("forest-walkers", { cursor: "short" }),
    ).rejects.toThrow();
    await expect(getPublicClubPosts("../admin")).rejects.toMatchObject({
      status: 400,
      code: "INVALID_CLUB_SLUG",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails closed for mismatched clubs, malformed facts, and contradictory pages", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          club: { id: "club-2", slug: "other-club", title: "다른 모임" },
          data: [],
          page: { nextCursor: null, hasNextPage: false },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          club: {
            id: "club-1",
            slug: "forest-walkers",
            title: "숲길을 걷는 사람들",
          },
          data: [postDto({ commentCount: -1 })],
          page: { nextCursor: null, hasNextPage: false },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          club: {
            id: "club-1",
            slug: "forest-walkers",
            title: "숲길을 걷는 사람들",
          },
          data: [],
          page: { nextCursor: null, hasNextPage: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          club: {
            id: "club-1",
            slug: "forest-walkers",
            title: "숲길을 걷는 사람들",
          },
          data: [postDto({ clubId: "club-2" })],
          page: { nextCursor: null, hasNextPage: false },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicClubPosts("forest-walkers")).rejects.toThrow(
      "게시글 목록의 커뮤니티 정보를 확인하지 못했습니다.",
    );
    await expect(getPublicClubPosts("forest-walkers")).rejects.toThrow();
    await expect(getPublicClubPosts("forest-walkers")).rejects.toThrow();
    await expect(getPublicClubPosts("forest-walkers")).rejects.toThrow(
      "게시글 목록의 커뮤니티 정보를 확인하지 못했습니다.",
    );
  });

  it("returns null only for a valid missing post and propagates other failures", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "POST_NOT_FOUND", message: "찾을 수 없습니다." } },
          404,
        ),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          { error: { code: "UPSTREAM_ERROR", message: "잠시 후 다시 시도" } },
          503,
        ),
      )
      .mockResolvedValueOnce(jsonResponse(detailDto({ commentCount: -1 })))
      .mockResolvedValueOnce(jsonResponse(detailDto({ id: "post-2" })));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicPost("post-missing")).resolves.toBeNull();
    await expect(getPublicPost("../unsafe")).resolves.toBeNull();
    await expect(getPublicPost("post-1")).rejects.toMatchObject({ status: 503 });
    await expect(getPublicPost("post-1")).rejects.toThrow();
    await expect(getPublicPost("post-1")).rejects.toThrow(
      "게시글 응답의 식별자를 확인하지 못했습니다.",
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("maps a valid detail response and uses the public post cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(detailDto()));
    vi.stubGlobal("fetch", fetchMock);

    const post = await getPublicPost("post-1");

    expect(post).toMatchObject({
      id: "post-1",
      dateLabel: expect.stringContaining("7월 30일"),
      club: { slug: "forest-walkers", interest: { slug: "hiking" } },
    });
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      "https://api.example.test/v1/posts/post-1",
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 120, tags: ["club-posts"] },
    });
  });

  it("validates comment ownership and comment pagination metadata", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [commentDto()],
          page: { nextCursor: "comment-cursor-02", hasNextPage: true },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          data: [commentDto({ postId: "post-2" })],
          page: { nextCursor: null, hasNextPage: false },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getPublicPostComments("post-1", {
      limit: 20,
      cursor: "comment-cursor-01",
    });

    expect(catalog.comments[0]).toMatchObject({
      id: "comment-1",
      dateLabel: expect.stringContaining("7월 30일"),
    });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe(
      "https://api.example.test/v1/posts/post-1/comments?limit=20&cursor=comment-cursor-01",
    );
    expect(options).toMatchObject({
      next: { revalidate: 120, tags: ["post-comments"] },
    });
    await expect(getPublicPostComments("post-1")).rejects.toThrow(
      "댓글의 게시글 정보를 확인하지 못했습니다.",
    );
  });
});
