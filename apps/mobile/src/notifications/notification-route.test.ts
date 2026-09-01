import { describe, expect, it } from 'vitest';

import {
  notificationRouteFromData,
  parseAppRoute,
  sanitizeNotificationRoute,
} from './notification-route';

describe('community post notification routes', () => {
  it('allows native list and detail routes without query parameters', () => {
    expect(parseAppRoute('/club/forest-walkers/posts')).toEqual({
      ok: true,
      route: '/club/forest-walkers/posts',
    });
    expect(parseAppRoute('/club/forest-walkers/post/post-1')).toEqual({
      ok: true,
      route: '/club/forest-walkers/post/post-1',
    });
  });

  it('maps canonical web post links from COMMENT and REPLY notifications', () => {
    expect(
      notificationRouteFromData({ route: '/clubs/forest-walkers/posts/post:one' }),
    ).toEqual({
      ok: true,
      route: '/club/forest-walkers/post/post:one',
    });
    expect(sanitizeNotificationRoute('/clubs/forest-walkers/posts')).toBe(
      '/club/forest-walkers/posts',
    );
  });

  it('rejects unsafe identifiers and any query parameters fail closed', () => {
    expect(parseAppRoute('/club/Forest-Walkers/posts')).toEqual({
      ok: false,
      reason: 'invalid-parameter',
    });
    expect(parseAppRoute('/clubs/forest-walkers/posts/%2e%2e')).toEqual({
      ok: false,
      reason: 'external-or-malformed',
    });
    expect(parseAppRoute('/club/forest-walkers/post/post-1?admin=true')).toEqual({
      ok: false,
      reason: 'invalid-parameter',
    });
    expect(parseAppRoute('/club/forest-walkers/posts?cursor=cursor_PAGE_123')).toEqual({
      ok: false,
      reason: 'invalid-parameter',
    });
  });
});
