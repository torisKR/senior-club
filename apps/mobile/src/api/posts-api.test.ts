import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from './api-error';
import {
  POST_PAGE_SIZE,
  isAmbiguousCreateFailure,
  isSafePostClubSlug,
  isSafePostCursor,
  isSafePostId,
  mergeComments,
  mergePosts,
  parseCommentListPage,
  parseCommunityPostDetail,
  parsePostListPage,
  postsApi,
  type CommunityComment,
  type CommunityPost,
} from './posts-api';

const clientMocks = vi.hoisted(() => ({
  publicRequest: vi.fn(),
  authenticatedRequest: vi.fn(),
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

vi.mock('@/auth/auth-session-manager', () => ({
  getAuthenticatedHttpClient: () => ({ requestJson: clientMocks.authenticatedRequest }),
}));

beforeEach(() => {
  clientMocks.publicRequest.mockReset();
  clientMocks.authenticatedRequest.mockReset();
});

function rawPost(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: `post-${index}`,
    clubId: 'club-1',
    type: 'GENERAL',
    title: `함께 나누는 이야기 ${index}`,
    content: '열 글자가 넘는 실제 게시글 본문입니다.',
    author: { id: 'user-1', name: '김회원' },
    commentCount: index,
    createdAt: `2026-07-${String(index).padStart(2, '0')}T01:00:00.000Z`,
    updatedAt: `2026-07-${String(index).padStart(2, '0')}T01:00:00.000Z`,
    ...overrides,
  };
}

function rawDetail(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    ...rawPost(index),
    club: {
      id: 'club-1',
      slug: 'forest-walkers',
      title: '숲길 걷기 모임',
      region: '서울',
      interest: {
        id: 'interest-1',
        slug: 'hiking',
        name: '등산',
        icon: 'mountain',
      },
    },
    ...overrides,
  };
}

function rawComment(index = 1, overrides: Record<string, unknown> = {}) {
  return {
    id: `comment-${index}`,
    postId: 'post-1',
    parentId: null,
    content: `댓글 내용 ${index}`,
    author: { id: 'user-2', name: '이회원' },
    createdAt: `2026-07-${String(index).padStart(2, '0')}T02:00:00.000Z`,
    updatedAt: `2026-07-${String(index).padStart(2, '0')}T02:00:00.000Z`,
    ...overrides,
  };
}

describe('postsApi public feeds', () => {
  it('loads a 20-item club feed with an opaque cursor and no authentication', async () => {
    const data = Array.from({ length: POST_PAGE_SIZE }, (_, index) => rawPost(index + 1));
    clientMocks.publicRequest.mockResolvedValue({
      body: {
        club: { id: 'club-1', slug: 'forest-walkers', title: '숲길 걷기 모임' },
        data,
        page: { hasNextPage: true, nextCursor: 'cursor_NEXT_123' },
      },
    });

    await expect(
      postsApi.list('forest-walkers', { cursor: 'cursor_PAGE_123' }),
    ).resolves.toEqual({
      club: { id: 'club-1', slug: 'forest-walkers', title: '숲길 걷기 모임' },
      data: expect.arrayContaining([expect.objectContaining({ id: 'post-1' })]),
      page: { hasNextPage: true, nextCursor: 'cursor_NEXT_123' },
    });
    expect(clientMocks.publicRequest).toHaveBeenCalledWith(
      '/v1/clubs/forest-walkers/posts?limit=20&cursor=cursor_PAGE_123',
      { auth: 'none', signal: undefined },
    );
  });

  it('loads detail and comments publicly while enforcing their route association', async () => {
    const controller = new AbortController();
    clientMocks.publicRequest
      .mockResolvedValueOnce({ body: rawDetail() })
      .mockResolvedValueOnce({
        body: {
          data: [rawComment()],
          page: { hasNextPage: false, nextCursor: null },
        },
      });

    await expect(postsApi.detail('forest-walkers', 'post-1', controller.signal)).resolves.toEqual(
      expect.objectContaining({ id: 'post-1', club: expect.objectContaining({ slug: 'forest-walkers' }) }),
    );
    await expect(postsApi.comments('post-1', { signal: controller.signal })).resolves.toEqual({
      data: [expect.objectContaining({ id: 'comment-1', postId: 'post-1' })],
      page: { hasNextPage: false, nextCursor: null },
    });
    expect(clientMocks.publicRequest).toHaveBeenNthCalledWith(1, '/v1/posts/post-1', {
      auth: 'none',
      signal: controller.signal,
    });
    expect(clientMocks.publicRequest).toHaveBeenNthCalledWith(
      2,
      '/v1/posts/post-1/comments?limit=20',
      { auth: 'none', signal: controller.signal },
    );
  });
});

describe('postsApi authenticated mutations', () => {
  it('creates a normalized post without claiming unsupported idempotency', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({ body: rawDetail() });

    await postsApi.createPost('forest-walkers', {
      title: '  같이   걸어요  ',
      content: '  열 글자가 넘는 게시글 본문입니다.  ',
    });

    expect(clientMocks.authenticatedRequest).toHaveBeenCalledWith(
      '/v1/clubs/forest-walkers/posts',
      {
        method: 'POST',
        auth: 'required',
        json: { title: '같이 걸어요', content: '열 글자가 넘는 게시글 본문입니다.' },
        signal: undefined,
      },
    );
    expect(clientMocks.authenticatedRequest.mock.calls[0]?.[1]).not.toHaveProperty('idempotent');
    expect(clientMocks.authenticatedRequest.mock.calls[0]?.[1]).not.toHaveProperty(
      'idempotencyKey',
    );
  });

  it('creates a comment and supports author mutations with required authentication', async () => {
    clientMocks.authenticatedRequest
      .mockResolvedValueOnce({ body: rawComment() })
      .mockResolvedValueOnce({ body: rawDetail(1, { title: '수정된 제목' }) })
      .mockResolvedValueOnce({ body: rawComment(1, { content: '수정 댓글' }) })
      .mockResolvedValueOnce({
        body: { id: 'post-1', status: 'HIDDEN', updatedAt: '2026-07-30T01:00:00.000Z' },
      })
      .mockResolvedValueOnce({
        body: { id: 'comment-1', status: 'HIDDEN', updatedAt: '2026-07-30T01:00:00.000Z' },
      });

    await postsApi.createComment('post-1', { content: '  반갑습니다  ' });
    await postsApi.updatePost('forest-walkers', 'post-1', {
      title: '수정된 제목',
      content: rawPost().content,
    });
    await postsApi.updateComment('post-1', 'comment-1', '수정 댓글');
    await postsApi.deletePost('post-1');
    await postsApi.deleteComment('comment-1');

    expect(clientMocks.authenticatedRequest).toHaveBeenNthCalledWith(
      1,
      '/v1/posts/post-1/comments',
      {
        method: 'POST',
        auth: 'required',
        json: { content: '반갑습니다' },
        signal: undefined,
      },
    );
    for (const [, options] of clientMocks.authenticatedRequest.mock.calls) {
      expect(options).toMatchObject({ auth: 'required' });
      expect(options).not.toHaveProperty('idempotent');
    }
  });
});

describe('posts API strict validation and safety helpers', () => {
  it('rejects unsafe slugs, IDs, and cursors before a network request', async () => {
    expect(isSafePostClubSlug('forest-walkers')).toBe(true);
    expect(isSafePostClubSlug('../admin')).toBe(false);
    expect(isSafePostId('post:one.2')).toBe(true);
    expect(isSafePostId('../post')).toBe(false);
    expect(isSafePostCursor('cursor_PAGE_123')).toBe(true);
    expect(isSafePostCursor(' short ')).toBe(false);

    await expect(postsApi.list('../admin')).rejects.toThrow('커뮤니티 주소');
    await expect(postsApi.detail('forest-walkers', '../post')).rejects.toThrow('게시글 식별자');
    expect(clientMocks.publicRequest).not.toHaveBeenCalled();
  });

  it('rejects unknown fields, route mismatches, invalid dates, and inconsistent pages', () => {
    expect(() => parseCommunityPostDetail(rawDetail(1, { fixturePhoto: 'fake.jpg' }))).toThrow(
      '알 수 없는 fixturePhoto 필드',
    );
    expect(() =>
      parseCommunityPostDetail(rawDetail(), { expectedSlug: 'different-club' }),
    ).toThrow('요청한 커뮤니티와 일치하지 않습니다');
    expect(() =>
      parseCommentListPage(
        {
          data: [rawComment(1, { postId: 'other-post' })],
          page: { hasNextPage: false, nextCursor: null },
        },
        'post-1',
      ),
    ).toThrow('요청한 게시글과 일치하지 않습니다');
    expect(() => parseCommunityPostDetail(rawDetail(1, { createdAt: 'yesterday' }))).toThrow(
      '날짜 형식 오류',
    );
    expect(() =>
      parsePostListPage(
        {
          club: { id: 'club-1', slug: 'forest-walkers', title: '숲길 걷기 모임' },
          data: [],
          page: { hasNextPage: true, nextCursor: null },
        },
        'forest-walkers',
      ),
    ).toThrow('페이지 상태와 cursor');
  });

  it('deduplicates cursor pages while preserving order and newest values', () => {
    const first = parseCommunityPostDetail(rawDetail());
    const updated = { ...first, title: '새 제목' } satisfies CommunityPost;
    const second = parseCommunityPostDetail(rawDetail(2));
    expect(mergePosts([first], [updated, second]).map(({ title }) => title)).toEqual([
      '새 제목',
      second.title,
    ]);

    const comment = parseCommentListPage(
      { data: [rawComment()], page: { hasNextPage: false, nextCursor: null } },
      'post-1',
    ).data[0];
    const changed = { ...comment, content: '새 댓글' } satisfies CommunityComment;
    expect(mergeComments([comment], [changed])).toEqual([changed]);
  });

  it('marks only potentially ambiguous create failures for explicit verification', () => {
    expect(
      isAmbiguousCreateFailure(
        new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
      ),
    ).toBe(true);
    expect(
      isAmbiguousCreateFailure(new ApiError({ status: 503, code: 'UNAVAILABLE', message: 'down' })),
    ).toBe(true);
    expect(
      isAmbiguousCreateFailure(new ApiError({ status: 400, code: 'INVALID_POST', message: 'bad' })),
    ).toBe(false);
  });
});
