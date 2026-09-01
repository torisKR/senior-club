import { z } from "zod";

const entityIdSchema = z
  .string()
  .trim()
  .min(1, "식별자가 필요합니다.")
  .max(128, "식별자가 너무 깁니다.")
  .regex(/^[A-Za-z0-9._:-]+$/, "식별자가 올바르지 않습니다.");

const slugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "커뮤니티 주소가 올바르지 않습니다.");

const cursorSchema = z.string().min(8).max(500);

const titleSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "))
  .pipe(z.string().min(2, "제목은 2자 이상이어야 합니다.").max(100));

const postContentSchema = z
  .string()
  .trim()
  .min(10, "본문은 10자 이상이어야 합니다.")
  .max(5_000, "본문은 5000자 이하여야 합니다.");

const commentContentSchema = z
  .string()
  .trim()
  .min(2, "댓글은 2자 이상이어야 합니다.")
  .max(1_000, "댓글은 1000자 이하여야 합니다.");

export const clubPostsParamsSchema = z.object({ slug: slugSchema }).strict();
export const postParamsSchema = z.object({ id: entityIdSchema }).strict();
export const commentParamsSchema = z.object({ id: entityIdSchema }).strict();

export const postFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).default(20),
    cursor: cursorSchema.optional(),
  })
  .strict();

export const commentFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(20).default(20),
    cursor: cursorSchema.optional(),
  })
  .strict();

export const createPostSchema = z
  .object({ title: titleSchema, content: postContentSchema })
  .strict();

export const updatePostSchema = z
  .object({
    title: titleSchema.optional(),
    content: postContentSchema.optional(),
  })
  .strict()
  .refine((value) => value.title !== undefined || value.content !== undefined, {
    message: "수정할 제목 또는 본문을 입력해 주세요.",
  });

export const createCommentSchema = z
  .object({
    content: commentContentSchema,
    parentId: entityIdSchema.optional(),
  })
  .strict();

export const updateCommentSchema = z
  .object({ content: commentContentSchema })
  .strict();

export type ClubPostsParams = z.infer<typeof clubPostsParamsSchema>;
export type PostParams = z.infer<typeof postParamsSchema>;
export type CommentParams = z.infer<typeof commentParamsSchema>;
export type PostFeedQuery = z.infer<typeof postFeedQuerySchema>;
export type CommentFeedQuery = z.infer<typeof commentFeedQuerySchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateCommentInput = z.infer<typeof createCommentSchema>;
export type UpdateCommentInput = z.infer<typeof updateCommentSchema>;
