export const SERVER_API_BASE_URL_ENV = "SENIOR_CLUB_API_BASE_URL";

export type ApiConfigurationErrorCode =
  | "MISSING_API_BASE_URL"
  | "INVALID_API_BASE_URL";

export class ApiConfigurationError extends Error {
  constructor(
    public readonly code: ApiConfigurationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ApiConfigurationError";
  }
}

type Environment = Readonly<Record<string, string | undefined>>;

type ParseServerApiBaseUrlOptions = {
  allowInsecureLocalhost?: boolean;
};

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLocaleLowerCase("en-US");
  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized === "127.0.0.1" ||
    normalized === "[::1]"
  );
}

/**
 * Validates the trusted, server-owned API origin before it reaches fetch().
 * HTTP is accepted only for an explicitly enabled loopback development API.
 */
export function parseServerApiBaseUrl(
  value: string | null | undefined,
  { allowInsecureLocalhost = false }: ParseServerApiBaseUrlOptions = {},
) {
  if (!value) {
    throw new ApiConfigurationError(
      "MISSING_API_BASE_URL",
      `${SERVER_API_BASE_URL_ENV} 환경변수가 필요합니다.`,
    );
  }

  if (value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ApiConfigurationError(
      "INVALID_API_BASE_URL",
      `${SERVER_API_BASE_URL_ENV}에 공백이나 제어 문자를 사용할 수 없습니다.`,
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ApiConfigurationError(
      "INVALID_API_BASE_URL",
      `${SERVER_API_BASE_URL_ENV}은 완전한 URL이어야 합니다.`,
    );
  }

  const isSecure = url.protocol === "https:";
  const isAllowedLocalHttp =
    allowInsecureLocalhost &&
    url.protocol === "http:" &&
    isLoopbackHostname(url.hostname);

  if (!isSecure && !isAllowedLocalHttp) {
    throw new ApiConfigurationError(
      "INVALID_API_BASE_URL",
      `${SERVER_API_BASE_URL_ENV}은 HTTPS URL이어야 합니다.`,
    );
  }

  if (url.username || url.password) {
    throw new ApiConfigurationError(
      "INVALID_API_BASE_URL",
      `${SERVER_API_BASE_URL_ENV}에 사용자 정보나 비밀번호를 포함할 수 없습니다.`,
    );
  }

  if (url.search || url.hash) {
    throw new ApiConfigurationError(
      "INVALID_API_BASE_URL",
      `${SERVER_API_BASE_URL_ENV}에 query 또는 fragment를 포함할 수 없습니다.`,
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  return url;
}

export function getServerApiBaseUrl(
  environment: Environment = process.env,
  options: ParseServerApiBaseUrlOptions = {},
) {
  return parseServerApiBaseUrl(environment[SERVER_API_BASE_URL_ENV], {
    allowInsecureLocalhost:
      options.allowInsecureLocalhost ?? environment.NODE_ENV !== "production",
  });
}
