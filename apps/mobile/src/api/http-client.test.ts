import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/api/api-error';
import {
  createHttpClient,
  isTerminalAuthenticationFailure,
  type AuthTokenSource,
  type FetchImplementation,
} from '@/api/http-client';

vi.mock('expo/fetch', () => ({ fetch: vi.fn() }));
vi.mock('@/api/idempotency-key', () => ({
  createNativeIdempotencyKey: () => '00000000-0000-4000-8000-000000000000',
}));

function jsonResponse(status: number, code = `HTTP_${status}`) {
  return new Response(
    JSON.stringify({ error: { code, message: `request failed with ${status}` } }),
    {
      status,
      headers: { 'Content-Type': 'application/json' },
    },
  );
}

function createAuth(overrides: Partial<AuthTokenSource> = {}) {
  return {
    getAccessToken: vi.fn<() => string | null | Promise<string | null>>(() => null),
    refreshAccessToken: vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)),
    onAuthenticationFailure: vi.fn<(error: ApiError) => void>(),
    ...overrides,
  } satisfies AuthTokenSource;
}

describe('isTerminalAuthenticationFailure', () => {
  it.each([
    new ApiError({ status: 401, code: 'AUTHENTICATION_REQUIRED', message: 'expired' }),
    new ApiError({ status: 400, code: 'INVALID_REFRESH_TOKEN', message: 'invalid' }),
    new ApiError({ status: 403, code: 'SESSION_REVOKED', message: 'revoked' }),
  ])('accepts authoritative authentication failures', (error) => {
    expect(isTerminalAuthenticationFailure(error)).toBe(true);
  });

  it.each([
    new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
    new ApiError({ status: 408, code: 'REQUEST_TIMEOUT', message: 'timeout' }),
    new ApiError({ status: 429, code: 'RATE_LIMITED', message: 'slow down' }),
    new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'retry' }),
    new ApiError({ status: 403, code: 'FORBIDDEN', message: 'forbidden' }),
    new ApiError({ status: 403, code: 'CHAT_MEMBERSHIP_REQUIRED', message: 'join first' }),
    new ApiError({ status: 403, code: 'LEADER_SCOPE_REQUIRED', message: 'leader only' }),
    new ApiError({ status: 403, code: 'RECENT_AUTHENTICATION_REQUIRED', message: 'reauth' }),
    new Error('unexpected transport failure'),
  ])('rejects transient refresh failures', (error) => {
    expect(isTerminalAuthenticationFailure(error)).toBe(false);
  });
});

describe('createHttpClient authentication refresh', () => {
  it.each([
    new ApiError({ status: 0, code: 'NETWORK_ERROR', message: 'offline' }),
    new ApiError({ status: 503, code: 'SERVICE_UNAVAILABLE', message: 'retry' }),
  ])('preserves credentials when an initial refresh fails transiently', async (refreshError) => {
    const auth = createAuth({
      refreshAccessToken: vi.fn(() => Promise.reject(refreshError)),
    });
    const fetchImpl = vi.fn<FetchImplementation>();
    const client = createHttpClient({ baseUrl: 'https://api.example.org', auth, fetchImpl });

    await expect(client.request('/v1/me', { auth: 'required' })).rejects.toBe(refreshError);
    expect(auth.onAuthenticationFailure).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('preserves the session and exposes a transport error for an unexpected refresh exception', async () => {
    const auth = createAuth({
      refreshAccessToken: vi.fn(() => Promise.reject(new TypeError('connection reset'))),
    });
    const client = createHttpClient({
      baseUrl: 'https://api.example.org',
      auth,
      fetchImpl: vi.fn<FetchImplementation>(),
    });

    await expect(client.request('/v1/me', { auth: 'required' })).rejects.toMatchObject({
      status: 0,
      code: 'SESSION_REFRESH_FAILED',
    });
    expect(auth.onAuthenticationFailure).not.toHaveBeenCalled();
  });

  it('preserves credentials when a stale access token refresh gets a transient API response', async () => {
    const refreshError = new ApiError({
      status: 503,
      code: 'SERVICE_UNAVAILABLE',
      message: 'retry',
    });
    const auth = createAuth({
      getAccessToken: vi.fn(() => 'stale-access-token'),
      refreshAccessToken: vi.fn(() => Promise.reject(refreshError)),
    });
    const fetchImpl = vi.fn<FetchImplementation>().mockResolvedValueOnce(
      jsonResponse(401, 'AUTHENTICATION_REQUIRED'),
    );
    const client = createHttpClient({ baseUrl: 'https://api.example.org', auth, fetchImpl });

    await expect(client.request('/v1/me', { auth: 'required' })).rejects.toBe(refreshError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(auth.onAuthenticationFailure).not.toHaveBeenCalled();
  });

  it.each([
    new ApiError({ status: 401, code: 'INVALID_REFRESH_TOKEN', message: 'expired' }),
    new ApiError({ status: 400, code: 'INVALID_REFRESH_TOKEN', message: 'invalid' }),
  ])('clears credentials for an authoritative refresh failure', async (refreshError) => {
    const auth = createAuth({
      refreshAccessToken: vi.fn(() => Promise.reject(refreshError)),
    });
    const client = createHttpClient({
      baseUrl: 'https://api.example.org',
      auth,
      fetchImpl: vi.fn<FetchImplementation>(),
    });

    await expect(client.request('/v1/me', { auth: 'required' })).rejects.toBe(refreshError);
    expect(auth.onAuthenticationFailure).toHaveBeenCalledOnce();
    expect(auth.onAuthenticationFailure).toHaveBeenCalledWith(refreshError);
  });

  it('preserves credentials when the retried protected request is finally forbidden', async () => {
    let token = 'stale-access-token';
    const auth = createAuth({
      getAccessToken: vi.fn(() => token),
      refreshAccessToken: vi.fn(async () => {
        token = 'fresh-access-token';
        return token;
      }),
    });
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse(401, 'AUTHENTICATION_REQUIRED'))
      .mockResolvedValueOnce(jsonResponse(403, 'FORBIDDEN'));
    const client = createHttpClient({ baseUrl: 'https://api.example.org', auth, fetchImpl });

    await expect(client.request('/v1/me', { auth: 'required' })).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(auth.onAuthenticationFailure).not.toHaveBeenCalled();
  });

  it.each([
    'CHAT_MEMBERSHIP_REQUIRED',
    'LEADER_SCOPE_REQUIRED',
    'RECENT_AUTHENTICATION_REQUIRED',
  ])('does not clear credentials for a protected API permission response: %s', async (code) => {
    const auth = createAuth({
      getAccessToken: vi.fn(() => 'valid-access-token'),
    });
    const fetchImpl = vi
      .fn<FetchImplementation>()
      .mockResolvedValueOnce(jsonResponse(403, code));
    const client = createHttpClient({ baseUrl: 'https://api.example.org', auth, fetchImpl });

    await expect(client.request('/v1/protected-resource', { auth: 'required' })).rejects.toMatchObject({
      status: 403,
      code,
    });
    expect(auth.refreshAccessToken).not.toHaveBeenCalled();
    expect(auth.onAuthenticationFailure).not.toHaveBeenCalled();
  });
});
