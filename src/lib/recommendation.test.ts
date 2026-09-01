import { describe, expect, it } from "vitest";

import { EVENTS } from "@/lib/data";
import {
  recommendEvents,
  scoreEventRecommendation,
} from "@/lib/recommendation";
import type { Event, UserProfile } from "@/lib/types";

function makeEvent(overrides: Partial<Event> = {}): Event {
  return {
    ...EVENTS[0],
    id: "event-test",
    ...overrides,
  };
}

function makeUser(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    id: "user-test",
    name: "김영희",
    region: "서울",
    district: "마포구",
    ageGroup: "60대",
    interests: [],
    onboardedAt: "2026-07-01T09:00:00+09:00",
    ...overrides,
  };
}

describe("scoreEventRecommendation", () => {
  it("관심사 50, 같은 동네 30, 참여 이력 20을 합산한다", () => {
    const event = makeEvent({
      clubId: "club-familiar",
      category: "hiking",
      relatedInterests: ["photo", "history"],
      region: "서울특별시",
      district: "마포구",
    });
    const user = makeUser({
      interests: ["등산", "사진", "역사"],
      participationHistory: [
        {
          eventId: "event-before",
          clubId: "club-familiar",
          category: "hiking",
          status: "attended",
        },
      ],
    });

    const result = scoreEventRecommendation(event, user);

    expect(result.score).toBe(100);
    expect(result.breakdown).toEqual({
      interest: 50,
      region: 30,
      history: 20,
    });
    expect(result.reasons).toHaveLength(5);
  });

  it("서울과 서울특별시를 같은 광역 지역으로 보고 20점을 준다", () => {
    const event = makeEvent({
      category: "classical",
      relatedInterests: [],
      region: "서울특별시",
      district: "종로구",
    });
    const user = makeUser({ district: undefined, interests: [] });

    const result = scoreEventRecommendation(event, user);

    expect(result.breakdown.region).toBe(20);
    expect(result.score).toBe(20);
  });

  it("실제 참석하지 않은 승인·취소 이력은 참여 점수에 넣지 않는다", () => {
    const event = makeEvent({
      clubId: "club-familiar",
      category: "hiking",
      region: "부산광역시",
      district: "중구",
      relatedInterests: [],
    });
    const user = makeUser({
      region: "서울특별시",
      interests: [],
      participationHistory: [
        {
          eventId: "event-before",
          clubId: "club-familiar",
          category: "hiking",
          status: "approved",
        },
      ],
    });

    const result = scoreEventRecommendation(event, user);

    expect(result.score).toBe(0);
    expect(result.breakdown.history).toBe(0);
  });
});

describe("recommendEvents", () => {
  it("신청한 모임, 마감된 모임, 정원이 찬 모임을 기본 추천에서 제외한다", () => {
    const available = makeEvent({
      id: "available",
      category: "history",
      relatedInterests: [],
      participantCount: 3,
      currentMembers: 3,
      capacity: 10,
      status: "recruiting",
    });
    const alreadyApplied = makeEvent({
      id: "already-applied",
      participantCount: 3,
      currentMembers: 3,
      capacity: 10,
      status: "recruiting",
    });
    const full = makeEvent({
      id: "full",
      participantCount: 10,
      currentMembers: 10,
      capacity: 10,
      status: "recruiting",
    });
    const closed = makeEvent({ id: "closed", status: "closed" });
    const user = makeUser({
      interests: ["hiking"],
      appliedEventIds: [alreadyApplied.id],
    });

    const results = recommendEvents(
      user,
      [available, alreadyApplied, full, closed],
      { limit: 10 },
    );

    expect(results.map(({ event }) => event.id)).toEqual([available.id]);
  });

  it("점수가 높은 순서로 정렬하고 원본 배열은 변경하지 않는다", () => {
    const low = makeEvent({
      id: "low",
      category: "classical",
      relatedInterests: [],
      region: "부산광역시",
      district: "중구",
      startAt: "2026-07-20T09:00:00+09:00",
    });
    const high = makeEvent({
      id: "high",
      category: "hiking",
      relatedInterests: [],
      region: "서울특별시",
      district: "마포구",
      startAt: "2026-08-01T09:00:00+09:00",
    });
    const events = [low, high];
    const user = makeUser({ interests: ["hiking"] });

    const results = recommendEvents(user, events);

    expect(results.map(({ event }) => event.id)).toEqual(["high", "low"]);
    expect(events.map((event) => event.id)).toEqual(["low", "high"]);
  });
});
