import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getPublicEvent: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
  requireServerUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/lib/auth/server", () => ({
  requireServerUser: mocks.requireServerUser,
}));
vi.mock("@/lib/events/server", () => ({
  getPublicEvent: mocks.getPublicEvent,
}));

import NewReviewPage from "@/app/reviews/new/page";

const liveEvent = {
  id: "event-live",
  clubId: "club-1",
  clubSlug: "forest-walkers",
  clubTitle: "숲길을 걷는 사람들",
  title: "남산 숲길 천천히 걷기",
  description: "가까운 숲길을 함께 걷습니다.",
  category: "hiking" as const,
  relatedInterests: [],
  location: "남산 둘레길 입구",
  address: "서울특별시 중구 소파로 83",
  region: "서울특별시",
  district: "중구",
  date: "7월 29일 수요일",
  startAt: "2026-07-29T01:00:00.000Z",
  endAt: "2026-07-29T03:00:00.000Z",
  capacity: 20,
  participantCount: 12,
  currentMembers: 12,
  price: 0,
  difficulty: "쉬움" as const,
  preparations: [],
  leaderName: "김리더",
  status: "completed" as const,
};

describe("new review page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireServerUser.mockResolvedValue({ id: "member-1" });
    mocks.getPublicEvent.mockResolvedValue(liveEvent);
  });

  it("uses the exact authenticated session return path and live event detail", async () => {
    const page = await NewReviewPage({
      searchParams: Promise.resolve({ eventId: "event-live" }),
    });
    const html = renderToStaticMarkup(page);

    expect(mocks.requireServerUser).toHaveBeenCalledWith(
      "/reviews/new?eventId=event-live",
    );
    expect(mocks.getPublicEvent).toHaveBeenCalledWith("event-live");
    expect(html).toContain("남산 숲길 천천히 걷기");
    expect(html).toContain("후기 남기기");
    expect(html).not.toContain("사진 첨부");
  });

  it.each([
    {},
    { eventId: ["event-live", "event-other"] },
    { eventId: "../admin" },
    { eventId: "" },
  ])("fails closed for a missing, duplicate, or malformed event query", async (params) => {
    await expect(
      NewReviewPage({ searchParams: Promise.resolve(params) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.requireServerUser).not.toHaveBeenCalled();
    expect(mocks.getPublicEvent).not.toHaveBeenCalled();
  });

  it("does not substitute fixture content when the live event is missing", async () => {
    mocks.getPublicEvent.mockResolvedValue(null);

    await expect(
      NewReviewPage({
        searchParams: Promise.resolve({ eventId: "event-live" }),
      }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.requireServerUser).toHaveBeenCalledOnce();
    expect(mocks.getPublicEvent).toHaveBeenCalledOnce();
  });
});
