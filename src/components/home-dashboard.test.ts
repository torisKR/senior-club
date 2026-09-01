import { describe, expect, it } from "vitest";

import {
  getHomeEventPreviews,
  getHomeThemeCards,
  parseHomeProfile,
} from "@/components/home-dashboard";
import { EVENTS } from "@/lib/data";
import { getHomeFeaturedEvents } from "@/lib/home-featured-events";

describe("home dashboard canonical data", () => {
  it("추천 카드의 핵심 정보는 정본 모임 데이터에서 파생한다", () => {
    const featuredEvents = getHomeFeaturedEvents(
      EVENTS,
      new Date("2026-07-15T00:00:00+09:00"),
    );
    for (const preview of getHomeEventPreviews(featuredEvents)) {
      const event = EVENTS.find((candidate) => candidate.id === preview.id);

      expect(event).toBeDefined();
      expect(preview.title).toBe(event?.title);
      expect(preview.location).toBe(event?.location);
      expect(preview.seats).toBe(
        (event?.capacity ?? 0) - (event?.participantCount ?? 0),
      );
    }
  });

  it("테마 카드는 실제 공개 클럽 DTO의 이름과 slug만 사용한다", () => {
    const themes = getHomeThemeCards([
      {
        slug: "actual-photo-club",
        title: "오늘을 담는 사진산책",
        interest: { id: "interest-photo", slug: "photo", name: "사진", icon: "camera" },
      },
    ]);

    expect(themes).toEqual([
      expect.objectContaining({
        slug: "actual-photo-club",
        label: "오늘을 담는 사진산책",
        interestName: "사진",
      }),
    ]);
    expect(themes[0]).not.toHaveProperty("count");
  });
});

describe("home dashboard profile parsing", () => {
  it("온보딩 프로필의 개인화 필드를 읽는다", () => {
    expect(
      parseHomeProfile(
        JSON.stringify({
          name: "정희",
          region: "서울",
          ageGroup: "60대",
          interests: ["hiking", "photo", "history"],
        }),
      ),
    ).toEqual({
      name: "정희",
      region: "서울",
      ageGroup: "60대",
      interests: ["hiking", "photo", "history"],
    });
  });

  it("깨졌거나 불완전한 프로필은 개인화에 사용하지 않는다", () => {
    expect(parseHomeProfile("not-json")).toBeNull();
    expect(parseHomeProfile(JSON.stringify({ name: "정희" }))).toBeNull();
  });

  it("알 수 없는 관심사와 빈 이름은 화면에 그대로 노출하지 않는다", () => {
    expect(
      parseHomeProfile(
        JSON.stringify({
          name: "   ",
          region: "부산",
          ageGroup: "70대",
          interests: ["reading", "not-a-real-interest", "food"],
        }),
      ),
    ).toEqual({
      name: "클럽 멤버",
      region: "부산",
      ageGroup: "70대",
      interests: ["reading", "food"],
    });
  });
});
