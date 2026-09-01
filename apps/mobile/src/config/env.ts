import { getReleaseApiUrlViolation } from './release-api-url';

export type AppEnvironment = 'development' | 'preview' | 'production';

export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export interface MobileEnvironment {
  appEnvironment: AppEnvironment;
  apiUrl: string;
  webUrl: string;
}

export class EnvironmentConfigurationError extends Error {
  readonly key: string;

  constructor(key: string, message: string) {
    super(message);
    this.name = 'EnvironmentConfigurationError';
    this.key = key;
  }
}

function parseAppEnvironment(value: string | undefined): AppEnvironment {
  const normalized = value?.trim() || 'development';

  if (normalized === 'development' || normalized === 'preview' || normalized === 'production') {
    return normalized;
  }

  throw new EnvironmentConfigurationError(
    'EXPO_PUBLIC_APP_ENV',
    'EXPO_PUBLIC_APP_ENV는 development, preview, production 중 하나여야 합니다.',
  );
}

function parseApiUrl(value: string | undefined, appEnvironment: AppEnvironment) {
  const candidate = value?.trim();

  if (!candidate) {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_API_URL이 설정되지 않았습니다.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_API_URL',
      'EXPO_PUBLIC_API_URL은 유효한 절대 URL이어야 합니다.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_API_URL',
      'API URL은 https 또는 http 프로토콜만 사용할 수 있습니다.',
    );
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_API_URL',
      'API URL에는 인증 정보, 쿼리 문자열 또는 해시를 포함할 수 없습니다.',
    );
  }

  if (appEnvironment !== 'development' && parsed.protocol !== 'https:') {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_API_URL',
      'preview와 production API는 HTTPS를 사용해야 합니다.',
    );
  }

  const releaseUrlViolation =
    appEnvironment === 'development' ? null : getReleaseApiUrlViolation(parsed);
  if (releaseUrlViolation) {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_API_URL',
      `${appEnvironment} API는 공개 HTTPS URL이어야 합니다: ${releaseUrlViolation}.`,
    );
  }

  const normalizedPath = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${normalizedPath}`;
}

function parseWebUrl(value: string | undefined, appEnvironment: AppEnvironment) {
  const candidate = value?.trim() || (appEnvironment === 'development' ? 'http://localhost:3000' : '');

  if (!candidate) {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_WEB_URL',
      'preview와 production 빌드에는 EXPO_PUBLIC_WEB_URL이 필요합니다.',
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_WEB_URL',
      'EXPO_PUBLIC_WEB_URL은 유효한 절대 URL이어야 합니다.',
    );
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_WEB_URL',
      '웹 URL은 https 또는 http 프로토콜만 사용할 수 있습니다.',
    );
  }

  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== '/' && parsed.pathname !== '')
  ) {
    throw new EnvironmentConfigurationError(
      'EXPO_PUBLIC_WEB_URL',
      '웹 URL은 인증 정보, 경로, 쿼리 문자열 또는 해시가 없는 origin이어야 합니다.',
    );
  }

  if (appEnvironment !== 'development') {
    const releaseUrlViolation = getReleaseApiUrlViolation(parsed);
    if (releaseUrlViolation) {
      throw new EnvironmentConfigurationError(
        'EXPO_PUBLIC_WEB_URL',
        `${appEnvironment} 웹 사이트는 공개 HTTPS URL이어야 합니다: ${releaseUrlViolation}.`,
      );
    }
  }

  return parsed.origin;
}

/**
 * Parses only public, bundle-safe values. Secrets must never use EXPO_PUBLIC_ variables.
 * The source argument keeps configuration validation deterministic in unit tests.
 */
export function parseMobileEnvironment(source: EnvironmentSource): MobileEnvironment {
  const appEnvironment = parseAppEnvironment(source.EXPO_PUBLIC_APP_ENV);

  return {
    appEnvironment,
    apiUrl: parseApiUrl(source.EXPO_PUBLIC_API_URL, appEnvironment),
    webUrl: parseWebUrl(source.EXPO_PUBLIC_WEB_URL, appEnvironment),
  };
}

/**
 * Read lazily so importing this module does not make fixture builds require an
 * API URL.
 *
 * Each variable is named as a literal `process.env.X` member expression on
 * purpose: Expo substitutes `EXPO_PUBLIC_*` values at bundle time only for that
 * exact syntax. Passing `process.env` itself would leave the object empty in a
 * native build, so the app would ship without an API URL.
 */
export function getMobileEnvironment(): MobileEnvironment {
  return parseMobileEnvironment({
    EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_WEB_URL: process.env.EXPO_PUBLIC_WEB_URL,
  });
}
