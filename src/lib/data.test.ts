import { describe, expect, it } from "vitest";

import { CLUBS, CURRENT_USER, EVENTS, INTERESTS } from "@/lib/data";

describe("mock data integrity", () => {
  it("관심사, 클럽, 모임 식별자는 중복되지 않는다", () => {
    for (const records of [INTERESTS, CLUBS, EVENTS]) {
      const ids = records.map(({ id }) => id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it("모든 모임은 존재하는 클럽과 관심사를 참조한다", () => {
    const clubIds = new Set(CLUBS.map(({ id }) => id));
    const interestIds = new Set<string>(INTERESTS.map(({ id }) => id));

    for (const event of EVENTS) {
      expect(clubIds.has(event.clubId)).toBe(true);
      expect(interestIds.has(event.category)).toBe(true);
      expect(event.participantCount).toBeLessThanOrEqual(event.capacity);
      expect(event.currentMembers).toBe(event.participantCount);
    }
  });

  it("현재 사용자의 관심사는 제공된 관심사 목록에 있다", () => {
    const interestIds = new Set<string>(INTERESTS.map(({ id }) => id));

    for (const interest of CURRENT_USER.interests) {
      expect(interestIds.has(interest)).toBe(true);
    }
  });
});
