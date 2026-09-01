import "server-only";

import { z } from "zod";

import { ApiHttpError, createJsonApiClient } from "@/lib/api";

export const PUBLIC_POST_REVALIDATE_SECONDS = 120;

const safeIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const safeSlugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const safeCursorSchema = z
  .string()
  .min(8)
  .max(500)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value),
  );

const authorSchema = z.object({
  id: safeIdentifierSchema,
  name: z.string().trim().min(1).max(100),
});

const postListItemSchema = z.object({
  id: safeIdentifierSchema,
  clubId: safeIdentifierSchema,
  type: z.enum(["GENERAL", "NOTICE", "PHOTO"]),
  title: z.string().trim().min(2).max(100),
  content: z.string().trim().min(10).max(5_000),
  author: authorSchema,
  commentCount: z.number().int().nonnegative(),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const clubSummarySchema = z.object({
  id: safeIdentifierSchema,
  slug: safeSlugSchema,
  title: z.string().trim().min(1).max(300),
});

const postDetailSchema = postListItemSchema.extend({
  club: clubSummarySchema.extend({
    region: z.string().trim().min(1).max(100).nullable(),
    interest: z.object({
      id: safeIdentifierSchema,
      slug: safeSlugSchema,
      name: z.string().trim().min(1).max(100),
      icon: z.string().trim().min(1).max(100),
    }),
  }),
});

const commentSchema = z.object({
  id: safeIdentifierSchema,
  postId: safeIdentifierSchema,
  parentId: safeIdentifierSchema.nullable(),
  content: z.string().trim().min(2).max(1_000),
  author: authorSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

const pageSchema = z
  .object({
    nextCursor: safeCursorSchema.nullable(),
    hasNextPage: z.boolean(),
  })
  .superRefine((page, context) => {
    if (page.hasNextPage !== Boolean(page.nextCursor)) {
      context.addIssue({
        code: "custom",
        message: "페이지 정보가 서로 일치하지 않습니다.",
      });
    }
  });

const postCatalogSchema = z.object({
  club: clubSummarySchema,
  data: z.array(postListItemSchema),
  page: pageSchema,
});

const commentCatalogSchema = z.object({
  data: z.array(commentSchema),
  page: pageSchema,
});

const feedOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(20).default(20),
    cursor: safeCursorSchema.optional(),
  })
  .strict();

type ApiPostListItem = z.infer<typeof postListItemSchema>;
type ApiPostDetail = z.infer<typeof postDetailSchema>;
type ApiComment = z.infer<typeof commentSchema>;

export type PublicPost = ApiPostListItem & {
  dateLabel: string;
};

export type PublicPostDetail = Omit<ApiPostDetail, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
  dateLabel: string;
};

export type PublicComment = ApiComment & {
  dateLabel: string;
};

export type PublicFeedOptions = { limit?: number; cursor?: string };

export type PublicPostCatalog = {
  club: z.infer<typeof clubSummarySchema>;
  posts: PublicPost[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export type PublicCommentCatalog = {
  comments: PublicComment[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(value));
}

function mapPost(post: ApiPostListItem): PublicPost {
  return { ...post, dateLabel: formatDateTime(post.createdAt) };
}

function mapPostDetail(post: ApiPostDetail): PublicPostDetail {
  return { ...post, dateLabel: formatDateTime(post.createdAt) };
}

function mapComment(comment: ApiComment): PublicComment {
  return { ...comment, dateLabel: formatDateTime(comment.createdAt) };
}

export function isSafePublicPostCursor(value: unknown): value is string {
  return safeCursorSchema.safeParse(value).success;
}

export function isSafePublicPostId(value: unknown): value is string {
  return safeIdentifierSchema.safeParse(value).success;
}

export async function getPublicClubPosts(
  slug: string,
  options: PublicFeedOptions = {},
): Promise<PublicPostCatalog> {
  if (!safeSlugSchema.safeParse(slug).success) {
    throw new ApiHttpError(400, "커뮤니티 주소가 올바르지 않습니다.", "INVALID_CLUB_SLUG");
  }
  const query = feedOptionsSchema.parse(options);
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) parameters.set("cursor", query.cursor);
  const payload = await createJsonApiClient().get<unknown>(
    `/v1/clubs/${encodeURIComponent(slug)}/posts?${parameters.toString()}`,
    {
      cache: "force-cache",
      next: {
        revalidate: PUBLIC_POST_REVALIDATE_SECONDS,
        tags: ["club-posts"],
      },
    },
  );
  const parsed = postCatalogSchema.parse(payload);
  if (
    parsed.club.slug !== slug ||
    parsed.data.some((post) => post.clubId !== parsed.club.id)
  ) {
    throw new Error("게시글 목록의 커뮤니티 정보를 확인하지 못했습니다.");
  }
  return {
    club: parsed.club,
    posts: parsed.data.map(mapPost),
    nextCursor: parsed.page.nextCursor,
    hasNextPage: parsed.page.hasNextPage,
  };
}

export async function getPublicPost(id: string): Promise<PublicPostDetail | null> {
  if (!isSafePublicPostId(id)) return null;
  try {
    const payload = await createJsonApiClient().get<unknown>(
      `/v1/posts/${encodeURIComponent(id)}`,
      {
        cache: "force-cache",
        next: {
          revalidate: PUBLIC_POST_REVALIDATE_SECONDS,
          tags: ["club-posts"],
        },
      },
    );
    const post = postDetailSchema.parse(payload);
    if (post.id !== id) {
      throw new Error("게시글 응답의 식별자를 확인하지 못했습니다.");
    }
    return mapPostDetail(post);
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return null;
    throw error;
  }
}

export async function getPublicPostComments(
  postId: string,
  options: PublicFeedOptions = {},
): Promise<PublicCommentCatalog> {
  if (!isSafePublicPostId(postId)) {
    throw new ApiHttpError(400, "게시글 식별자가 올바르지 않습니다.", "INVALID_POST_ID");
  }
  const query = feedOptionsSchema.parse(options);
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) parameters.set("cursor", query.cursor);
  const payload = await createJsonApiClient().get<unknown>(
    `/v1/posts/${encodeURIComponent(postId)}/comments?${parameters.toString()}`,
    {
      cache: "force-cache",
      next: {
        revalidate: PUBLIC_POST_REVALIDATE_SECONDS,
        tags: ["post-comments"],
      },
    },
  );
  const parsed = commentCatalogSchema.parse(payload);
  if (parsed.data.some((comment) => comment.postId !== postId)) {
    throw new Error("댓글의 게시글 정보를 확인하지 못했습니다.");
  }
  return {
    comments: parsed.data.map(mapComment),
    nextCursor: parsed.page.nextCursor,
    hasNextPage: parsed.page.hasNextPage,
  };
}
