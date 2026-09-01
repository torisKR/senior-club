import { describe, expect, it } from 'vitest';

import { EnvironmentConfigurationError, parseMobileEnvironment } from './env';

const releaseSource = {
  EXPO_PUBLIC_APP_ENV: 'production',
  EXPO_PUBLIC_API_URL: 'https://api.seniorclub.kr/v1/',
  EXPO_PUBLIC_WEB_URL: 'https://seniorclub.kr/',
} as const;

describe('parseMobileEnvironment', () => {
  it('normalizes release API and public web URLs', () => {
    expect(parseMobileEnvironment(releaseSource)).toEqual({
      appEnvironment: 'production',
      apiUrl: 'https://api.seniorclub.kr/v1',
      webUrl: 'https://seniorclub.kr',
    });
  });

  it('uses the local web origin only in development', () => {
    expect(
      parseMobileEnvironment({
        EXPO_PUBLIC_APP_ENV: 'development',
        EXPO_PUBLIC_API_URL: 'http://10.0.2.2:4000',
      }).webUrl,
    ).toBe('http://localhost:3000');
  });

  it('requires a public HTTPS web origin for preview and production', () => {
    for (const webUrl of [
      undefined,
      'http://seniorclub.kr',
      'https://localhost:3000',
      'https://example.com',
    ]) {
      expect(() =>
        parseMobileEnvironment({
          ...releaseSource,
          EXPO_PUBLIC_WEB_URL: webUrl,
        }),
      ).toThrow(EnvironmentConfigurationError);
    }
  });

  it('rejects a web URL with path, credentials, query, or hash', () => {
    for (const webUrl of [
      'https://seniorclub.kr/app',
      'https://user:password@seniorclub.kr',
      'https://seniorclub.kr?source=app',
      'https://seniorclub.kr#privacy',
    ]) {
      expect(() =>
        parseMobileEnvironment({
          ...releaseSource,
          EXPO_PUBLIC_WEB_URL: webUrl,
        }),
      ).toThrow(/origin/);
    }
  });
});
