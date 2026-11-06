import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPublicWebPageUrl, PRIVACY_POLICY_URL } from './public-web-links';

afterEach(() => vi.unstubAllEnvs());

describe('public policy links', () => {
  it('opens the public policy and former-account contact without the retired API configuration', () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'production');
    vi.stubEnv('EXPO_PUBLIC_API_URL', '');
    vi.stubEnv('EXPO_PUBLIC_WEB_URL', '');
    expect(getPublicWebPageUrl('privacy')).toBe(PRIVACY_POLICY_URL);
    expect(getPublicWebPageUrl('account-deletion')).toBe(PRIVACY_POLICY_URL);
    expect(new URL(PRIVACY_POLICY_URL).protocol).toBe('https:');
  });
});
