import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  REVIEW_PAGE_SIZE,
  mergeReviews,
  parseReviewEventIdParam,
  reviewsApi,
  type ApiReview,
} from './reviews-api';

const clientMocks = vi.hoisted(() => ({
  authenticatedRequest: vi.fn(),
  publicRequest: vi.fn(),
}));

vi.mock('@/auth/auth-session-manager', () => ({
  getAuthenticatedHttpClient: () => ({ requestJson: clientMocks.authenticatedRequest }),
}));

vi.mock('@/config/env', () => ({
  getMobileEnvironment: () => ({
    apiUrl: 'https://api.example.com',
    appEnvironment: 'production',
  }),
}));

vi.mock('@/api/http-client', () => ({
  createHttpClient: () => ({ requestJson: clientMocks.publicRequest }),
}));

function apiReview(overrides: Partial<ApiReview> = {}): ApiReview {
  return {
    id: 'review-1',
    eventId: 'event-1',
    rating: 5,
    content: '함께해서 즐겁고 다음에도 참여하고 싶은 모임입니다.',
    author: { id: 'member-1', name: '김시니어' },
    createdAt: '2026-07-30T01:00:00.000Z',
    updatedAt: '2026-07-30T01:00:00.000Z',
    ...overrides,
  };
}

describe('reviewsApi request contract', () => {
  beforeEach(() => {
    clientMocks.authenticatedRequest.mockReset();
    clientMocks.publicRequest.mockReset();
  });

  it('loads one public cursor page with aggregate metadata', async () => {
    const pageData = Array.from({ length: REVIEW_PAGE_SIZE }, (_, index) =>
      apiReview({ id: `review-${index + 1}` }),
    );
    clientMocks.publicRequest.mockResolvedValue({
      body: {
        data: pageData,
        aggregate: { averageRating: 4.75, count: 24 },
        page: { nextCursor: 'cursor_REVIEW_123', hasNextPage: true },
      },
    });

    await expect(
      reviewsApi.list('event-1', { cursor: 'cursor_REVIEW_123' }),
    ).resolves.toEqual({
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'review-1', author: { id: 'member-1', name: '김시니어' } }),
      ]),
      aggregate: { averageRating: 4.75, count: 24 },
      page: { nextCursor: 'cursor_REVIEW_123', hasNextPage: true },
    });
    expect(clientMocks.publicRequest).toHaveBeenCalledWith(
      `/v1/events/event-1/reviews?limit=${REVIEW_PAGE_SIZE}&cursor=cursor_REVIEW_123`,
      { auth: 'none', signal: undefined },
    );
    expect(clientMocks.publicRequest).toHaveBeenCalledTimes(1);
  });

  it('loads the authenticated block-filtered review feed from the private endpoint', async () => {
    const controller = new AbortController();
    clientMocks.authenticatedRequest.mockResolvedValue({
      body: {
        data: [apiReview()],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: false },
      },
    });

    await expect(
      reviewsApi.listForCurrentUser('event-1', { signal: controller.signal }),
    ).resolves.toMatchObject({ aggregate: { averageRating: 5, count: 1 } });
    expect(clientMocks.authenticatedRequest).toHaveBeenCalledWith(
      `/v1/me/events/event-1/reviews?limit=${REVIEW_PAGE_SIZE}`,
      { auth: 'required', signal: controller.signal },
    );
    expect(clientMocks.publicRequest).not.toHaveBeenCalled();
  });

  it('sends a trimmed authenticated create body with retry-safe mutation metadata', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({ body: apiReview() });
    const input = {
      rating: 5 as const,
      content: '  함께해서 즐겁고 다음에도 참여하고 싶은 모임입니다.  ',
    };

    await expect(reviewsApi.create('event-1', input)).resolves.toMatchObject({ id: 'review-1' });
    await expect(reviewsApi.create('event-1', input)).resolves.toMatchObject({ id: 'review-1' });
    expect(clientMocks.authenticatedRequest).toHaveBeenNthCalledWith(1, '/v1/events/event-1/reviews', {
      method: 'POST',
      auth: 'required',
      json: { rating: 5, content: '함께해서 즐겁고 다음에도 참여하고 싶은 모임입니다.' },
      idempotent: true,
    });
    expect(clientMocks.authenticatedRequest).toHaveBeenNthCalledWith(2, '/v1/events/event-1/reviews', {
      method: 'POST',
      auth: 'required',
      json: { rating: 5, content: '함께해서 즐겁고 다음에도 참여하고 싶은 모임입니다.' },
      idempotent: true,
    });
  });

  it('loads private review ownership and server eligibility through the authenticated client', async () => {
    const controller = new AbortController();
    clientMocks.authenticatedRequest.mockResolvedValue({
      body: {
        review: apiReview(),
        eligibility: {
          approved: true,
          attendance: 'ATTENDED',
          reviewsOpenAt: '2026-07-29T03:00:00.000Z',
          canCreate: false,
          code: 'REVIEW_ALREADY_EXISTS',
        },
      },
    });

    await expect(reviewsApi.mine('event-1', controller.signal)).resolves.toEqual({
      review: expect.objectContaining({ id: 'review-1' }),
      eligibility: {
        approved: true,
        attendance: 'ATTENDED',
        reviewsOpenAt: '2026-07-29T03:00:00.000Z',
        canCreate: false,
        code: 'REVIEW_ALREADY_EXISTS',
      },
    });
    expect(clientMocks.authenticatedRequest).toHaveBeenCalledWith(
      '/v1/events/event-1/reviews/me',
      { auth: 'required', signal: controller.signal },
    );
  });

  it('rejects inconsistent private eligibility responses', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({
      body: {
        review: null,
        eligibility: {
          approved: true,
          attendance: 'ATTENDED',
          reviewsOpenAt: '2026-07-29T03:00:00.000Z',
          canCreate: true,
          code: 'REVIEW_ALREADY_EXISTS',
          leaked: true,
        },
      },
    });

    await expect(reviewsApi.mine('event-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('uses the authenticated owner PATCH and DELETE contracts', async () => {
    clientMocks.authenticatedRequest
      .mockResolvedValueOnce({ body: apiReview({ rating: 4 }) })
      .mockResolvedValueOnce({
        body: { id: 'review-1', status: 'HIDDEN', updatedAt: '2026-07-30T02:00:00.000Z' },
      });

    await reviewsApi.update('review-1', { rating: 4, content: '  수정한 후기 내용은 열 글자 이상입니다.  ' });
    await reviewsApi.remove('review-1');

    expect(clientMocks.authenticatedRequest).toHaveBeenNthCalledWith(1, '/v1/reviews/review-1', {
      method: 'PATCH',
      auth: 'required',
      json: { rating: 4, content: '수정한 후기 내용은 열 글자 이상입니다.' },
      idempotent: true,
    });
    expect(clientMocks.authenticatedRequest).toHaveBeenNthCalledWith(2, '/v1/reviews/review-1', {
      method: 'DELETE',
      auth: 'required',
    });
  });

  it('rejects a PATCH response for a different review ID', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({
      body: apiReview({ id: 'review-2' }),
    });

    await expect(
      reviewsApi.update('review-1', { content: '수정한 후기 내용은 열 글자 이상입니다.' }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });

  it('rejects invalid IDs, cursors, ratings, and content before networking', async () => {
    expect(parseReviewEventIdParam(['event-1', 'event-2'])).toBeUndefined();
    expect(parseReviewEventIdParam('../event')).toBeUndefined();
    expect(parseReviewEventIdParam('event-1')).toBe('event-1');
    await expect(reviewsApi.list('../event')).rejects.toThrow('모임 식별자가 올바르지 않습니다.');
    await expect(reviewsApi.list('event-1', { cursor: '../bad' })).rejects.toThrow(
      '후기 목록 커서가 올바르지 않습니다.',
    );
    await expect(
      reviewsApi.create('event-1', { rating: 6 as 5, content: '충분히 긴 후기 내용입니다.' }),
    ).rejects.toThrow('별점은 1점부터 5점 사이의 정수여야 합니다.');
    await expect(
      reviewsApi.create('event-1', { rating: 5, content: '짧아요' }),
    ).rejects.toThrow('후기는 10자 이상 800자 이하여야 합니다.');
    expect(clientMocks.authenticatedRequest).not.toHaveBeenCalled();
    expect(clientMocks.publicRequest).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'unknown DTO keys',
      body: {
        data: [{ ...apiReview(), leaked: true }],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: false },
      },
    },
    {
      label: 'unknown aggregate keys',
      body: {
        data: [apiReview()],
        aggregate: { averageRating: 5, count: 1, leaked: true },
        page: { nextCursor: null, hasNextPage: false },
      },
    },
    {
      label: 'unknown page keys',
      body: {
        data: [apiReview()],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: false, offset: 0 },
      },
    },
    {
      label: 'invalid ISO dates',
      body: {
        data: [apiReview({ createdAt: 'yesterday' })],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: false },
      },
    },
    {
      label: 'ratings outside 1..5',
      body: {
        data: [apiReview({ rating: 6 as 5 })],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: false },
      },
    },
    {
      label: 'reviews from another requested event',
      body: {
        data: [apiReview({ eventId: 'event-2' })],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: false },
      },
    },
    {
      label: 'inconsistent aggregate metadata',
      body: {
        data: [],
        aggregate: { averageRating: 5, count: 0 },
        page: { nextCursor: null, hasNextPage: false },
      },
    },
    {
      label: 'inconsistent pagination',
      body: {
        data: [apiReview()],
        aggregate: { averageRating: 5, count: 1 },
        page: { nextCursor: null, hasNextPage: true },
      },
    },
  ])('rejects $label as an INVALID_RESPONSE', async ({ body }) => {
    clientMocks.publicRequest.mockResolvedValue({ body });
    await expect(reviewsApi.list('event-1')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('mergeReviews', () => {
  it('deduplicates IDs while keeping order and the newest value', () => {
    const first = apiReview();
    const updated = apiReview({ rating: 4 });
    const second = apiReview({ id: 'review-2', author: { id: 'member-2', name: '박회원' } });
    expect(mergeReviews([first], [updated, second])).toEqual([updated, second]);
  });
});
