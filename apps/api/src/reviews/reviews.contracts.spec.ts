import { describe, expect, it } from "vitest";

import {
  createReviewSchema,
  eventReviewsParamsSchema,
  reviewListQuerySchema,
  reviewParamsSchema,
  updateReviewSchema,
} from "./reviews.contracts";

describe("review request contracts", () => {
  it("uses a bounded public page size and rejects unknown query fields", () => {
    expect(reviewListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(reviewListQuerySchema.parse({ limit: "1" })).toEqual({ limit: 1 });
    expect(() => reviewListQuerySchema.parse({ limit: 21 })).toThrow();
    expect(() => reviewListQuerySchema.parse({ page: 2 })).toThrow();
  });

  it("validates route identifiers without accepting extra parameters", () => {
    expect(eventReviewsParamsSchema.parse({ eventId: "event-1" })).toEqual({
      eventId: "event-1",
    });
    expect(reviewParamsSchema.parse({ id: "review-1" })).toEqual({
      id: "review-1",
    });
    expect(() =>
      eventReviewsParamsSchema.parse({ eventId: "event-1", leaked: "value" }),
    ).toThrow();
  });

  it("accepts only integer ratings from 1 to 5 and trimmed 10–800 character text", () => {
    expect(
      createReviewSchema.parse({
        rating: 5,
        content: "  함께 걸어서 정말 즐거웠습니다.  ",
      }),
    ).toEqual({ rating: 5, content: "함께 걸어서 정말 즐거웠습니다." });

    for (const rating of [0, 1.5, 6, "5"]) {
      expect(() =>
        createReviewSchema.parse({
          rating,
          content: "열 글자가 넘는 올바른 후기입니다.",
        }),
      ).toThrow();
    }
    expect(() =>
      createReviewSchema.parse({ rating: 5, content: "너무 짧아요" }),
    ).toThrow();
    expect(() =>
      createReviewSchema.parse({
        rating: 5,
        content: "열 글자가 넘는 올바른 후기입니다.",
        attachmentIds: ["upload-1"],
      }),
    ).toThrow();
  });

  it("requires at least one supported field when updating", () => {
    expect(updateReviewSchema.parse({ rating: 4 })).toEqual({ rating: 4 });
    expect(
      updateReviewSchema.parse({ content: "수정한 후기 내용도 열 글자 이상입니다." }),
    ).toEqual({ content: "수정한 후기 내용도 열 글자 이상입니다." });
    expect(() => updateReviewSchema.parse({})).toThrow();
    expect(() => updateReviewSchema.parse({ photos: [] })).toThrow();
  });
});
