import { describe, expect, it, vi } from 'vitest';

import { mergeEventPages, toEvent, type ApiEvent } from '@/api/events-api';
import { MOBILE_HOBBY_RECOMMENDATIONS } from '@/data/senior-recommendations';
import type { Event, EventFeedState } from '@/types';

import { filterDiscoveryEvents, isEventSearchComplete, normalizeEventCategory } from './event-discovery-filters';

vi.mock('@/auth/auth-session-manager', () => ({ getAuthenticatedHttpClient: vi.fn() }));
vi.mock('@/config/env', () => ({ getMobileEnvironment: vi.fn() }));
vi.mock('@/api/http-client', () => ({ createHttpClient: vi.fn() }));

function event(id: string, interestId: string, overrides: Partial<Event> = {}): Event {
  const apiEvent: ApiEvent = {
    id,
    title: '계절 풍경 모임',
    description: '함께 배우고 이야기를 나눠요',
    coverImageUrl: null,
    locationName: '서울숲',
    address: '서울 성동구',
    mapUrl: null,
    startAt: '2099-10-10T01:00:00.000Z',
    endAt: '2099-10-10T03:00:00.000Z',
    registrationDeadline: null,
    capacity: 20,
    participantCount: 5,
    remainingCapacity: 15,
    price: 0,
    currency: 'KRW',
    difficulty: 'EASY',
    supplies: null,
    approvalMode: 'AUTO',
    status: 'PUBLISHED',
    club: {
      id: `club-${id}`,
      slug: `club-${id}`,
      title: '우리 동네 모임',
      region: '서울',
      interest: { slug: interestId, name: '서버 관심사', icon: 'leaf' },
      leaderName: '리더',
    },
  };
  return { ...toEvent(apiEvent), ...overrides };
}

const completedFeed: EventFeedState = {
  events: [], loaded: true, loading: false, loadingMore: false,
  error: null, errorMode: null, nextCursor: null, hasNextPage: false,
};

describe('event category route and real interest slugs', () => {
  it.each([undefined, null, '', 'all', ['photo'], ['photo', 'gardening'], '../photo', '사진', 'photo?admin=1', 'a'.repeat(81)])(
    'ignores invalid or ambiguous category input %j',
    (value) => expect(normalizeEventCategory(value)).toBeUndefined(),
  );

  it('uses existing recommendation slugs, including photo and gardening, without translating display labels', () => {
    for (const hobby of MOBILE_HOBBY_RECOMMENDATIONS) {
      expect(normalizeEventCategory(hobby.interestId)).toBe(hobby.interestId);
    }
    expect(normalizeEventCategory(' rail-travel ')).toBe('rail-travel');
  });

  it('changes photo to gardening from the current route and restores all interests when cleared', () => {
    const events = [event('photo', 'photo'), event('garden', 'gardening'), event('walk', 'hiking')];
    const results = (category: unknown) => filterDiscoveryEvents(events, {
      lifecycle: 'upcoming', category: normalizeEventCategory(category), query: '',
    }).map(({ id }) => id);
    expect(results('photo')).toEqual(['photo']);
    expect(results('gardening')).toEqual(['garden']);
    expect(results('')).toEqual(['photo', 'garden', 'walk']);
    expect(results(['photo', 'gardening'])).toEqual(['photo', 'garden', 'walk']);
    expect(results('unknown-interest')).toEqual([]);
  });

  it('matches the API interest slug exactly, never title words, club IDs or missing metadata', () => {
    const events = [
      event('photo', 'photo'),
      event('misleading', 'gardening', { title: '사진 모임', clubId: 'photo' }),
      event('missing', 'photo', { interestId: undefined, title: '사진 모임' }),
    ];
    expect(filterDiscoveryEvents(events, { lifecycle: 'all', category: 'photo', query: '' }).map(({ id }) => id))
      .toEqual(['photo']);
  });

  it('combines category with search and lifecycle, preserving chronological ordering and the source array', () => {
    const events = [
      event('past-older', 'photo', { lifecycle: 'completed', startsAt: '2020-01-01T00:00:00Z' }),
      event('later', 'photo', { startsAt: '2099-12-01T00:00:00Z' }),
      event('wrong-query', 'photo', { location: '부산', address: '부산' }),
      event('wrong-category', 'gardening'),
      event('earlier-full', 'photo', { lifecycle: 'full', startsAt: '2099-11-01T00:00:00Z' }),
      event('past-newer', 'photo', { lifecycle: 'cancelled', startsAt: '2021-01-01T00:00:00Z' }),
    ];
    const sourceIds = events.map(({ id }) => id);
    const results = (lifecycle: 'all' | 'upcoming' | 'completed') => filterDiscoveryEvents(events, {
      lifecycle, category: 'photo', query: '서울',
    }).map(({ id }) => id);
    expect(results('upcoming')).toEqual(['earlier-full', 'later']);
    expect(results('completed')).toEqual(['past-newer', 'past-older']);
    expect(results('all')).toEqual(['earlier-full', 'later', 'past-newer', 'past-older']);
    expect(events.map(({ id }) => id)).toEqual(sourceIds);
  });

  it('keeps matching events from later pages and respects updated server category metadata on duplicate IDs', () => {
    const first = [event('walk', 'hiking'), event('changed', 'photo')];
    const next = [event('garden', 'gardening'), event('changed', 'gardening')];
    expect(filterDiscoveryEvents(first, { lifecycle: 'upcoming', category: 'gardening', query: '' })).toEqual([]);
    const merged = mergeEventPages(first, next);
    expect(filterDiscoveryEvents(merged, { lifecycle: 'upcoming', category: 'gardening', query: '' }).map(({ id }) => id))
      .toEqual(['changed', 'garden']);
    expect(filterDiscoveryEvents(merged, { lifecycle: 'upcoming', category: 'photo', query: '' })).toEqual([]);
  });
});

describe('event search completion across paginated feeds', () => {
  it.each([
    { loaded: false }, { loading: true }, { loadingMore: true },
    { hasNextPage: true }, { error: '다시 시도해 주세요', errorMode: 'append' as const },
  ])('does not claim absence while a feed is incomplete or retryable: %j', (pending) => {
    expect(isEventSearchComplete([completedFeed, { ...completedFeed, ...pending }])).toBe(false);
  });

  it('reports completion only after every selected lifecycle feed is loaded, exhausted and successful', () => {
    expect(isEventSearchComplete([completedFeed])).toBe(true);
    expect(isEventSearchComplete([completedFeed, completedFeed])).toBe(true);
    expect(isEventSearchComplete([{ ...completedFeed, error: '네트워크 오류' }])).toBe(false);
    expect(isEventSearchComplete([completedFeed])).toBe(true);
  });
});
