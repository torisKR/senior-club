import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  comments: vi.fn((props: { comments: Array<{ content: string }> }) =>
    props.comments.length
      ? `COMMENTS:${props.comments.map((comment) => comment.content).join("|")}`
      : "COMMENTS_EMPTY",
  ),
  getPublicPost: vi.fn(),
  getPublicPostComments: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/community-post-actions", () => ({
  CommunityPostComments: mocks.comments,
}));
vi.mock("@/lib/posts/server", () => ({
  getPublicPost: mocks.getPublicPost,
  getPublicPostComments: mocks.getPublicPostComments,
  isSafePublicPostCursor: (value: unknown) =>
    typeof value === "string" && value.length >= 8,
}));

import CommunityPostDetailPage, {
  generateMetadata,
} from "@/app/clubs/[slug]/posts/[id]/page";

const createdAt = "2026-07-30T01:00:00.000Z";
const livePost = {
  id: "post-1",
  clubId: "club-1",
  type: "GENERAL",
  title: "함께 걷고 싶은 길",
  content: "다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.",
  author: { id: "member-1", name: "김회원" },
  commentCount: 2,
  createdAt,
  updatedAt: createdAt,
  dateLabel: "2026년 7월 30일 오전 10:00",
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
};
const liveComment = {
  id: "comment-1",
  postId: "post-1",
  parentId: null,
  content: "저도 남산 둘레길을 추천합니다.",
  author: { id: "member-2", name: "이회원" },
  createdAt,
  updatedAt: createdAt,
  dateLabel: "2026년 7월 30일 오전 10:00",
};

function renderPage(
  options: {
    slug?: string;
    id?: string;
    commentCursor?: string | string[];
  } = {},
) {
  const searchParams =
    options.commentCursor === undefined
      ? {}
      : { commentCursor: options.commentCursor };
  return CommunityPostDetailPage({
    params: Promise.resolve({
      slug: options.slug ?? "forest-walkers",
      id: options.id ?? "post-1",
    }),
    searchParams: Promise.resolve(searchParams),
  }).then(renderToStaticMarkup);
}

describe("live community post detail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPost.mockResolvedValue(livePost);
    mocks.getPublicPostComments.mockResolvedValue({
      comments: [liveComment],
      nextCursor: "comment:cursor:02",
      hasNextPage: true,
    });
  });

  it("keeps a verified post detail out of search results", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "forest-walkers", id: "post-1" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.title).toMatchObject({
      absolute: expect.stringContaining("함께 걷고 싶은 길"),
    });
    expect(metadata.robots).toMatchObject({ index: false, follow: false });
    expect(metadata.alternates).toBeUndefined();
  });

  it("renders verified post and comment facts with protected writing routes", async () => {
    const html = await renderPage();

    expect(mocks.getPublicPost).toHaveBeenCalledWith("post-1");
    expect(mocks.getPublicPostComments).toHaveBeenCalledWith("post-1", {
      limit: 20,
    });
    expect(html).toContain("함께 걷고 싶은 길");
    expect(html).toContain("다음 모임에서 함께 걷고 싶은 길");
    expect(html).toContain("김회원");
    expect(html).toContain("COMMENTS:저도 남산 둘레길을 추천합니다.");
    expect(mocks.comments.mock.calls[0]?.[0]).toMatchObject({
      postId: "post-1",
      loginHref:
        "/login?returnTo=%2Fclubs%2Fforest-walkers%2Fposts%2Fpost-1",
      onboardingHref:
        "/onboarding?returnTo=%2Fclubs%2Fforest-walkers%2Fposts%2Fpost-1",
      nextHref:
        "/clubs/forest-walkers/posts/post-1?commentCursor=comment%3Acursor%3A02#post-comments-heading",
    });
  });

  it("forwards one validated comment cursor", async () => {
    await renderPage({ commentCursor: "comment:cursor:01" });

    expect(mocks.getPublicPostComments).toHaveBeenCalledWith("post-1", {
      limit: 20,
      cursor: "comment:cursor:01",
    });
  });

  it("rejects short or multi-value cursors without fetching comments", async () => {
    const short = await renderPage({ commentCursor: "short" });
    const duplicate = await renderPage({
      commentCursor: ["comment:cursor:01", "comment:cursor:02"],
    });

    expect(short).toContain("댓글 목록 주소가 올바르지 않아요");
    expect(duplicate).toContain("댓글 목록 주소가 올바르지 않아요");
    expect(mocks.getPublicPostComments).not.toHaveBeenCalled();
    expect(mocks.comments).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable comment feed from a verified empty feed", async () => {
    mocks.getPublicPostComments.mockRejectedValueOnce(new Error("offline"));
    const unavailable = await renderPage();
    mocks.getPublicPostComments.mockResolvedValueOnce({
      comments: [],
      nextCursor: null,
      hasNextPage: false,
    });
    const empty = await renderPage();

    expect(unavailable).toContain("댓글을 잠시 불러오지 못했어요");
    expect(unavailable).toContain("예시 댓글을 표시하지 않습니다");
    expect(empty).toContain("COMMENTS_EMPTY");
  });

  it.each([
    [null, "forest-walkers"],
    [{ ...livePost, club: { ...livePost.club, slug: "other-club" } }, "forest-walkers"],
  ])("uses not-found for a missing or route-mismatched post", async (post, slug) => {
    mocks.getPublicPost.mockResolvedValueOnce(post);

    await expect(renderPage({ slug })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPublicPostComments).not.toHaveBeenCalled();
  });

  it("shows an explicit post API error without substituting content", async () => {
    mocks.getPublicPost.mockRejectedValueOnce(new Error("offline"));

    const html = await renderPage();

    expect(html).toContain("게시글을 잠시 불러오지 못했어요");
    expect(html).toContain("예시 내용으로 대신하지 않습니다");
    expect(mocks.getPublicPostComments).not.toHaveBeenCalled();
  });
});
