import { ApiError } from '@/api/api-error';
import { createHttpClient } from '@/api/http-client';
import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';
import { getMobileEnvironment } from '@/config/env';

export const POST_PAGE_SIZE = 20;
export const POST_TITLE_MIN_LENGTH = 2;
export const POST_TITLE_MAX_LENGTH = 100;
export const POST_CONTENT_MIN_LENGTH = 10;
export const POST_CONTENT_MAX_LENGTH = 5_000;
export const COMMENT_CONTENT_MIN_LENGTH = 2;
export const COMMENT_CONTENT_MAX_LENGTH = 1_000;

export type CommunityPostType = 'GENERAL' | 'NOTICE' | 'PHOTO';

export interface PostAuthor {
  id: string;
  name: string;
}

export interface CommunityPost {
  id: string;
  clubId: string;
  type: CommunityPostType;
  title: string;
  content: string;
  author: PostAuthor;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface PostClubSummary {
  id: string;
  slug: string;
  title: string;
}

export interface CommunityPostDetail extends CommunityPost {
  club: PostClubSummary & {
    region: string | null;
    interest: {
      id: string;
      slug: string;
      name: string;
      icon: string;
    };
  };
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentId: string | null;
  content: string;
  author: PostAuthor;
  createdAt: string;
  updatedAt: string;
}

export interface CursorPage {
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface PostListPage {
  club: PostClubSummary;
  data: CommunityPost[];
  page: CursorPage;
}

export interface CommentListPage {
  data: CommunityComment[];
  page: CursorPage;
}

export interface CreatePostInput {
  title: string;
  content: string;
}

export interface UpdatePostInput {
  title?: string;
  content?: string;
}

export interface CreateCommentInput {
  content: string;
  parentId?: string;
}

export interface DeletedCommunityContent {
  id: string;
  status: 'HIDDEN';
  updatedAt: string;
}

interface PageRequest {
  cursor?: string;
  signal?: AbortSignal;
}

const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/;
const SAFE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const POST_KEYS = [
  'id',
  'clubId',
  'type',
  'title',
  'content',
  'author',
  'commentCount',
  'createdAt',
  'updatedAt',
] as const;
const POST_DETAIL_KEYS = [...POST_KEYS, 'club'] as const;
const AUTHOR_KEYS = ['id', 'name'] as const;
const CLUB_SUMMARY_KEYS = ['id', 'slug', 'title'] as const;
const CLUB_DETAIL_KEYS = ['id', 'slug', 'title', 'region', 'interest'] as const;
const INTEREST_KEYS = ['id', 'slug', 'name', 'icon'] as const;
const COMMENT_KEYS = [
  'id',
  'postId',
  'parentId',
  'content',
  'author',
  'createdAt',
  'updatedAt',
] as const;
const PAGE_KEYS = ['hasNextPage', 'nextCursor'] as const;
const POST_LIST_KEYS = ['club', 'data', 'page'] as const;
const COMMENT_LIST_KEYS = ['data', 'page'] as const;
const DELETE_KEYS = ['id', 'status', 'updatedAt'] as const;
const POST_TYPES = new Set<CommunityPostType>(['GENERAL', 'NOTICE', 'PHOTO']);

let publicClient: ReturnType<typeof createHttpClient> | null = null;
let publicClientUrl: string | null = null;

function invalidResponse(path: string, reason: string): never {
  throw new ApiError({
    status: 0,
    code: 'INVALID_RESPONSE',
    message: `서버의 게시판 응답이 올바르지 않습니다. (${path}: ${reason})`,
  });
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidResponse(path, '객체가 아닙니다');
  }
  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => !expectedKeys.includes(key));
  if (unknownKey) return invalidResponse(path, `알 수 없는 ${unknownKey} 필드`);
  const missingKey = expectedKeys.find((key) => !Object.hasOwn(record, key));
  if (missingKey) return invalidResponse(path, `${missingKey} 필드 누락`);
  return record;
}

function boundedString(
  value: unknown,
  path: string,
  minimumLength: number,
  maximumLength: number,
) {
  if (
    typeof value !== 'string' ||
    value.length < minimumLength ||
    value.length > maximumLength ||
    value !== value.trim()
  ) {
    return invalidResponse(path, '문자열 형식 오류');
  }
  return value;
}

export function isSafePostId(value: unknown): value is string {
  return typeof value === 'string' && SAFE_ID.test(value);
}

export function isSafePostClubSlug(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 80 && SAFE_SLUG.test(value);
}

export function isSafePostCursor(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 8 &&
    value.length <= 500 &&
    value === value.trim() &&
    !CONTROL_CHARACTER.test(value)
  );
}

function entityId(value: unknown, path: string) {
  return isSafePostId(value) ? value : invalidResponse(path, '식별자 형식 오류');
}

function slug(value: unknown, path: string) {
  return isSafePostClubSlug(value)
    ? value
    : invalidResponse(path, '커뮤니티 주소 형식 오류');
}

function isoDate(value: unknown, path: string) {
  if (
    typeof value !== 'string' ||
    !ISO_DATE_TIME.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    return invalidResponse(path, '날짜 형식 오류');
  }
  return value;
}

function parseAuthor(value: unknown, path: string): PostAuthor {
  const record = strictRecord(value, AUTHOR_KEYS, path);
  return {
    id: entityId(record.id, `${path}.id`),
    name: boundedString(record.name, `${path}.name`, 1, 100),
  };
}

function parseClubSummary(value: unknown, path: string): PostClubSummary {
  const record = strictRecord(value, CLUB_SUMMARY_KEYS, path);
  return {
    id: entityId(record.id, `${path}.id`),
    slug: slug(record.slug, `${path}.slug`),
    title: boundedString(record.title, `${path}.title`, 1, 300),
  };
}

function parseClubDetail(value: unknown, path: string): CommunityPostDetail['club'] {
  const record = strictRecord(value, CLUB_DETAIL_KEYS, path);
  const interest = strictRecord(record.interest, INTEREST_KEYS, `${path}.interest`);
  const region = record.region;
  if (
    !(
      region === null ||
      (typeof region === 'string' &&
        region.length >= 1 &&
        region.length <= 100 &&
        region === region.trim())
    )
  ) {
    return invalidResponse(`${path}.region`, '지역 형식 오류');
  }
  return {
    id: entityId(record.id, `${path}.id`),
    slug: slug(record.slug, `${path}.slug`),
    title: boundedString(record.title, `${path}.title`, 1, 300),
    region,
    interest: {
      id: entityId(interest.id, `${path}.interest.id`),
      slug: slug(interest.slug, `${path}.interest.slug`),
      name: boundedString(interest.name, `${path}.interest.name`, 1, 100),
      icon: boundedString(interest.icon, `${path}.interest.icon`, 1, 100),
    },
  };
}

function parsePostBase(
  record: Record<string, unknown>,
  path: string,
  expectedClubId?: string,
): CommunityPost {
  const clubId = entityId(record.clubId, `${path}.clubId`);
  if (expectedClubId !== undefined && clubId !== expectedClubId) {
    return invalidResponse(`${path}.clubId`, '요청한 커뮤니티와 일치하지 않습니다');
  }
  const type = record.type;
  if (typeof type !== 'string' || !POST_TYPES.has(type as CommunityPostType)) {
    return invalidResponse(`${path}.type`, '게시글 유형 오류');
  }
  const commentCount = record.commentCount;
  if (!Number.isSafeInteger(commentCount) || Number(commentCount) < 0) {
    return invalidResponse(`${path}.commentCount`, '댓글 수 형식 오류');
  }
  return {
    id: entityId(record.id, `${path}.id`),
    clubId,
    type: type as CommunityPostType,
    title: boundedString(
      record.title,
      `${path}.title`,
      POST_TITLE_MIN_LENGTH,
      POST_TITLE_MAX_LENGTH,
    ),
    content: boundedString(
      record.content,
      `${path}.content`,
      POST_CONTENT_MIN_LENGTH,
      POST_CONTENT_MAX_LENGTH,
    ),
    author: parseAuthor(record.author, `${path}.author`),
    commentCount: Number(commentCount),
    createdAt: isoDate(record.createdAt, `${path}.createdAt`),
    updatedAt: isoDate(record.updatedAt, `${path}.updatedAt`),
  };
}

export function parseCommunityPost(
  value: unknown,
  path = 'post',
  expectedClubId?: string,
): CommunityPost {
  return parsePostBase(strictRecord(value, POST_KEYS, path), path, expectedClubId);
}

export function parseCommunityPostDetail(
  value: unknown,
  options: { expectedId?: string; expectedSlug?: string } = {},
): CommunityPostDetail {
  const path = 'post';
  const record = strictRecord(value, POST_DETAIL_KEYS, path);
  const club = parseClubDetail(record.club, `${path}.club`);
  const post = parsePostBase(record, path, club.id);
  if (options.expectedId !== undefined && post.id !== options.expectedId) {
    return invalidResponse(`${path}.id`, '요청한 게시글과 일치하지 않습니다');
  }
  if (options.expectedSlug !== undefined && club.slug !== options.expectedSlug) {
    return invalidResponse(`${path}.club.slug`, '요청한 커뮤니티와 일치하지 않습니다');
  }
  return { ...post, club };
}

export function parseCommunityComment(
  value: unknown,
  options: { path?: string; expectedId?: string; expectedPostId?: string } = {},
): CommunityComment {
  const path = options.path ?? 'comment';
  const record = strictRecord(value, COMMENT_KEYS, path);
  const id = entityId(record.id, `${path}.id`);
  const postId = entityId(record.postId, `${path}.postId`);
  const parentId = record.parentId;
  if (!(parentId === null || isSafePostId(parentId))) {
    return invalidResponse(`${path}.parentId`, '상위 댓글 식별자 오류');
  }
  if (options.expectedId !== undefined && id !== options.expectedId) {
    return invalidResponse(`${path}.id`, '요청한 댓글과 일치하지 않습니다');
  }
  if (options.expectedPostId !== undefined && postId !== options.expectedPostId) {
    return invalidResponse(`${path}.postId`, '요청한 게시글과 일치하지 않습니다');
  }
  return {
    id,
    postId,
    parentId,
    content: boundedString(
      record.content,
      `${path}.content`,
      COMMENT_CONTENT_MIN_LENGTH,
      COMMENT_CONTENT_MAX_LENGTH,
    ),
    author: parseAuthor(record.author, `${path}.author`),
    createdAt: isoDate(record.createdAt, `${path}.createdAt`),
    updatedAt: isoDate(record.updatedAt, `${path}.updatedAt`),
  };
}

function parsePage(value: unknown, path: string): CursorPage {
  const record = strictRecord(value, PAGE_KEYS, path);
  if (typeof record.hasNextPage !== 'boolean') {
    return invalidResponse(`${path}.hasNextPage`, 'boolean 형식 오류');
  }
  const nextCursor = record.nextCursor;
  if (!(nextCursor === null || isSafePostCursor(nextCursor))) {
    return invalidResponse(`${path}.nextCursor`, 'cursor 형식 오류');
  }
  if (record.hasNextPage !== (nextCursor !== null)) {
    return invalidResponse(path, '페이지 상태와 cursor가 일치하지 않습니다');
  }
  return { hasNextPage: record.hasNextPage, nextCursor };
}

export function parsePostListPage(value: unknown, expectedSlug: string): PostListPage {
  const record = strictRecord(value, POST_LIST_KEYS, 'response');
  const club = parseClubSummary(record.club, 'response.club');
  if (club.slug !== expectedSlug) {
    return invalidResponse('response.club.slug', '요청한 커뮤니티와 일치하지 않습니다');
  }
  if (!Array.isArray(record.data) || record.data.length > POST_PAGE_SIZE) {
    return invalidResponse('response.data', '목록 형식 또는 길이 오류');
  }
  const page = parsePage(record.page, 'response.page');
  if (page.hasNextPage && record.data.length !== POST_PAGE_SIZE) {
    return invalidResponse('response.data', '다음 페이지가 있는 목록의 길이 오류');
  }
  return {
    club,
    data: record.data.map((post, index) =>
      parseCommunityPost(post, `response.data[${index}]`, club.id),
    ),
    page,
  };
}

export function parseCommentListPage(value: unknown, expectedPostId: string): CommentListPage {
  const record = strictRecord(value, COMMENT_LIST_KEYS, 'response');
  if (!Array.isArray(record.data) || record.data.length > POST_PAGE_SIZE) {
    return invalidResponse('response.data', '댓글 목록 형식 또는 길이 오류');
  }
  const page = parsePage(record.page, 'response.page');
  if (page.hasNextPage && record.data.length !== POST_PAGE_SIZE) {
    return invalidResponse('response.data', '다음 페이지가 있는 댓글 목록의 길이 오류');
  }
  return {
    data: record.data.map((comment, index) =>
      parseCommunityComment(comment, {
        path: `response.data[${index}]`,
        expectedPostId,
      }),
    ),
    page,
  };
}

function parseDeletedContent(value: unknown, expectedId: string): DeletedCommunityContent {
  const record = strictRecord(value, DELETE_KEYS, 'response');
  if (record.id !== expectedId || record.status !== 'HIDDEN') {
    return invalidResponse('response', '삭제 결과가 요청과 일치하지 않습니다');
  }
  return {
    id: expectedId,
    status: 'HIDDEN',
    updatedAt: isoDate(record.updatedAt, 'response.updatedAt'),
  };
}

function normalizeTitle(value: string) {
  const title = value.trim().replace(/\s+/g, ' ');
  if (title.length < POST_TITLE_MIN_LENGTH || title.length > POST_TITLE_MAX_LENGTH) {
    throw new TypeError('게시글 제목은 2자 이상 100자 이하로 입력해 주세요.');
  }
  return title;
}

function normalizePostContent(value: string) {
  const content = value.trim();
  if (content.length < POST_CONTENT_MIN_LENGTH || content.length > POST_CONTENT_MAX_LENGTH) {
    throw new TypeError('게시글 본문은 10자 이상 5000자 이하로 입력해 주세요.');
  }
  return content;
}

function normalizeCommentContent(value: string) {
  const content = value.trim();
  if (
    content.length < COMMENT_CONTENT_MIN_LENGTH ||
    content.length > COMMENT_CONTENT_MAX_LENGTH
  ) {
    throw new TypeError('댓글은 2자 이상 1000자 이하로 입력해 주세요.');
  }
  return content;
}

function encodedId(value: string, label: string) {
  if (!isSafePostId(value)) throw new TypeError(`${label} 식별자가 올바르지 않습니다.`);
  return encodeURIComponent(value);
}

function encodedSlug(value: string) {
  if (!isSafePostClubSlug(value)) throw new TypeError('커뮤니티 주소가 올바르지 않습니다.');
  return encodeURIComponent(value);
}

function pageQuery(cursor?: string) {
  if (cursor !== undefined && !isSafePostCursor(cursor)) {
    throw new TypeError('게시판 목록 위치가 올바르지 않습니다.');
  }
  const parameters = new URLSearchParams({ limit: String(POST_PAGE_SIZE) });
  if (cursor) parameters.set('cursor', cursor);
  return parameters.toString();
}

function getPublicClient() {
  const { apiUrl } = getMobileEnvironment();
  if (!publicClient || publicClientUrl !== apiUrl) {
    publicClientUrl = apiUrl;
    publicClient = createHttpClient({ baseUrl: apiUrl });
  }
  return publicClient;
}

export function mergePosts(
  current: readonly CommunityPost[],
  incoming: readonly CommunityPost[],
) {
  const order: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, CommunityPost>();
  for (const post of [...current, ...incoming]) {
    if (!seen.has(post.id)) {
      seen.add(post.id);
      order.push(post.id);
    }
    byId.set(post.id, post);
  }
  return order.map((id) => byId.get(id) as CommunityPost);
}

export function mergeComments(
  current: readonly CommunityComment[],
  incoming: readonly CommunityComment[],
) {
  const order: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, CommunityComment>();
  for (const comment of [...current, ...incoming]) {
    if (!seen.has(comment.id)) {
      seen.add(comment.id);
      order.push(comment.id);
    }
    byId.set(comment.id, comment);
  }
  return order
    .map((id) => byId.get(id) as CommunityComment)
    .sort(
      (left, right) =>
        Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

export function isAmbiguousCreateFailure(error: unknown) {
  return (
    error instanceof ApiError &&
    (error.status === 0 || error.status === 408 || error.status === 429 || error.status >= 500)
  );
}

export const postsApi = {
  async list(slugValue: string, request: PageRequest = {}): Promise<PostListPage> {
    const safeSlug = encodedSlug(slugValue);
    const response = await getPublicClient().requestJson<unknown>(
      `/v1/clubs/${safeSlug}/posts?${pageQuery(request.cursor)}`,
      { auth: 'none', signal: request.signal },
    );
    return parsePostListPage(response.body, slugValue);
  },

  async detail(slugValue: string, postId: string, signal?: AbortSignal) {
    encodedSlug(slugValue);
    const safePostId = encodedId(postId, '게시글');
    const response = await getPublicClient().requestJson<unknown>(`/v1/posts/${safePostId}`, {
      auth: 'none',
      signal,
    });
    return parseCommunityPostDetail(response.body, {
      expectedId: postId,
      expectedSlug: slugValue,
    });
  },

  async comments(postId: string, request: PageRequest = {}): Promise<CommentListPage> {
    const safePostId = encodedId(postId, '게시글');
    const response = await getPublicClient().requestJson<unknown>(
      `/v1/posts/${safePostId}/comments?${pageQuery(request.cursor)}`,
      { auth: 'none', signal: request.signal },
    );
    return parseCommentListPage(response.body, postId);
  },

  async createPost(slugValue: string, input: CreatePostInput, signal?: AbortSignal) {
    const safeSlug = encodedSlug(slugValue);
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/clubs/${safeSlug}/posts`,
      {
        method: 'POST',
        auth: 'required',
        json: { title: normalizeTitle(input.title), content: normalizePostContent(input.content) },
        signal,
      },
    );
    return parseCommunityPostDetail(response.body, { expectedSlug: slugValue });
  },

  async updatePost(
    slugValue: string,
    postId: string,
    input: UpdatePostInput,
    signal?: AbortSignal,
  ) {
    encodedSlug(slugValue);
    const safePostId = encodedId(postId, '게시글');
    if (input.title === undefined && input.content === undefined) {
      throw new TypeError('수정할 제목 또는 본문을 입력해 주세요.');
    }
    const json = {
      ...(input.title === undefined ? {} : { title: normalizeTitle(input.title) }),
      ...(input.content === undefined ? {} : { content: normalizePostContent(input.content) }),
    };
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/posts/${safePostId}`,
      { method: 'PATCH', auth: 'required', json, signal },
    );
    return parseCommunityPostDetail(response.body, {
      expectedId: postId,
      expectedSlug: slugValue,
    });
  },

  async deletePost(postId: string, signal?: AbortSignal) {
    const safePostId = encodedId(postId, '게시글');
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/posts/${safePostId}`,
      { method: 'DELETE', auth: 'required', signal },
    );
    return parseDeletedContent(response.body, postId);
  },

  async createComment(postId: string, input: CreateCommentInput, signal?: AbortSignal) {
    const safePostId = encodedId(postId, '게시글');
    if (input.parentId !== undefined) encodedId(input.parentId, '상위 댓글');
    const json = {
      content: normalizeCommentContent(input.content),
      ...(input.parentId === undefined ? {} : { parentId: input.parentId }),
    };
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/posts/${safePostId}/comments`,
      { method: 'POST', auth: 'required', json, signal },
    );
    return parseCommunityComment(response.body, { expectedPostId: postId });
  },

  async updateComment(
    postId: string,
    commentId: string,
    content: string,
    signal?: AbortSignal,
  ) {
    encodedId(postId, '게시글');
    const safeCommentId = encodedId(commentId, '댓글');
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/comments/${safeCommentId}`,
      {
        method: 'PATCH',
        auth: 'required',
        json: { content: normalizeCommentContent(content) },
        signal,
      },
    );
    return parseCommunityComment(response.body, {
      expectedId: commentId,
      expectedPostId: postId,
    });
  },

  async deleteComment(commentId: string, signal?: AbortSignal) {
    const safeCommentId = encodedId(commentId, '댓글');
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/comments/${safeCommentId}`,
      { method: 'DELETE', auth: 'required', signal },
    );
    return parseDeletedContent(response.body, commentId);
  },
};
