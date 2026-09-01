import { ApiError } from '@/api/api-error';
import { createHttpClient } from '@/api/http-client';
import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';
import { getMobileEnvironment } from '@/config/env';
import type { Review } from '@/types';

export const REVIEW_PAGE_SIZE = 20;
export const REVIEW_CONTENT_MIN_LENGTH = 10;
export const REVIEW_CONTENT_MAX_LENGTH = 800;

export interface ApiReview {
  id: string;
  eventId: string;
  rating: Review['rating'];
  content: string;
  author: { id: string; name: string };
  createdAt: string;
  updatedAt: string;
}

export interface ReviewListPage {
  data: Review[];
  aggregate: { averageRating: number | null; count: number };
  page: { nextCursor: string | null; hasNextPage: boolean };
}

export interface ReviewInput {
  rating: Review['rating'];
  content: string;
}

export interface ReviewUpdateInput {
  rating?: Review['rating'];
  content?: string;
}

export interface DeletedReview {
  id: string;
  status: 'HIDDEN';
  updatedAt: string;
}

export type ReviewEligibilityCode =
  | 'CAN_CREATE'
  | 'REVIEW_NOT_OPEN'
  | 'REVIEW_NOT_ALLOWED'
  | 'REVIEW_ALREADY_EXISTS'
  | 'REVIEW_DELETED';

export interface MyReviewState {
  review: Review | null;
  eligibility: {
    approved: boolean;
    attendance: 'NOT_CHECKED' | 'ATTENDED' | 'NO_SHOW' | null;
    reviewsOpenAt: string;
    canCreate: boolean;
    code: ReviewEligibilityCode;
  };
}

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SAFE_CURSOR = /^[A-Za-z0-9_-]{8,500}$/;
const ELIGIBILITY_CODES = new Set<ReviewEligibilityCode>([
  'CAN_CREATE',
  'REVIEW_NOT_OPEN',
  'REVIEW_NOT_ALLOWED',
  'REVIEW_ALREADY_EXISTS',
  'REVIEW_DELETED',
]);

let publicClient: ReturnType<typeof createHttpClient> | null = null;
let publicClientUrl: string | null = null;

function getPublicClient() {
  const { apiUrl } = getMobileEnvironment();
  if (!publicClient || publicClientUrl !== apiUrl) {
    publicClientUrl = apiUrl;
    publicClient = createHttpClient({ baseUrl: apiUrl });
  }
  return publicClient;
}

function safeId(value: string, label: string) {
  if (!SAFE_ENTITY_ID.test(value)) {
    throw new TypeError(`${label} 식별자가 올바르지 않습니다.`);
  }
  return encodeURIComponent(value);
}

export function parseReviewEventIdParam(value: unknown) {
  return typeof value === 'string' && SAFE_ENTITY_ID.test(value) ? value : undefined;
}

function normalizeRating(value: number): Review['rating'] {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new TypeError('별점은 1점부터 5점 사이의 정수여야 합니다.');
  }
  return value as Review['rating'];
}

function normalizeContent(value: string) {
  const content = value.trim();
  if (
    content.length < REVIEW_CONTENT_MIN_LENGTH ||
    content.length > REVIEW_CONTENT_MAX_LENGTH
  ) {
    throw new TypeError(
      `후기는 ${REVIEW_CONTENT_MIN_LENGTH}자 이상 ${REVIEW_CONTENT_MAX_LENGTH}자 이하여야 합니다.`,
    );
  }
  return content;
}

function eventReviewsPath(eventId: string, cursor?: string) {
  const encodedEventId = safeId(eventId, '모임');
  if (cursor !== undefined && !SAFE_CURSOR.test(cursor)) {
    throw new TypeError('후기 목록 커서가 올바르지 않습니다.');
  }
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return `/v1/events/${encodedEventId}/reviews?limit=${REVIEW_PAGE_SIZE}${cursorQuery}`;
}

function personalizedEventReviewsPath(eventId: string, cursor?: string) {
  const encodedEventId = safeId(eventId, '모임');
  if (cursor !== undefined && !SAFE_CURSOR.test(cursor)) {
    throw new TypeError('후기 목록 커서가 올바르지 않습니다.');
  }
  const cursorQuery = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
  return `/v1/me/events/${encodedEventId}/reviews?limit=${REVIEW_PAGE_SIZE}${cursorQuery}`;
}

function reviewPath(reviewId: string) {
  return `/v1/reviews/${safeId(reviewId, '후기')}`;
}

function invalidResponse(): never {
  throw new ApiError({
    status: 0,
    code: 'INVALID_RESPONSE',
    message: '서버 후기 응답 형식이 올바르지 않습니다.',
  });
}

function strictRecord(value: unknown, allowedKeys: readonly string[]) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidResponse();
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowedKeys.includes(key))) {
    return invalidResponse();
  }
  return record;
}

function entityId(value: unknown) {
  return typeof value === 'string' && SAFE_ENTITY_ID.test(value)
    ? value
    : invalidResponse();
}

function isoDate(value: unknown) {
  if (typeof value !== 'string') return invalidResponse();
  try {
    return new Date(value).toISOString() === value ? value : invalidResponse();
  } catch {
    return invalidResponse();
  }
}

function reviewRating(value: unknown): Review['rating'] {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5
    ? (value as Review['rating'])
    : invalidResponse();
}

function parseReview(
  value: unknown,
  expectedEventId?: string,
  expectedReviewId?: string,
): Review {
  const review = strictRecord(value, [
    'id',
    'eventId',
    'rating',
    'content',
    'author',
    'createdAt',
    'updatedAt',
  ]);
  const eventId = entityId(review.eventId);
  if (expectedEventId !== undefined && eventId !== expectedEventId) invalidResponse();
  const content = review.content;
  if (
    typeof content !== 'string' ||
    content.length < REVIEW_CONTENT_MIN_LENGTH ||
    content.length > REVIEW_CONTENT_MAX_LENGTH
  ) {
    invalidResponse();
  }
  const author = strictRecord(review.author, ['id', 'name']);
  if (typeof author.name !== 'string' || !author.name.trim()) invalidResponse();
  const id = entityId(review.id);
  if (expectedReviewId !== undefined && id !== expectedReviewId) invalidResponse();
  return {
    id,
    eventId,
    rating: reviewRating(review.rating),
    content,
    author: { id: entityId(author.id), name: author.name },
    createdAt: isoDate(review.createdAt),
    updatedAt: isoDate(review.updatedAt),
  };
}

function parseReviewList(value: unknown, expectedEventId: string): ReviewListPage {
  const body = strictRecord(value, ['data', 'aggregate', 'page']);
  if (!Array.isArray(body.data) || body.data.length > REVIEW_PAGE_SIZE) invalidResponse();
  const data = body.data.map((review) => parseReview(review, expectedEventId));
  const aggregate = strictRecord(body.aggregate, ['averageRating', 'count']);
  const count = aggregate.count;
  const averageRating = aggregate.averageRating;
  if (!Number.isInteger(count) || Number(count) < 0 || Number(count) < data.length) {
    invalidResponse();
  }
  if (
    !(
      averageRating === null ||
      (typeof averageRating === 'number' &&
        Number.isFinite(averageRating) &&
        averageRating >= 1 &&
        averageRating <= 5)
    ) ||
    (count === 0) !== (averageRating === null)
  ) {
    invalidResponse();
  }
  const page = strictRecord(body.page, ['nextCursor', 'hasNextPage']);
  if (typeof page.hasNextPage !== 'boolean') invalidResponse();
  const nextCursor = page.nextCursor;
  if (!(nextCursor === null || (typeof nextCursor === 'string' && SAFE_CURSOR.test(nextCursor)))) {
    invalidResponse();
  }
  if (page.hasNextPage !== (nextCursor !== null)) invalidResponse();
  if (page.hasNextPage && data.length !== REVIEW_PAGE_SIZE) invalidResponse();
  return {
    data,
    aggregate: { averageRating: averageRating as number | null, count: count as number },
    page: { nextCursor, hasNextPage: page.hasNextPage },
  };
}

function parseMyReviewState(value: unknown, expectedEventId: string): MyReviewState {
  const body = strictRecord(value, ['review', 'eligibility']);
  const review = body.review === null ? null : parseReview(body.review, expectedEventId);
  const eligibility = strictRecord(body.eligibility, [
    'approved',
    'attendance',
    'reviewsOpenAt',
    'canCreate',
    'code',
  ]);
  const attendance = eligibility.attendance;
  const code = eligibility.code;
  if (
    typeof eligibility.approved !== 'boolean' ||
    !(attendance === null || attendance === 'NOT_CHECKED' || attendance === 'ATTENDED' || attendance === 'NO_SHOW') ||
    typeof eligibility.canCreate !== 'boolean' ||
    typeof code !== 'string' ||
    !ELIGIBILITY_CODES.has(code as ReviewEligibilityCode)
  ) {
    invalidResponse();
  }
  isoDate(eligibility.reviewsOpenAt);
  if (
    (code === 'CAN_CREATE' &&
      (!eligibility.canCreate || !eligibility.approved || attendance !== 'ATTENDED' || review)) ||
    (code !== 'CAN_CREATE' && eligibility.canCreate) ||
    (code === 'REVIEW_ALREADY_EXISTS' && !review) ||
    (code === 'REVIEW_DELETED' && review)
  ) {
    invalidResponse();
  }
  return {
    review,
    eligibility: {
      approved: eligibility.approved,
      attendance,
      reviewsOpenAt: eligibility.reviewsOpenAt as string,
      canCreate: eligibility.canCreate,
      code: code as ReviewEligibilityCode,
    },
  };
}

function parseDeletedReview(value: unknown, expectedReviewId: string): DeletedReview {
  const body = strictRecord(value, ['id', 'status', 'updatedAt']);
  if (body.id !== expectedReviewId || body.status !== 'HIDDEN') invalidResponse();
  return {
    id: expectedReviewId,
    status: 'HIDDEN',
    updatedAt: isoDate(body.updatedAt),
  };
}

export function mergeReviews(current: Review[], incoming: Review[]) {
  const order: string[] = [];
  const seen = new Set<string>();
  const byId = new Map<string, Review>();
  for (const review of [...current, ...incoming]) {
    if (!seen.has(review.id)) {
      seen.add(review.id);
      order.push(review.id);
    }
    byId.set(review.id, review);
  }
  return order.map((id) => byId.get(id) as Review);
}

export const reviewsApi = {
  async list(
    eventId: string,
    options: { cursor?: string; signal?: AbortSignal } = {},
  ): Promise<ReviewListPage> {
    const response = await getPublicClient().requestJson<unknown>(
      eventReviewsPath(eventId, options.cursor),
      { auth: 'none', signal: options.signal },
    );
    return parseReviewList(response.body, eventId);
  },

  async listForCurrentUser(
    eventId: string,
    options: { cursor?: string; signal?: AbortSignal } = {},
  ): Promise<ReviewListPage> {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      personalizedEventReviewsPath(eventId, options.cursor),
      { auth: 'required', signal: options.signal },
    );
    return parseReviewList(response.body, eventId);
  },

  async mine(eventId: string, signal?: AbortSignal): Promise<MyReviewState> {
    const encodedEventId = safeId(eventId, '모임');
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/events/${encodedEventId}/reviews/me`,
      { auth: 'required', signal },
    );
    return parseMyReviewState(response.body, eventId);
  },

  async create(eventId: string, input: ReviewInput) {
    const encodedEventId = safeId(eventId, '모임');
    const json = {
      rating: normalizeRating(input.rating),
      content: normalizeContent(input.content),
    };
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/events/${encodedEventId}/reviews`,
      { method: 'POST', auth: 'required', json, idempotent: true },
    );
    return parseReview(response.body, eventId);
  },

  async update(reviewId: string, input: ReviewUpdateInput) {
    if (input.rating === undefined && input.content === undefined) {
      throw new TypeError('수정할 별점 또는 후기 내용을 입력해 주세요.');
    }
    const json = {
      ...(input.rating === undefined ? {} : { rating: normalizeRating(input.rating) }),
      ...(input.content === undefined ? {} : { content: normalizeContent(input.content) }),
    };
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      reviewPath(reviewId),
      { method: 'PATCH', auth: 'required', json, idempotent: true },
    );
    return parseReview(response.body, undefined, reviewId);
  },

  async remove(reviewId: string) {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      reviewPath(reviewId),
      { method: 'DELETE', auth: 'required' },
    );
    return parseDeletedReview(response.body, reviewId);
  },
};
