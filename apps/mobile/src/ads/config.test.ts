import { describe, expect, it } from 'vitest';

import { resolveAndroidBannerId } from './config';
import { GOOGLE_ANDROID_TEST_BANNER_ID } from './ids';

describe('resolveAndroidBannerId', () => {
  it('uses Google test inventory in development', () => {
    expect(
      resolveAndroidBannerId({
        configuredId: 'ca-app-pub-5744832247312120/1234567890',
        isDevelopment: true,
      }),
    ).toBe(GOOGLE_ANDROID_TEST_BANNER_ID);
  });

  it('accepts a well-formed production unit id', () => {
    expect(
      resolveAndroidBannerId({
        configuredId: 'ca-app-pub-5744832247312120/1234567890',
        isDevelopment: false,
      }),
    ).toBe('ca-app-pub-5744832247312120/1234567890');
  });

  it('falls back to the production banner id when none is configured', () => {
    expect(resolveAndroidBannerId({ configuredId: undefined, isDevelopment: false })).toBe(
      'ca-app-pub-5744832247312120/1610421489',
    );
  });

  it('rejects a malformed production unit id', () => {
    expect(resolveAndroidBannerId({ configuredId: 'not-an-id', isDevelopment: false })).toBeNull();
  });
});
