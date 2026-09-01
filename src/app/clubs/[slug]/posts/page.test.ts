import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  composer: vi.fn<(props: Record<string, unknown>) => string>(
    () => "POST_COMPOSER",
  ),
  getPublicClub: vi.fn(),
  getPublicClubPosts: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/community-post-actions", () => ({
  CommunityPostComposer: mocks.composer,
}));
vi.mock("@/lib/clubs/server", () => ({
  getPublicClub: mocks.getPublicClub,
}));
vi.mock("@/lib/posts/server", () => ({
  getPublicClubPosts: mocks.getPublicClubPosts,
  isSafePublicPostCursor: (value: unknown) =>
    typeof value === "string" && value.length >= 8,
}));

import CommunityPostsPage, {
  generateMetadata,
} from "@/app/clubs/[slug]/posts/page";

const createdAt = "2026-07-30T01:00:00.000Z";
const liveClub = {
  id: "club-live",
  slug: "forest-walkers",
  title: "숲길을 걷는 사람들",
  description: "가까운 숲길을 천천히 걷습니다.",
  region: "서울특별시",
  interest: {
    id: "interest-hiking",
    slug: "hiking",
    name: "등산",
    icon: "mountain",
  },
  leaderName: "김선영",
  memberCount: 17,
  upcomingEventCount: 3,
  pastEventCount: 9,
  nextEvent: null,
};
const livePost = {
  id: "post-1",
  clubId: "club-live",
  type: "GENERAL",
  title: "함께 걷고 싶은 길",
  content: "다음 모임에서 함께 걷고 싶은 길을 나눠 주세요.",
  author: { id: "member-1", name: "김회원" },
  commentCount: 2,
  createdAt,
  updatedAt: createdAt,
  dateLabel: "2026년 7월 30일 오전 10:00",
};

function renderPage(searchParams: { cursor?: string | string[] } = {}) {
  return CommunityPostsPage({
    params: Promise.resolve({ slug: "forest-walkers" }),
    searchParams: Promise.resolve(searchParams),
  }).then(renderToStaticMarkup);
}

describe("live community posts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicClub.mockResolvedValue(liveClub);
    mocks.getPublicClubPosts.mockResolvedValue({
      club: {
        id: liveClub.id,
        slug: liveClub.slug,
        title: liveClub.title,
      },
      posts: [livePost],
      nextCursor: "post:cursor:02",
      hasNextPage: true,
    });
  });

  it("keeps the public board out of search results", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ slug: "forest-walkers" }),
      searchParams: Promise.resolve({}),
    });

    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    });
    expect(metadata.alternates).toBeUndefined();
  });

  it("renders verified API posts and a validated cursor without fixture fallback", async () => {
    const html = await renderPage();

    expect(mocks.getPublicClubPosts).toHaveBeenCalledWith("forest-walkers", {
      limit: 20,
    });
    expect(html).toContain("함께 걷고 싶은 길");
    expect(html).toContain("김회원");
    expect(html).toContain("댓글 2개");
    expect(html).toContain("post%3Acursor%3A02");
    expect(html).toContain("POST_COMPOSER");
    expect(html).not.toContain("첫 사진");
    expect(mocks.composer.mock.calls[0]?.[0]).toMatchObject({
      clubSlug: "forest-walkers",
      loginHref:
        "/login?returnTo=%2Fclubs%2Fforest-walkers%2Fposts",
      onboardingHref:
        "/onboarding?returnTo=%2Fclubs%2Fforest-walkers%2Fposts",
    });
  });

  it("forwards one validated cursor to the API", async () => {
    await renderPage({ cursor: "post:cursor:01" });

    expect(mocks.getPublicClubPosts).toHaveBeenCalledWith("forest-walkers", {
      limit: 20,
      cursor: "post:cursor:01",
    });
  });

  it("rejects short or multi-value cursors before fetching posts", async () => {
    const short = await renderPage({ cursor: "short" });
    const duplicate = await renderPage({
      cursor: ["post:cursor:01", "post:cursor:02"],
    });

    expect(short).toContain("게시글 목록 주소가 올바르지 않아요");
    expect(duplicate).toContain("게시글 목록 주소가 올바르지 않아요");
    expect(mocks.getPublicClubPosts).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable feed from a verified empty feed", async () => {
    mocks.getPublicClubPosts.mockRejectedValueOnce(new Error("offline"));
    const unavailable = await renderPage();
    mocks.getPublicClubPosts.mockResolvedValueOnce({
      club: {
        id: liveClub.id,
        slug: liveClub.slug,
        title: liveClub.title,
      },
      posts: [],
      nextCursor: null,
      hasNextPage: false,
    });
    const empty = await renderPage();

    expect(unavailable).toContain("게시글을 잠시 불러오지 못했어요");
    expect(unavailable).toContain("예시 글을 대신 보여주지 않습니다");
    expect(empty).toContain("공개된 게시글이 아직 없어요");
  });

  it("shows an explicit live-club error and never requests its feed", async () => {
    mocks.getPublicClub.mockRejectedValueOnce(new Error("offline"));

    const html = await renderPage();

    expect(html).toContain("게시판 정보를 잠시 불러오지 못했어요");
    expect(html).toContain("예시 게시글로 대신하지 않습니다");
    expect(mocks.getPublicClubPosts).not.toHaveBeenCalled();
  });

  it("uses not-found for an absent live club", async () => {
    mocks.getPublicClub.mockResolvedValueOnce(null);

    await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(mocks.getPublicClubPosts).not.toHaveBeenCalled();
  });
});
