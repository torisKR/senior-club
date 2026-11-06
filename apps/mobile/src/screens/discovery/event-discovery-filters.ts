import type { Event, EventFeedState } from '@/types';

import { matchesEventQuery } from './discovery-utils';

export type EventFilter = 'all' | 'upcoming' | 'completed';

/** Route categories and Event.interestId both use the API's interest slug. */
export function normalizeEventCategory(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const category = value.trim();
  if (category === 'all' || category.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(category)) {
    return undefined;
  }
  return category;
}

export function filterDiscoveryEvents(
  events: Event[],
  { lifecycle, category, query }: { lifecycle: EventFilter; category?: string; query: string },
): Event[] {
  return events
    .filter((event) => {
      const lifecycleMatches =
        lifecycle === 'all' ||
        (lifecycle === 'upcoming'
          ? event.lifecycle === 'upcoming' || event.lifecycle === 'full'
          : event.lifecycle === 'completed' || event.lifecycle === 'cancelled');
      return (
        lifecycleMatches &&
        (!category || event.interestId === category) &&
        matchesEventQuery(event, query, event.clubTitle)
      );
    })
    .sort((left, right) => {
      const leftPast = left.lifecycle === 'completed' || left.lifecycle === 'cancelled';
      const rightPast = right.lifecycle === 'completed' || right.lifecycle === 'cancelled';
      if (leftPast !== rightPast) return leftPast ? 1 : -1;
      return leftPast
        ? Date.parse(right.startsAt) - Date.parse(left.startsAt)
        : Date.parse(left.startsAt) - Date.parse(right.startsAt);
    });
}

/** An exhausted first page is different from an incomplete or failed search. */
export function isEventSearchComplete(
  feeds: Pick<EventFeedState, 'loaded' | 'loading' | 'loadingMore' | 'hasNextPage' | 'error'>[],
): boolean {
  return feeds.every((feed) =>
    feed.loaded && !feed.loading && !feed.loadingMore && !feed.hasNextPage && !feed.error,
  );
}
