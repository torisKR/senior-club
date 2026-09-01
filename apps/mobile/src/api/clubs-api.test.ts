import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  CLUB_LIST_PAGE_SIZE,
  clubsApi,
  mergeClubPages,
  parseClubListPage,
  parsePublicClub,
  type PublicClub,
} from './clubs-api';

const clientMocks = vi.hoisted(() => ({ publicRequest: vi.fn() }));

vi.mock('@/config/env', () => ({
  getMobileEnvironment: () => ({
    apiUrl: 'https://api.example.com',
    appEnvironment: 'production',
  }),
}));

vi.mock('@/api/http-client', () => ({
  createHttpClient: () => ({ requestJson: clientMocks.publicRequest }),
}));

function rawClub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'club-1',
    slug: 'slow-hiking',
    title: '천천히 걷는 모임',
    description: '함께 천천히 걸어요.',
    region: '서울',
    interest: {
      id: 'interest-hiking',
      slug: 'hiking',
      name: '등산',
      icon: 'mountain',
    },
    leaderName: '김리더',
    memberCount: 12,
    upcomingEventCount: 2,
    pastEventCount: 4,
    nextEvent: {
      id: 'event-1',
      title: '북한산 둘레길',
      locationName: '우이역',
      startAt: '2099-08-10T01:00:00.000Z',
      status: 'PUBLISHED',
    },
    ...overrides,
  };
}

function club(id: string, title: string): PublicClub {
  return parsePublicClub(rawClub({ id, slug: `club-${id}`, title }));
}

describe('clubsApi public request contract', () => {
  beforeEach(() => clientMocks.publicRequest.mockReset());

  it('loads one cursor page with normalized server filters and no auth', async () => {
    clientMocks.publicRequest.mockResolvedValue({
      body: {
        data: [rawClub()],
        page: { hasNextPage: true, nextCursor: 'cursor_NEXT_123' },
      },
    });

    await expect(
      clubsApi.list({
        category: 'hiking',
        region: ' 서울  마포 ',
        q: ' 느린  걸음 ',
        cursor: 'cursor_PAGE_123',
      }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ id: 'club-1', slug: 'slow-hiking' })],
      page: { hasNextPage: true, nextCursor: 'cursor_NEXT_123' },
    });
    expect(clientMocks.publicRequest).toHaveBeenCalledWith(
      `/v1/clubs?limit=${CLUB_LIST_PAGE_SIZE}&category=hiking&region=%EC%84%9C%EC%9A%B8+%EB%A7%88%ED%8F%AC&q=%EB%8A%90%EB%A6%B0+%EA%B1%B8%EC%9D%8C&cursor=cursor_PAGE_123`,
      { auth: 'none', signal: undefined },
    );
  });

  it('loads a detail by safe slug without authentication', async () => {
    const controller = new AbortController();
    clientMocks.publicRequest.mockResolvedValue({ body: rawClub() });

    await expect(clubsApi.detail('slow-hiking', controller.signal)).resolves.toEqual(
      expect.objectContaining({
        slug: 'slow-hiking',
        interest: expect.objectContaining({ emoji: '🥾' }),
      }),
    );
    expect(clientMocks.publicRequest).toHaveBeenCalledWith('/v1/clubs/slow-hiking', {
      auth: 'none',
      signal: controller.signal,
    });
  });

  it('rejects unsafe filters, cursors, and slugs before network access', async () => {
    await expect(clubsApi.list({ q: '한' })).rejects.toThrow('검색어 형식');
    await expect(clubsApi.list({ cursor: '../unsafe' })).rejects.toThrow('커뮤니티 목록 커서');
    await expect(clubsApi.list({ category: '../admin' })).rejects.toThrow('관심사 식별자');
    await expect(clubsApi.detail('../admin')).rejects.toThrow('커뮤니티 주소');
    await expect(clubsApi.detail(' slow-hiking ')).rejects.toThrow('커뮤니티 주소');
    expect(clientMocks.publicRequest).not.toHaveBeenCalled();
  });
});

describe('clubs API strict response validation', () => {
  it('rejects unknown or missing DTO fields and invalid counts', () => {
    expect(() => parsePublicClub(rawClub({ fixtureTag: '초보 환영' }))).toThrow(
      '알 수 없는 fixtureTag 필드',
    );
    const missingLeader = rawClub();
    delete (missingLeader as Partial<typeof missingLeader>).leaderName;
    expect(() => parsePublicClub(missingLeader)).toThrow('leaderName 필드 누락');
    expect(() => parsePublicClub(rawClub({ memberCount: -1 }))).toThrow(
      '0 이상의 정수',
    );
  });

  it('rejects inconsistent pagination and malformed nested events', () => {
    expect(() =>
      parseClubListPage({ data: [], page: { hasNextPage: true, nextCursor: null } }),
    ).toThrow('페이지 상태와 cursor');
    expect(() =>
      parsePublicClub(
        rawClub({
          nextEvent: {
            id: 'event-1',
            title: '다음 모임',
            locationName: '서울',
            startAt: 'not-a-date',
            status: 'PUBLISHED',
          },
        }),
      ),
    ).toThrow('날짜 형식');
  });

  it('accepts non-empty server strings without inventing client-only length limits', () => {
    const description = '긴 설명'.repeat(2_000);
    const leaderName = '리더'.repeat(150);

    expect(parsePublicClub(rawClub({ description, leaderName }))).toEqual(
      expect.objectContaining({ description, leaderName }),
    );
  });
});

describe('mergeClubPages', () => {
  it('deduplicates IDs, keeps stable order, and installs the newest DTO', () => {
    const result = mergeClubPages(
      [club('1', '이전 제목'), club('2', '두 번째')],
      [club('1', '최신 제목'), club('3', '세 번째'), club('3', '세 번째 최신')],
    );

    expect(result.map(({ id }) => id)).toEqual(['1', '2', '3']);
    expect(result.map(({ title }) => title)).toEqual(['최신 제목', '두 번째', '세 번째 최신']);
  });
});
