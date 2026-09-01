import { fetch as expoFetch } from 'expo/fetch';

import { ApiError, apiErrorFromResponse } from '@/api/api-error';
import { createNativeIdempotencyKey } from '@/api/idempotency-key';

export type AuthenticationMode = 'none' | 'optional' | 'required';

export interface AuthTokenSource {
  getAccessToken(): string | null | Promise<string | null>;
  /** Refreshes and installs the new access token in memory, then returns it. */
  refreshAccessToken(): Promise<string | null>;
  /** Called only when a final 401 or explicit invalid-refresh response proves auth is unusable. */
  onAuthenticationFailure?(error: ApiError): void | Promise<void>;
}

export interface FetchRequestOptions {
  method: string;
  headers: Headers;
  body?: BodyInit | null;
  signal: AbortSignal;
  credentials: RequestCredentials;
}

export type FetchImplementation = (
  input: string | URL,
  init: FetchRequestOptions,
) => Promise<Response>;

export interface HttpRequestOptions {
  method?: string;
  auth?: AuthenticationMode;
  headers?: HeadersInit;
  json?: unknown;
  body?: BodyInit | null;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Generate and reuse an Idempotency-Key for this mutation, including an auth retry. */
  idempotent?: boolean;
  idempotencyKey?: string;
}

export interface HttpResult<T> {
  body: T;
  status: number;
  headers: Headers;
  requestId?: string;
  idempotencyKey?: string;
}

export interface HttpClient {
  request(path: string, options?: HttpRequestOptions): Promise<Response>;
  requestJson<T>(path: string, options?: HttpRequestOptions): Promise<HttpResult<T>>;
}

export interface CreateHttpClientOptions {
  baseUrl: string;
  auth?: AuthTokenSource;
  fetchImpl?: FetchImplementation;
  createIdempotencyKey?: () => string;
  defaultTimeoutMs?: number;
}

interface PreparedRequest {
  method: string;
  auth: AuthenticationMode;
  headers: Headers;
  body?: BodyInit | null;
  signal?: AbortSignal;
  timeoutMs: number;
  idempotencyKey?: string;
}

const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,200}$/;
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const DEFAULT_TIMEOUT_MS = 15_000;
const EXPLICIT_INVALID_REFRESH_CODES = new Set([
  'INVALID_REFRESH_TOKEN',
  'REFRESH_TOKEN_EXPIRED',
  'REFRESH_TOKEN_REVOKED',
  'SESSION_REVOKED',
]);

const defaultFetch: FetchImplementation = (input, init) =>
  expoFetch(input, init) as Promise<Response>;

function normalizeBaseUrl(value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new TypeError('baseUrl은 http 또는 https URL이어야 합니다.');
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new TypeError('baseUrl에는 인증 정보, 쿼리 문자열 또는 해시를 포함할 수 없습니다.');
  }

  const path = parsed.pathname === '/' ? '' : parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${path}`;
}

function buildRequestUrl(baseUrl: string, path: string) {
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes('\\') ||
    /[\u0000-\u001F\u007F]/.test(path)
  ) {
    throw new TypeError('API path는 /로 시작하는 안전한 내부 경로여야 합니다.');
  }

  return `${baseUrl}${path}`;
}

function defaultIdempotencyKey() {
  try {
    return createNativeIdempotencyKey();
  } catch (error) {
    throw new ApiError({
      status: 0,
      code: 'CRYPTO_UNAVAILABLE',
      message: '안전한 요청 식별자를 생성할 수 없습니다.',
      cause: error,
    });
  }
}

function validateTimeout(value: number) {
  if (!Number.isFinite(value) || value < 1 || value > 120_000) {
    throw new TypeError('timeoutMs는 1ms 이상 120000ms 이하여야 합니다.');
  }
  return value;
}

function prepareRequest(
  options: HttpRequestOptions,
  createIdempotencyKey: () => string,
  defaultTimeoutMs: number,
): PreparedRequest {
  const method = (options.method ?? 'GET').trim().toUpperCase();
  const auth = options.auth ?? 'none';
  const headers = new Headers(options.headers);

  if (!method || !['none', 'optional', 'required'].includes(auth)) {
    throw new TypeError('HTTP method 또는 auth 설정이 유효하지 않습니다.');
  }
  if (options.json !== undefined && options.body !== undefined) {
    throw new TypeError('json과 body는 동시에 전달할 수 없습니다.');
  }
  if (SAFE_METHODS.has(method) && (options.json !== undefined || options.body != null)) {
    throw new TypeError(`${method} 요청에는 body를 전달할 수 없습니다.`);
  }
  if (headers.has('authorization')) {
    throw new TypeError('Authorization 헤더는 AuthTokenSource에서만 설정할 수 있습니다.');
  }
  if (headers.has('idempotency-key')) {
    throw new TypeError('Idempotency-Key는 idempotencyKey 옵션으로 전달해 주세요.');
  }

  let body = options.body;
  if (options.json !== undefined) {
    try {
      body = JSON.stringify(options.json);
    } catch (error) {
      throw new ApiError({
        status: 0,
        code: 'INVALID_REQUEST_BODY',
        message: '요청 본문을 JSON으로 만들 수 없습니다.',
        cause: error,
      });
    }
    if (!headers.has('content-type')) {
      headers.set('Content-Type', 'application/json');
    }
  }

  if (!headers.has('accept')) {
    headers.set('Accept', 'application/json');
  }

  let idempotencyKey = options.idempotencyKey;
  if (options.idempotent || idempotencyKey) {
    if (SAFE_METHODS.has(method)) {
      throw new TypeError('안전한 조회 요청에는 Idempotency-Key가 필요하지 않습니다.');
    }
    idempotencyKey ??= createIdempotencyKey();
    if (!IDEMPOTENCY_KEY.test(idempotencyKey)) {
      throw new TypeError('idempotencyKey 형식이 유효하지 않습니다.');
    }
    headers.set('Idempotency-Key', idempotencyKey);
  }

  return {
    method,
    auth,
    headers,
    body,
    signal: options.signal,
    timeoutMs: validateTimeout(options.timeoutMs ?? defaultTimeoutMs),
    idempotencyKey,
  };
}

function requestSignal(parentSignal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;

  const abortFromParent = () => controller.abort();
  if (parentSignal?.aborted) {
    controller.abort();
  } else {
    parentSignal?.addEventListener('abort', abortFromParent, { once: true });
  }

  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    cleanup() {
      clearTimeout(timeout);
      parentSignal?.removeEventListener('abort', abortFromParent);
    },
  };
}

/**
 * A refresh attempt can fail because the network or API is temporarily unavailable.
 * Only an authoritative auth response may invalidate the credential persisted by the caller.
 */
export function isTerminalAuthenticationFailure(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.status === 401 || EXPLICIT_INVALID_REFRESH_CODES.has(error.code))
  );
}

function normalizeRefreshFailure(error: unknown) {
  return error instanceof ApiError
    ? error
    : new ApiError({
        status: 0,
        code: 'SESSION_REFRESH_FAILED',
        message: '로그인 상태를 갱신하지 못했습니다.',
        cause: error,
      });
}

async function notifyAuthenticationFailure(auth: AuthTokenSource | undefined, error: ApiError) {
  if (!isTerminalAuthenticationFailure(error)) {
    return;
  }

  try {
    await auth?.onAuthenticationFailure?.(error);
  } catch {
    // Session cleanup must not hide the authoritative authentication error.
  }
}

export function createHttpClient(options: CreateHttpClientOptions): HttpClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const createIdempotencyKey = options.createIdempotencyKey ?? defaultIdempotencyKey;
  const defaultTimeoutMs = validateTimeout(options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS);
  const auth = options.auth;
  let refreshPromise: Promise<string | null> | null = null;

  function refreshAccessToken() {
    if (!auth) {
      return Promise.resolve(null);
    }
    if (!refreshPromise) {
      refreshPromise = Promise.resolve()
        .then(() => auth.refreshAccessToken())
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  async function fetchOnce(url: string, request: PreparedRequest, accessToken: string | null) {
    const headers = new Headers(request.headers);
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const controlledSignal = requestSignal(request.signal, request.timeoutMs);
    try {
      return await fetchImpl(url, {
        method: request.method,
        headers,
        body: request.body,
        signal: controlledSignal.signal,
        credentials: 'omit',
      });
    } catch (error) {
      if (controlledSignal.didTimeOut()) {
        throw new ApiError({
          status: 0,
          code: 'REQUEST_TIMEOUT',
          message: '서버 응답 시간이 초과되었습니다.',
          cause: error,
        });
      }
      if (request.signal?.aborted) {
        throw new ApiError({
          status: 0,
          code: 'REQUEST_ABORTED',
          message: '요청이 취소되었습니다.',
          cause: error,
        });
      }
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        status: 0,
        code: 'NETWORK_ERROR',
        message: '네트워크에 연결하지 못했습니다.',
        cause: error,
      });
    } finally {
      controlledSignal.cleanup();
    }
  }

  async function execute(path: string, requestOptions: HttpRequestOptions = {}) {
    const url = buildRequestUrl(baseUrl, path);
    const request = prepareRequest(requestOptions, createIdempotencyKey, defaultTimeoutMs);

    if (request.auth === 'required' && !auth) {
      throw new ApiError({
        status: 401,
        code: 'AUTHENTICATION_REQUIRED',
        message: '로그인이 필요한 요청입니다.',
      });
    }

    let accessToken = request.auth === 'none' ? null : ((await auth?.getAccessToken()) ?? null);
    if (request.auth === 'required' && !accessToken) {
      try {
        accessToken = await refreshAccessToken();
      } catch (error) {
        const authError = normalizeRefreshFailure(error);
        await notifyAuthenticationFailure(auth, authError);
        throw authError;
      }
      if (!accessToken) {
        const authError = new ApiError({
          status: 401,
          code: 'AUTHENTICATION_REQUIRED',
          message: '로그인이 필요합니다.',
        });
        await notifyAuthenticationFailure(auth, authError);
        throw authError;
      }
    }

    let response = await fetchOnce(url, request, accessToken);
    const canRefresh =
      response.status === 401 && request.auth !== 'none' && Boolean(auth) && Boolean(accessToken);

    if (canRefresh) {
      try {
        const currentToken = (await auth?.getAccessToken()) ?? null;
        const nextToken =
          currentToken && currentToken !== accessToken ? currentToken : await refreshAccessToken();

        if (nextToken) {
          response = await fetchOnce(url, request, nextToken);
        }
      } catch (error) {
        const authError = normalizeRefreshFailure(error);
        await notifyAuthenticationFailure(auth, authError);
        throw authError;
      }
    }

    if (!response.ok) {
      const error = await apiErrorFromResponse(response);
      if (request.auth !== 'none' && isTerminalAuthenticationFailure(error)) {
        await notifyAuthenticationFailure(auth, error);
      }
      throw error;
    }

    return { response, idempotencyKey: request.idempotencyKey };
  }

  return {
    async request(path, requestOptions) {
      return (await execute(path, requestOptions)).response;
    },

    async requestJson<T>(
      path: string,
      requestOptions?: HttpRequestOptions,
    ): Promise<HttpResult<T>> {
      const { response, idempotencyKey } = await execute(path, requestOptions);
      let body: T;

      if (response.status === 204) {
        body = undefined as T;
      } else {
        const text = await response.text();
        try {
          body = JSON.parse(text) as T;
        } catch (error) {
          throw new ApiError({
            status: response.status,
            code: 'INVALID_RESPONSE',
            message: '서버가 올바른 JSON 응답을 보내지 않았습니다.',
            cause: error,
          });
        }
      }

      return {
        body,
        status: response.status,
        headers: response.headers,
        requestId: response.headers.get('x-request-id') ?? undefined,
        idempotencyKey,
      };
    },
  };
}
