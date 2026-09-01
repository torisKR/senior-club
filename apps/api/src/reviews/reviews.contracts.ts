import { z } from "zod";

import type { AttendanceStatus } from "../generated/prisma/client";

const entityIdSchema = z
  .string()
  .trim()
  .min(1, "식별자가 필요합니다.")
  .max(128, "식별자가 너무 깁니다.");

const ratingSchema = z
  .number()
  .int("별점은 정수여야 합니다.")
  .min(1, "별점은 1점 이상이어야 합니다.")
  .max(5, "별점은 5점 이하여야 합니다.");

const contentSchema = z
  .string()
  .trim()
  .min(10, "후기는 10자 이상이어야 합니다.")
  .max(800, "후기는 800자 이하여야 합니다.");

export const eventReviewsParamsSchema = z
  .object({ eventId: entityIdSchema })
  .strict();

export const reviewParamsSchema = z
  .object({ id: entityIdSchema })
  .strict();

export const reviewListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).default(20),
    cursor: z.string().min(8).max(500).optional(),
  })
  .strict();

export const createReviewSchema = z
  .object({
    rating: ratingSchema,
    content: contentSchema,
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: ratingSchema.optional(),
    content: contentSchema.optional(),
  })
  .strict()
  .refine((value) => value.rating !== undefined || value.content !== undefined, {
    message: "수정할 별점 또는 후기 내용을 입력해 주세요.",
  });

export type EventReviewsParams = z.infer<typeof eventReviewsParamsSchema>;
export type ReviewParams = z.infer<typeof reviewParamsSchema>;
export type ReviewListQuery = z.infer<typeof reviewListQuerySchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export type PublicReviewDto = {
  id: string;
  eventId: string;
  rating: number;
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
};

export type ReviewEligibilityCode =
  | "CAN_CREATE"
  | "REVIEW_NOT_OPEN"
  | "REVIEW_NOT_ALLOWED"
  | "REVIEW_ALREADY_EXISTS"
  | "REVIEW_DELETED";

export type MyReviewStateDto = {
  review: PublicReviewDto | null;
  eligibility: {
    approved: boolean;
    attendance: AttendanceStatus | null;
    reviewsOpenAt: string;
    canCreate: boolean;
    code: ReviewEligibilityCode;
  };
};
