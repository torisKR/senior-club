import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let getPublicClub: typeof import("./server").getPublicClub;
let getPublicClubCatalog: typeof import("./server").getPublicClubCatalog;
let getPublicClubsForSitemap: typeof import("./server").getPublicClubsForSitemap;
let isSafePublicClubCursor: typeof import("./server").isSafePublicClubCursor;
let mapApiClubToPublicClub: typeof import("./server").mapApiClubToPublicClub;

function dto(overrides: Record<string, unknown> = {}) {
  return {
    id: "club-live",
    slug: "forest-walkers",
    title: "숲길을 걷는 사람들",
    description: "가까운 숲길을 천천히 걷습니다.",
    region: "서울특별시",
    coverImageUrl: "https://cdn.example.test/clubs/forest.jpg",
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
    nextEvent: {
      id: "event-next",
      title: "아침 숲길 걷기",
      locationName: "서울숲 방문자센터",
      startAt: "2026-08-08T01:00:00.000Z",
      status: "PUBLISHED",
    },
    ...overrides,
  };
}

beforeAll(async () => {
  ({
    getPublicClub,
    getPublicClubCatalog,
    getPublicClubsForSitemap,
    isSafePublicClubCursor,
    mapApiClubToPublicClub,
  } = await import("./server"));
});

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv("SENIOR_CLUB_API_BASE_URL", "https://api.example.test");
});

describe("public club API adapter", () => {
  it("maps only validated API facts and formats the next event in Korea time", () => {
    expect(mapApiClubToPublicClub(dto())).toEqual({
      id: "club-live",
      slug: "forest-walkers",
      title: "숲길을 걷는 사람들",
      description: "가까운 숲길을 천천히 걷습니다.",
      region: "서울특별시",
      image: "https://cdn.example.test/clubs/forest.jpg",
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
      nextEvent: {
        id: "event-next",
        title: "아침 숲길 걷기",
        locationName: "서울숲 방문자센터",
        startAt: "2026-08-08T01:00:00.000Z",
        dateLabel: expect.any(String),
        status: "PUBLISHED",
      },
    });
    expect(mapApiClubToPublicClub(dto()).nextEvent?.dateLabel).toContain("8월 8일");
  });

  it("preserves absent optional images instead of inventing a club image", () => {
    const club = mapApiClubToPublicClub(
      dto({ coverImageUrl: undefined, region: null }),
    );
    expect(club).not.toHaveProperty("image");
    expect(club.region).toBeNull();
  });

  it("fails closed for unsafe images, slugs, and invalid event dates", () => {
    expect(() =>
      mapApiClubToPublicClub(dto({ coverImageUrl: "http://cdn.test/a.jpg" })),
    ).toThrow();
    expect(() => mapApiClubToPublicClub(dto({ slug: "../admin" }))).toThrow();
    expect(() =>
      mapApiClubToPublicClub(
        dto({
          nextEvent: {
            ...(dto().nextEvent as object),
            startAt: "not-a-date",
          },
        }),
      ),
    ).toThrow();
    expect(() => mapApiClubToPublicClub(dto({ memberCount: -1 }))).toThrow();
    expect(() =>
      mapApiClubToPublicClub(
        dto({
          nextEvent: {
            ...(dto().nextEvent as object),
            status: "CANCELED",
          },
        }),
      ),
    ).toThrow();
    expect(() =>
      mapApiClubToPublicClub(
        dto({
          nextEvent: {
            ...(dto().nextEvent as object),
            id: "../unsafe-event",
          },
        }),
      ),
    ).toThrow();
  });
});

describe("public club server client", () => {
  it("validates filters and sends a revalidated server fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [dto({ coverImageUrl: undefined })],
          page: { nextCursor: null, hasNextPage: false },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const catalog = await getPublicClubCatalog({
      category: "hiking",
      region: " 서울특별시 ",
      q: " 숲   걷기 ",
      limit: 12,
    });

    expect(catalog.clubs).toHaveLength(1);
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url.toString()).toBe(
      "https://api.example.test/v1/clubs?limit=12&category=hiking&region=%EC%84%9C%EC%9A%B8%ED%8A%B9%EB%B3%84%EC%8B%9C&q=%EC%88%B2+%EA%B1%B7%EA%B8%B0",
    );
    expect(options).toMatchObject({
      cache: "force-cache",
      next: { revalidate: 120 },
      method: "GET",
    });
  });

  it("rejects a tampered cursor before calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(isSafePublicClubCursor("opaque:Cursor/123?next=yes")).toBe(true);
    expect(isSafePublicClubCursor("short")).toBe(false);
    await expect(
      getPublicClubCatalog({ cursor: "short" }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects contradictory pagination metadata", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [],
          page: { nextCursor: null, hasNextPage: true },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicClubCatalog()).rejects.toThrow();
  });

  it("returns null only for a valid missing slug", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "CLUB_NOT_FOUND", message: "찾을 수 없습니다." },
        }),
        { status: 404, headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicClub("missing-club")).resolves.toBeNull();
    await expect(getPublicClub("../unsafe")).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("propagates upstream and schema failures instead of treating them as missing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "INTERNAL_ERROR", message: "잠시 후 다시 시도" },
          }),
          { status: 503, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...dto(), memberCount: -10 }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicClub("forest-walkers")).rejects.toMatchObject({
      status: 503,
    });
    await expect(getPublicClub("forest-walkers")).rejects.toThrow();
  });

  it("bounds sitemap collection to four API pages", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const page = fetchMock.mock.calls.length;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              dto({
                id: `club-${page}`,
                slug: `club-page-${page}`,
                coverImageUrl: undefined,
              }),
            ],
            page: {
              nextCursor: `cursor-page-${page}`,
              hasNextPage: true,
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const clubs = await getPublicClubsForSitemap();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(clubs.map((club) => club.slug)).toEqual([
      "club-page-1",
      "club-page-2",
      "club-page-3",
      "club-page-4",
    ]);
  });

  it("fails closed when sitemap pagination repeats a cursor", async () => {
    const fetchMock = vi.fn().mockImplementation(() => {
      const page = fetchMock.mock.calls.length;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              dto({
                id: `club-${page}`,
                slug: `club-page-${page}`,
                coverImageUrl: undefined,
              }),
            ],
            page: { nextCursor: "repeated-cursor", hasNextPage: true },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getPublicClubsForSitemap()).rejects.toThrow(/반복되는/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
