import { describe, expect, it } from 'vitest';

import eas from '../../eas.json';
import { resolveAndroidBannerId } from './config';
import { GOOGLE_ANDROID_TEST_APP_ID, GOOGLE_ANDROID_TEST_BANNER_ID } from './ids';

describe('resolveAndroidBannerId', () => {
  it('uses Google test inventory in development', () => {
    expect(
      resolveAndroidBannerId({
        configuredId: 'ca-app-pub-3004906966180197/1234567890',
        isDevelopment: true,
      }),
    ).toBe(GOOGLE_ANDROID_TEST_BANNER_ID);
  });

  it('accepts a well-formed production unit id', () => {
    expect(
      resolveAndroidBannerId({
        configuredId: 'ca-app-pub-3004906966180197/1234567890',
        isDevelopment: false,
      }),
    ).toBe('ca-app-pub-3004906966180197/1234567890');
  });

  it('falls back to the production banner id when none is configured', () => {
    expect(resolveAndroidBannerId({ configuredId: undefined, isDevelopment: false })).toBe(
      'ca-app-pub-3004906966180197/2894786837',
    );
  });

  it('rejects a malformed production unit id', () => {
    expect(resolveAndroidBannerId({ configuredId: 'not-an-id', isDevelopment: false })).toBeNull();
  });
});

describe('standalone QA advertising', () => {
  const profiles = Object.entries(eas.build).filter(
    ([, profile]) => 'distribution' in profile && profile.distribution === 'internal',
  );

  it.each(profiles)('%s uses test inventory even in a release APK', (_, profile) => {
    const env = profile.env as Record<string, string>;
    expect(env.EXPO_PUBLIC_ADMOB_ANDROID_APP_ID).toBe(GOOGLE_ANDROID_TEST_APP_ID);
    expect(
      resolveAndroidBannerId({
        configuredId: env.EXPO_PUBLIC_ADMOB_ANDROID_BANNER_ID,
        isDevelopment: false,
      }),
    ).toBe(GOOGLE_ANDROID_TEST_BANNER_ID);
  });
});
