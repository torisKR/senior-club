import "server-only";

import { z } from "zod";

import { ApiHttpError } from "@/lib/api";

const REVIEW_EVENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

const reviewInputSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    content: z.string().trim().min(10).max(800),
  })
  .strict();

export type ReviewInput = z.infer<typeof reviewInputSchema>;

export function parseReviewEventId(value: unknown): string | null {
  return typeof value === "string" && REVIEW_EVENT_ID_PATTERN.test(value)
    ? value
    : null;
}

export async function parseReviewRequest(request: Request): Promise<ReviewInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiHttpError(
      400,
      "후기 요청 형식이 올바르지 않습니다.",
      "INVALID_JSON",
    );
  }

  const parsed = reviewInputSchema.safeParse(body);
  if (!parsed.success) {
    throw new ApiHttpError(
      400,
      "별점과 10~800자의 후기 내용을 확인해 주세요.",
      "INVALID_REVIEW",
    );
  }
  return parsed.data;
}
