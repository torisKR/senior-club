import { describe, expect, it } from "vitest";

import { getHomeFeaturedEvents } from "@/lib/home-featured-events";
import type { Event } from "@/lib/types";

function event(id: string, category: Event["category"]): Event {
  return {
    id,
    clubId: "club-1",
    clubSlug: "club-1",
    title: id,
    description: "테스트를 위한 충분히 긴 모임 설명입니다.",
    category,
    relatedInterests: [],
    location: "서울숲",
    address: "서울특별시 성동구",
    region: "서울특별시",
    district: "성동구",
    date: "8월 10일",
    startAt: "2026-08-10T10:00:00.000Z",
    capacity: 10,
    participantCount: 2,
    currentMembers: 2,
    price: 0,
    difficulty: "쉬움",
    preparations: [],
    leaderName: "리더",
    status: "recruiting",
  };
}

describe("getHomeFeaturedEvents", () => {
  it("returns only the same open categories rendered by home cards", () => {
    const events = [
      event("photo", "photo"),
      event("classical", "classical"),
      event("hiking", "hiking"),
      { ...event("gardening-full", "gardening"), participantCount: 10, currentMembers: 10 },
    ];

    expect(
      getHomeFeaturedEvents(events, new Date("2026-08-01T00:00:00.000Z")).map(
        (item) => item.id,
      ),
    ).toEqual(["hiking", "classical"]);
  });
});
