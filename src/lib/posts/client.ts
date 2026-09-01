import { z } from "zod";

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
const authorSchema = z.object({ id: identifierSchema, name: z.string().min(1) });
const createdPostSchema = z.object({
  id: identifierSchema,
  clubId: identifierSchema,
  title: z.string().min(2).max(100),
  content: z.string().min(10).max(5_000),
  author: authorSchema,
  club: z.object({ id: identifierSchema, slug: slugSchema, title: z.string().min(1) }),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
const createdCommentSchema = z.object({
  id: identifierSchema,
  postId: identifierSchema,
  parentId: identifierSchema.nullable(),
  content: z.string().min(2).max(1_000),
  author: authorSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export class CommunityPostRequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "CommunityPostRequestError";
  }
}

type RequestOptions = { fetchImplementation?: typeof fetch; signal?: AbortSignal };

function parseError(value: unknown) {
  const parsed = z
    .object({ error: z.object({ code: z.string().optional(), message: z.string().optional() }) })
    .safeParse(value);
  return parsed.success ? parsed.data.error : {};
}

async function mutate(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body: unknown,
  options: RequestOptions,
) {
  const fetchImplementation = options.fetchImplementation ?? fetch;
  const timeoutSignal = AbortSignal.timeout(12_000);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeoutSignal])
    : timeoutSignal;
  let response: Response;
  try {
    response = await fetchImplementation(path, {
      method,
      cache: "no-store",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (timeoutSignal.aborted && !options.signal?.aborted) {
      throw new CommunityPostRequestError(
        408,
        "서버 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.",
        "REQUEST_TIMEOUT",
      );
    }
    throw error;
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new CommunityPostRequestError(
      response.status,
      "서버 응답을 확인하지 못했습니다.",
    );
  }
  if (!response.ok) {
    const error = parseError(payload);
    throw new CommunityPostRequestError(
      response.status,
      error.message ?? "요청을 처리하지 못했습니다.",
      error.code,
    );
  }
  return payload;
}

export async function createCommunityPost(
  slug: string,
  input: { title: string; content: string },
  options: RequestOptions = {},
) {
  const safeSlug = slugSchema.parse(slug);
  const safeInput = z
    .object({
      title: z.string().trim().min(2).max(100),
      content: z.string().trim().min(10).max(5_000),
    })
    .strict()
    .parse(input);
  const payload = await mutate(
    `/api/clubs/${encodeURIComponent(safeSlug)}/posts`,
    "POST",
    safeInput,
    options,
  );
  const post = createdPostSchema.parse(payload);
  if (post.club.slug !== safeSlug) throw new Error("등록된 게시글의 커뮤니티를 확인하지 못했습니다.");
  return post;
}

export async function createCommunityComment(
  postId: string,
  input: { content: string; parentId?: string },
  options: RequestOptions = {},
) {
  const safePostId = identifierSchema.parse(postId);
  const safeInput = z
    .object({
      content: z.string().trim().min(2).max(1_000),
      parentId: identifierSchema.optional(),
    })
    .strict()
    .parse(input);
  const payload = await mutate(
    `/api/posts/${encodeURIComponent(safePostId)}/comments`,
    "POST",
    safeInput,
    options,
  );
  const comment = createdCommentSchema.parse(payload);
  if (comment.postId !== safePostId) throw new Error("등록된 댓글의 게시글을 확인하지 못했습니다.");
  return comment;
}
