import "server-only";

import { revalidateTag } from "next/cache";
import { z } from "zod";

import { ApiHttpError } from "@/lib/api";

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const titleSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(z.string().min(2).max(100));
const contentSchema = z.string().trim().min(10).max(5_000);
const commentSchema = z.string().trim().min(2).max(1_000);

const createPostRequestSchema = z
  .object({ title: titleSchema, content: contentSchema })
  .strict();
const updatePostRequestSchema = z
  .object({ title: titleSchema.optional(), content: contentSchema.optional() })
  .strict()
  .refine((value) => value.title !== undefined || value.content !== undefined);
const createCommentRequestSchema = z
  .object({ content: commentSchema, parentId: identifierSchema.optional() })
  .strict();
const updateCommentRequestSchema = z.object({ content: commentSchema }).strict();

export type CommunityPostCacheTag = "club-posts" | "post-comments";

export function expireCommunityPostCaches(
  ...tags: CommunityPostCacheTag[]
) {
  for (const tag of tags) {
    try {
      revalidateTag(tag, { expire: 0 });
    } catch (error) {
      // The upstream mutation has already committed. Cache maintenance must
      // never turn that success into a retryable 5xx (and duplicate a create).
      console.error(`Failed to expire community cache tag: ${tag}`, error);
    }
  }
}

async function parseJson(request: Request) {
  try {
    return await request.json();
  } catch {
    throw new ApiHttpError(400, "요청 형식이 올바르지 않습니다.", "INVALID_JSON");
  }
}

async function parseWith<T>(
  request: Request,
  schema: z.ZodType<T>,
  code: string,
  message: string,
) {
  const parsed = schema.safeParse(await parseJson(request));
  if (!parsed.success) throw new ApiHttpError(400, message, code);
  return parsed.data;
}

export function parsePostId(value: unknown) {
  const parsed = identifierSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseClubSlug(value: unknown) {
  const parsed = slugSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseCreatePostRequest(request: Request) {
  return parseWith(
    request,
    createPostRequestSchema,
    "INVALID_POST",
    "제목 2~100자와 본문 10~5000자를 확인해 주세요.",
  );
}

export function parseUpdatePostRequest(request: Request) {
  return parseWith(
    request,
    updatePostRequestSchema,
    "INVALID_POST",
    "수정할 제목 또는 본문을 확인해 주세요.",
  );
}

export function parseCreateCommentRequest(request: Request) {
  return parseWith(
    request,
    createCommentRequestSchema,
    "INVALID_COMMENT",
    "댓글은 2~1000자로 입력해 주세요.",
  );
}

export function parseUpdateCommentRequest(request: Request) {
  return parseWith(
    request,
    updateCommentRequestSchema,
    "INVALID_COMMENT",
    "댓글은 2~1000자로 입력해 주세요.",
  );
}
