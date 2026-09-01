import { describe, expect, it } from 'vitest';

import {
  buildOnboardingHref,
  buildPostAuthHref,
  sanitizeAuthIntent,
  sanitizeReturnTo,
} from '@/utils/auth-routing';

describe('event application auth routing', () => {
  it('preserves the event and apply intent through onboarding', () => {
    expect(buildOnboardingHref('/event/event-1', 'apply')).toEqual({
      pathname: '/onboarding',
      params: { returnTo: '/event/event-1', intent: 'apply' },
    });
    expect(buildPostAuthHref('/event/event-1', 'apply')).toBe(
      '/event/event-1?intent=apply',
    );
  });

  it('accepts only the apply intent and rejects unsafe event destinations', () => {
    expect(sanitizeAuthIntent('apply')).toBe('apply');
    expect(sanitizeAuthIntent('delete')).toBeUndefined();
    expect(sanitizeReturnTo('https://evil.example/steal', '/events')).toBe(
      '/events',
    );
  });

  it('preserves safe community post return routes through login and onboarding', () => {
    expect(sanitizeReturnTo('/club/forest-walkers/posts')).toBe(
      '/club/forest-walkers/posts',
    );
    expect(sanitizeReturnTo('/club/forest-walkers/post/post-1')).toBe(
      '/club/forest-walkers/post/post-1',
    );
    expect(sanitizeReturnTo('/club/forest-walkers/post/post-1?admin=true')).toBe(
      '/home',
    );
  });
});
