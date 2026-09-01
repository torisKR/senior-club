import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

let mapApiEventToWebEvent: typeof import("./server").mapApiEventToWebEvent;
let parsePublicEventCursor: typeof import("./server").parsePublicEventCursor;
let getPublicEventsForSitemap: typeof import("./server").getPublicEventsForSitemap;

beforeAll(async () => {
  ({
    getPublicEventsForSitemap,
    mapApiEventToWebEvent,
    parsePublicEventCursor,
  } = await import("./server"));
});

function dto(overrides: Record<string, unknown> = {}) {
  return {
    id: "event-live",
    title: "서울숲 사진 산책",
    description: "스마트폰으로 계절의 빛을 기록합니다.",
    coverImageUrl: "https://cdn.example.test/events/photo.jpg",
    locationName: "서울숲 방문자센터",
    address: "서울특별시 성동구 뚝섬로 273",
    mapUrl: "https://map.example.test/event-live",
    startAt: "2026-08-08T07:00:00.000Z",
    endAt: "2026-08-08T09:30:00.000Z",
    registrationDeadline: "2026-08-07T09:00:00.000Z",
    capacity: 12,
    participantCount: 4,
    remainingCapacity: 8,
    price: 8_000,
    currency: "KRW",
    difficulty: "MODERATE",
    supplies: "편한 신발, 물\n충전한 스마트폰",
    approvalMode: "MANUAL",
    status: "PUBLISHED",
    club: {
      id: "club-photo",
      slug: "phone-photo-walk",
      title: "스마트폰 사진산책",
      region: "서울특별시",
      interest: { slug: "photo", name: "사진", icon: "camera" },
      leaderName: "김선영",
    },
    ...overrides,
  };
}

describe("public event API adapter", () => {
  it("accepts only bounded base64url-style catalog cursors", () => {
    expect(parsePublicEventCursor("eyJpZCI6ImV2ZW50LTEifQ")).toBe(
      "eyJpZCI6ImV2ZW50LTEifQ",
    );
    expect(parsePublicEventCursor("short")).toBeUndefined();
    expect(parsePublicEventCursor("../../admin")).toBeUndefined();
    expect(parsePublicEventCursor(["duplicate", "cursor"])).toBeUndefined();
  });

  it("maps backend fields without replacing them with fixture facts", () => {
    expect(mapApiEventToWebEvent(dto())).toMatchObject({
      id: "event-live",
      clubId: "club-photo",
      clubSlug: "phone-photo-walk",
      clubTitle: "스마트폰 사진산책",
      category: "photo",
      difficulty: "보통",
      status: "recruiting",
      registrationDeadline: "2026-08-07T09:00:00.000Z",
      image: "https://cdn.example.test/events/photo.jpg",
      mapUrl: "https://map.example.test/event-live",
      region: "서울특별시",
      district: "성동구",
      preparations: ["편한 신발", "물", "충전한 스마트폰"],
      participantCount: 4,
      currentMembers: 4,
    });
  });

  it("preserves missing optional facts as missing", () => {
    const event = mapApiEventToWebEvent(
      dto({
        coverImageUrl: null,
        endAt: null,
        registrationDeadline: null,
        mapUrl: null,
        supplies: null,
      }),
    );

    expect(event).not.toHaveProperty("image");
    expect(event).not.toHaveProperty("endAt");
    expect(event).not.toHaveProperty("registrationDeadline");
    expect(event.preparations).toEqual([]);
  });

  it("fails closed for unsafe links or unsupported interest taxonomy", () => {
    expect(() =>
      mapApiEventToWebEvent(dto({ coverImageUrl: "http://cdn.test/a.jpg" })),
    ).toThrow();
    expect(() =>
      mapApiEventToWebEvent(dto({ mapUrl: "javascript:alert(1)" })),
    ).toThrow();
    expect(() =>
      mapApiEventToWebEvent(
        dto({
          club: {
            ...(dto().club as object),
            interest: { slug: "unknown", name: "미등록", icon: "circle" },
          },
        }),
      ),
    ).toThrow(/지원하지 않는 관심사/);
  });

  it("bounds sitemap collection to two pages per view and deduplicates IDs", async () => {
    const events = [
      mapApiEventToWebEvent(dto({ id: "shared" })),
      mapApiEventToWebEvent(dto({ id: "upcoming-2" })),
      mapApiEventToWebEvent(dto({ id: "past-2" })),
    ];
    const fetchCatalog = vi.fn(async ({ view, cursor }) => {
      if (!cursor) {
        return {
          events: [events[0]!],
          hasNextPage: true,
          nextCursor: `${view}-cursor`,
        };
      }
      return {
        events: [view === "upcoming" ? events[1]! : events[2]!],
        hasNextPage: true,
        nextCursor: `${view}-third-page`,
      };
    });

    const result = await getPublicEventsForSitemap(fetchCatalog);

    expect(fetchCatalog).toHaveBeenCalledTimes(4);
    expect(fetchCatalog.mock.calls.map(([options]) => options)).toEqual([
      { view: "upcoming", limit: 50, cursor: undefined },
      { view: "past", limit: 50, cursor: undefined },
      { view: "upcoming", limit: 50, cursor: "upcoming-cursor" },
      { view: "past", limit: 50, cursor: "past-cursor" },
    ]);
    expect(result.map(({ id }) => id)).toEqual([
      "shared",
      "upcoming-2",
      "past-2",
    ]);
  });

  it("fails closed when a sitemap page repeats a cursor", async () => {
    const fetchCatalog = vi.fn(async ({ view, cursor }) => ({
      events: [],
      hasNextPage: true,
      nextCursor: cursor ?? `${view}-cursor`,
    }));

    await expect(getPublicEventsForSitemap(fetchCatalog)).rejects.toThrow(
      /반복되는 페이지 커서/,
    );
  });
});
