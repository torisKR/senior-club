import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Event, EventListView } from '@/types';

import {
  EVENT_LIST_PAGE_SIZE,
  eventsApi,
  mergeEventPages,
  parseApiApplication,
  parseApiEvent,
  type ApiEvent,
} from './events-api';

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

function apiEvent(overrides: Partial<ApiEvent> = {}): ApiEvent {
  return {
    id: 'event-upcoming-1',
    title: '한강 걷기',
    description: '천천히 함께 걷는 모임',
    coverImageUrl: null,
    locationName: '여의나루역',
    address: '서울 영등포구',
    mapUrl: null,
    startAt: '2099-08-10T01:00:00.000Z',
    endAt: '2099-08-10T03:00:00.000Z',
    registrationDeadline: null,
    capacity: 20,
    participantCount: 8,
    remainingCapacity: 12,
    price: 0,
    currency: 'KRW',
    difficulty: 'EASY',
    supplies: '물, 모자',
    approvalMode: 'MANUAL',
    status: 'PUBLISHED',
    club: {
      id: 'club-walking',
      slug: 'walking',
      title: '걷기 모임',
      region: '서울',
      interest: { slug: 'walking', name: '걷기', icon: 'footprints' },
      leaderName: '김리더',
    },
    ...overrides,
  };
}

function event(id: string, title: string): Event {
  return {
    id,
    clubId: 'club-1',
    clubTitle: '걷기 모임',
    title,
    summary: title,
    description: title,
    location: '서울',
    address: '서울시',
    startsAt: '2026-08-10T01:00:00.000Z',
    endsAt: '2026-08-10T03:00:00.000Z',
    capacity: 20,
    participantCount: 1,
    price: 0,
    difficulty: 'easy',
    lifecycle: 'upcoming',
    preparation: [],
    leader: { id: 'leader-1', name: '리더', introduction: '소개' },
  };
}

describe('eventsApi list contract', () => {
  beforeEach(() => {
    clientMocks.authenticatedRequest.mockReset();
    clientMocks.publicRequest.mockReset();
  });

  it('requests only the first upcoming page and preserves its cursor metadata', async () => {
    clientMocks.publicRequest.mockResolvedValue({
      body: {
        data: Array.from({ length: EVENT_LIST_PAGE_SIZE }, (_, index) =>
          apiEvent({ id: `event-upcoming-${index + 1}` }),
        ),
        page: { nextCursor: 'cursor_NEXT_123', hasNextPage: true },
      },
    });

    const result = await eventsApi.list({ view: 'upcoming' });
    expect(result.data).toHaveLength(EVENT_LIST_PAGE_SIZE);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: 'event-upcoming-1',
        lifecycle: 'upcoming',
        interestId: 'walking',
        clubRegion: '서울',
      }),
    );
    expect(result.page).toEqual({ nextCursor: 'cursor_NEXT_123', hasNextPage: true });
    expect(clientMocks.publicRequest).toHaveBeenCalledWith(
      `/v1/events?limit=${EVENT_LIST_PAGE_SIZE}&view=upcoming`,
      { auth: 'none', signal: undefined },
    );
    expect(clientMocks.publicRequest).toHaveBeenCalledTimes(1);
  });

  it('requests exactly one past cursor page', async () => {
    const controller = new AbortController();
    clientMocks.publicRequest.mockResolvedValue({
      body: {
        data: [
          apiEvent({
            id: 'event-past-1',
            status: 'PUBLISHED',
            startAt: '2020-08-10T01:00:00.000Z',
            endAt: '2020-08-10T03:00:00.000Z',
          }),
        ],
        page: { nextCursor: null, hasNextPage: false },
      },
    });

    await expect(
      eventsApi.list({
        view: 'past',
        cursor: 'cursor_PAST_123',
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      data: [expect.objectContaining({ id: 'event-past-1', lifecycle: 'completed' })],
      page: { nextCursor: null, hasNextPage: false },
    });
    expect(clientMocks.publicRequest).toHaveBeenCalledWith(
      `/v1/events?limit=${EVENT_LIST_PAGE_SIZE}&view=past&cursor=cursor_PAST_123`,
      { auth: 'none', signal: controller.signal },
    );
    expect(clientMocks.publicRequest).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid view and cursor values before a network request', async () => {
    await expect(
      eventsApi.list({ view: 'all' as EventListView }),
    ).rejects.toThrow('모임 목록 구분이 올바르지 않습니다.');
    await expect(
      eventsApi.list({ view: 'past', cursor: '../unsafe' }),
    ).rejects.toThrow('모임 목록 커서가 올바르지 않습니다.');
    expect(clientMocks.publicRequest).not.toHaveBeenCalled();
  });

  it('fails closed on unknown fields, mismatched IDs, and inconsistent pagination', async () => {
    expect(() => parseApiEvent({ ...apiEvent(), privateNote: 'hidden' })).toThrow(
      '알 수 없는 privateNote 필드',
    );
    expect(() => parseApiEvent(apiEvent(), 'response', 'event-other')).toThrow(
      '요청한 모임과 일치하지 않습니다',
    );

    clientMocks.publicRequest.mockResolvedValue({
      body: {
        data: [apiEvent()],
        page: { nextCursor: null, hasNextPage: true },
      },
    });
    await expect(eventsApi.list({ view: 'upcoming' })).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('event application response contract', () => {
  const application = {
    id: 'application-1',
    eventId: 'event-upcoming-1',
    userId: 'user-1',
    status: 'PENDING',
    attendance: 'NOT_CHECKED',
    appliedAt: '2026-07-30T01:00:00.000Z',
    decidedAt: null,
    canceledAt: null,
    updatedAt: '2026-07-30T01:00:00.000Z',
  } as const;

  beforeEach(() => {
    clientMocks.authenticatedRequest.mockReset();
    clientMocks.publicRequest.mockReset();
  });

  it('accepts the exact application shape and expected event', () => {
    expect(parseApiApplication(application, 'response', 'event-upcoming-1')).toEqual(
      application,
    );
  });

  it('rejects unknown fields and an unexpected event relationship', () => {
    expect(() => parseApiApplication({ ...application, email: 'hidden@example.com' })).toThrow(
      '알 수 없는 email 필드',
    );
    expect(() => parseApiApplication(application, 'response', 'event-other')).toThrow(
      '요청한 모임과 일치하지 않습니다',
    );
  });

  it('validates the documented my-applications event projection before stripping it', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({
      body: [
        {
          ...application,
          event: {
            id: application.eventId,
            title: '한강 걷기',
            startAt: '2099-08-10T01:00:00.000Z',
            locationName: '여의나루역',
            club: { slug: 'walking', title: '걷기 모임' },
          },
        },
      ],
    });

    await expect(eventsApi.myApplications()).resolves.toEqual([application]);
    expect(clientMocks.authenticatedRequest).toHaveBeenCalledWith('/v1/me/applications', {
      auth: 'required',
      signal: undefined,
    });
  });

  it('rejects a my-applications row whose event projection points elsewhere', async () => {
    clientMocks.authenticatedRequest.mockResolvedValue({
      body: [
        {
          ...application,
          event: {
            id: 'event-other',
            title: '다른 모임',
            startAt: '2099-08-10T01:00:00.000Z',
            locationName: '다른 장소',
            club: { slug: 'walking', title: '걷기 모임' },
          },
        },
      ],
    });

    await expect(eventsApi.myApplications()).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });
});

describe('mergeEventPages', () => {
  it('keeps stable order, removes duplicate IDs, and uses the newest value', () => {
    const merged = mergeEventPages(
      [event('event-1', '이전 제목'), event('event-2', '두 번째')],
      [event('event-1', '최신 제목'), event('event-3', '세 번째'), event('event-3', '세 번째 최신')],
    );

    expect(merged.map((item) => item.id)).toEqual(['event-1', 'event-2', 'event-3']);
    expect(merged.map((item) => item.title)).toEqual(['최신 제목', '두 번째', '세 번째 최신']);
  });
});
