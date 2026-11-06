import { describe, expect, it } from "vitest";
import {
  SENIOR_HIKING_COURSES,
  SENIOR_HOBBY_RECOMMENDATIONS,
} from "./senior-recommendations";

describe("senior recommendations", () => {
  it("includes well-structured, senior-friendly hiking courses", () => {
    expect(SENIOR_HIKING_COURSES.length).toBeGreaterThanOrEqual(4);
    for (const course of SENIOR_HIKING_COURSES) {
      expect(course.title).toBeTruthy();
      expect(course.location).toBeTruthy();
      expect(course.features.length).toBeGreaterThan(0);
      expect(course.duration).toBeTruthy();
      expect(course.sourceUrl).toMatch(/^https:\/\//);
      expect(course).not.toHaveProperty("recommendedEventId");
      expect(["쉬움", "보통"]).toContain(course.difficulty);
    }
  });

  it("includes engaging senior hobby recommendations with actionable target URLs", () => {
    expect(SENIOR_HOBBY_RECOMMENDATIONS.length).toBeGreaterThanOrEqual(5);
    for (const hobby of SENIOR_HOBBY_RECOMMENDATIONS) {
      expect(hobby.name).toBeTruthy();
      expect(hobby.emoji).toBeTruthy();
      expect(hobby.benefits.length).toBeGreaterThan(0);
      expect(new URL(hobby.targetUrl, "https://local.test").searchParams.get("category")).toBe(hobby.interestId);
    }
  });
});
