import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPublicClubCatalogMock, getPublicClubMock } = vi.hoisted(() => ({
  getPublicClubCatalogMock: vi.fn(),
  getPublicClubMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/clubs/server", () => ({
  PUBLIC_CLUB_REVALIDATE_SECONDS: 120,
  getPublicClub: getPublicClubMock,
  getPublicClubCatalog: getPublicClubCatalogMock,
  isSafePublicClubCursor: vi.fn(
    (value) => typeof value === "string" && value.length >= 8,
  ),
  isSafePublicClubSlug: vi.fn(
    (value) =>
      typeof value === "string" &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
  ),
}));

import { generateMetadata as generateClubDetailMetadata } from "./[slug]/page";
import ClubsPage, { generateMetadata as generateClubListMetadata } from "./page";

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

beforeEach(() => {
  getPublicClubMock.mockReset().mockResolvedValue(liveClub);
  getPublicClubCatalogMock.mockReset().mockResolvedValue({
    clubs: [liveClub],
    nextCursor: "next-page-cursor",
    hasNextPage: true,
  });
});

describe("live club metadata", () => {
  it("indexes the canonical live club directory", async () => {
    const metadata = await generateClubListMetadata({
      searchParams: Promise.resolve({}),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(metadata.alternates).toHaveProperty("canonical");
    expect(String(metadata.alternates?.canonical)).toMatch(/\/clubs$/);
  });

  it("canonicalizes and noindexes filtered or paginated directory variants", async () => {
    const metadata = await generateClubListMetadata({
      searchParams: Promise.resolve({ category: "hiking", cursor: "opaque-cursor" }),
    });

    expect(metadata.robots).toMatchObject({ index: false, follow: true });
    expect(String(metadata.alternates?.canonical)).toMatch(/\/clubs$/);
  });

  it("uses verified API facts for an indexable detail page", async () => {
    const metadata = await generateClubDetailMetadata({
      params: Promise.resolve({ slug: "forest-walkers" }),
    });

    expect(metadata.robots).toMatchObject({ index: true, follow: true });
    expect(String(metadata.alternates?.canonical)).toMatch(
      /\/clubs\/forest-walkers$/,
    );
    expect(metadata.description).toContain("가까운 숲길을 천천히 걷습니다.");
    expect(metadata.description).not.toMatch(/\d+명/);
  });

  it("does not index a missing or unavailable club as a real detail page", async () => {
    getPublicClubMock.mockResolvedValueOnce(null);
    const missing = await generateClubDetailMetadata({
      params: Promise.resolve({ slug: "missing-club" }),
    });
    getPublicClubMock.mockRejectedValueOnce(new Error("upstream unavailable"));
    const unavailable = await generateClubDetailMetadata({
      params: Promise.resolve({ slug: "forest-walkers" }),
    });

    expect(missing.robots).toMatchObject({ index: false, follow: false });
    expect(missing.alternates).toBeUndefined();
    expect(unavailable.robots).toMatchObject({ index: false, follow: false });
    expect(unavailable.alternates).toBeUndefined();
  });
});

describe("live club directory", () => {
  it("renders API facts and a validated cursor link without fixture fallback", async () => {
    const page = await ClubsPage({ searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("숲길을 걷는 사람들");
    expect(html).toContain("17명");
    expect(html).toContain("리더 김선영");
    expect(html).toContain("next-page-cursor");
    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('숲길을 걷는 사람들');
    expect(html).not.toContain("빛을 걷는 사진산책");
  });

  it("rejects multi-value user input before fetching the catalog", async () => {
    const page = await ClubsPage({
      searchParams: Promise.resolve({ cursor: ["cursor-one", "cursor-two"] }),
    });
    const html = renderToStaticMarkup(page);

    expect(html).toContain("검색 주소가 올바르지 않아요");
    expect(getPublicClubCatalogMock).not.toHaveBeenCalled();
  });

  it("distinguishes an unavailable API from an empty verified catalog", async () => {
    getPublicClubCatalogMock.mockRejectedValueOnce(new Error("unavailable"));
    const unavailable = renderToStaticMarkup(
      await ClubsPage({ searchParams: Promise.resolve({}) }),
    );
    getPublicClubCatalogMock.mockResolvedValueOnce({
      clubs: [],
      nextCursor: null,
      hasNextPage: false,
    });
    const empty = renderToStaticMarkup(
      await ClubsPage({ searchParams: Promise.resolve({}) }),
    );

    expect(unavailable).toContain("커뮤니티 목록을 잠시 불러오지 못했어요");
    expect(unavailable).toContain("예시 정보로 대신하지 않습니다");
    expect(empty).toContain("공개 커뮤니티가 아직 없어요");
  });
});
