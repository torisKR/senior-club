import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stored: null as null | Record<string, unknown>,
  fetch: vi.fn(),
  writeBarrier: null as Promise<void> | null,
}));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('@/api/idempotency-key', () => ({ createNativeIdempotencyKey: () => '00000000-0000-4000-8000-000000000000' }));
vi.mock('@/config/env', () => ({ getMobileEnvironment: () => ({ apiUrl: 'https://api.example.org' }) }));
vi.mock('@/auth/session-store', () => ({ sessionStore: {
  read: async () => mocks.stored,
  write: async (value: Record<string, unknown>) => {
    await mocks.writeBarrier;
    mocks.stored = { ...value, version: 1, savedAt: Date.now() };
    return mocks.stored;
  },
  clear: async () => { mocks.stored = null; },
} }));

beforeEach(() => {
  vi.resetModules();
  mocks.fetch.mockReset();
  mocks.writeBarrier = null;
  mocks.stored = {
    version: 1, userId: 'member', sessionId: 'session', refreshToken: 'old-refresh',
    refreshTokenExpiresAt: Date.now() + 86_400_000, savedAt: Date.now(),
  };
});

function issued(userId = 'member', refreshToken = 'new-refresh') {
  return {
    accessToken: `${userId}-access`, accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshToken, refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    sessionId: `${userId}-session`, user: { id: userId, email: null, phoneNumber: null, name: '회원', role: 'MEMBER', onboardingCompletedAt: null },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('authentication changes during in-flight work', () => {
  it('does not restore a rotated session after logout and revokes the late issued token', async () => {
    const response = deferred<Response>();
    const revoked: string[] = [];
    mocks.fetch.mockImplementation(async (url: string | URL, options: { body?: string }) => {
      if (String(url).endsWith('/v1/auth/refresh')) return response.promise;
      if (String(url).endsWith('/v1/auth/logout')) revoked.push(JSON.parse(options.body ?? '{}').refreshToken);
      return Response.json({ success: true });
    });
    const { authSessionManager } = await import('./auth-session-manager');
    const restore = authSessionManager.restore();
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    await authSessionManager.logout();
    response.resolve(Response.json(issued()));
    await expect(restore).resolves.toBeNull();
    expect(authSessionManager.getSnapshot().status).toBe('anonymous');
    expect(mocks.stored).toBeNull();
    expect(revoked).toContain('new-refresh');
  });

  it('keeps logout authoritative even when a SecureStore write finishes late', async () => {
    const write = deferred<void>();
    mocks.writeBarrier = write.promise;
    mocks.fetch.mockImplementation(async (url: string | URL) => Response.json(
      String(url).endsWith('/v1/auth/refresh') ? issued() : { success: true },
    ));
    const { authSessionManager } = await import('./auth-session-manager');
    const restore = authSessionManager.restore();
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    // Let the response reach storage before logout; the native write cannot be cancelled.
    await new Promise((resolve) => setTimeout(resolve, 0));
    const logout = authSessionManager.logout();
    write.resolve();
    await logout;
    await expect(restore).resolves.toBeNull();
    expect(authSessionManager.getSnapshot().status).toBe('anonymous');
    expect(mocks.stored).toBeNull();
  });

  it('rejects a Kakao login response that arrives after logout', async () => {
    const response = deferred<Response>();
    mocks.fetch.mockImplementation(async (url: string | URL) =>
      String(url).endsWith('/v1/auth/kakao') ? response.promise : Response.json({ success: true }));
    const { authSessionManager } = await import('./auth-session-manager');
    const login = authSessionManager.loginWithKakao('provider-fixture', { termsAccepted: true, privacyAccepted: true });
    const outcome = expect(login).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    await authSessionManager.logout();
    response.resolve(Response.json(issued()));
    await outcome;
    expect(authSessionManager.getSnapshot().status).toBe('anonymous');
    expect(mocks.stored).toBeNull();
  });

  it.each([200, 401])('rejects an old profile response (%s) without retrying under the next account', async (status) => {
    const response = deferred<Response>();
    let profileCalls = 0;
    mocks.fetch.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith('/v1/auth/refresh')) return Response.json(issued());
      if (String(url).endsWith('/v1/auth/kakao')) return Response.json(issued('other-member', 'other-refresh'));
      if (String(url).endsWith('/v1/me')) { profileCalls += 1; return response.promise; }
      return Response.json({ success: true });
    });
    const { authSessionManager, getAuthenticatedHttpClient } = await import('./auth-session-manager');
    await authSessionManager.restore();
    const request = getAuthenticatedHttpClient().requestJson('/v1/me', { auth: 'required' });
    const outcome = expect(request).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    await vi.waitFor(() => expect(profileCalls).toBe(1));
    await authSessionManager.logout();
    await authSessionManager.loginWithKakao('other-provider', { termsAccepted: true, privacyAccepted: true });
    response.resolve(Response.json(status === 200 ? { privateData: 'old-member-only' } : { error: { code: 'SESSION_REVOKED' } }, { status }));
    await outcome;
    expect(profileCalls).toBe(1);
    expect(authSessionManager.getSnapshot().session?.userId).toBe('other-member');
    expect(mocks.stored?.refreshToken).toBe('other-refresh');
  });

  it('does not let a failed old restoration clear a newer Kakao session', async () => {
    const response = deferred<Response>();
    mocks.fetch.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith('/v1/auth/refresh')) return response.promise;
      if (String(url).endsWith('/v1/auth/kakao')) return Response.json(issued('other-member', 'other-refresh'));
      return Response.json({ success: true });
    });
    const { authSessionManager } = await import('./auth-session-manager');
    const restore = authSessionManager.restore();
    await vi.waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    await authSessionManager.loginWithKakao('other-provider', { termsAccepted: true, privacyAccepted: true });
    response.resolve(Response.json({ error: { code: 'INVALID_REFRESH_TOKEN' } }, { status: 401 }));
    await expect(restore).resolves.toBeNull();
    expect(authSessionManager.getSnapshot().session?.userId).toBe('other-member');
    expect(mocks.stored?.refreshToken).toBe('other-refresh');
  });

  it('rejects old-account JSON even when logout happens while the body is streaming', async () => {
    const body = deferred<string>();
    let readingBody = false;
    mocks.fetch.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith('/v1/auth/refresh')) return Response.json(issued());
      if (String(url).endsWith('/v1/me')) {
        const response = Response.json({});
        response.text = () => { readingBody = true; return body.promise; };
        return response;
      }
      return Response.json({ success: true });
    });
    const { authSessionManager, getAuthenticatedHttpClient } = await import('./auth-session-manager');
    await authSessionManager.restore();
    const request = getAuthenticatedHttpClient().requestJson('/v1/me', { auth: 'required' });
    const outcome = expect(request).rejects.toMatchObject({ code: 'AUTH_SESSION_CHANGED' });
    await vi.waitFor(() => expect(readingBody).toBe(true));
    await authSessionManager.logout();
    body.resolve(JSON.stringify({ privateData: 'old-member-only' }));
    await outcome;
    expect(mocks.stored).toBeNull();
  });
});

describe('process restart authentication', () => {
  it('shares one refresh rotation between restoration and protected screen requests', async () => {
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    let refreshCalls = 0;
    mocks.fetch.mockImplementation(async (url: string | URL) => {
      if (String(url).endsWith('/v1/auth/refresh')) {
        const attempt = ++refreshCalls;
        await barrier;
        if (attempt > 1) return Response.json({ error: { code: 'INVALID_REFRESH_TOKEN', message: 'rotated' } }, { status: 401 });
        return Response.json({
          accessToken: 'new-access', accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
          refreshToken: 'new-refresh', refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          sessionId: 'session', user: { id: 'member', email: null, phoneNumber: null, name: '회원', role: 'MEMBER', onboardingCompletedAt: null },
        });
      }
      return Response.json({ id: 'member' });
    });
    const { authSessionManager, getAuthenticatedHttpClient } = await import('./auth-session-manager');
    const restore = authSessionManager.restore();
    const request = getAuthenticatedHttpClient().requestJson('/v1/me', { auth: 'required' });
    await vi.waitFor(() => expect(refreshCalls).toBeGreaterThan(0));
    release();
    const result = await Promise.allSettled([restore, request]);
    expect(refreshCalls).toBe(1);
    expect(result.every((entry) => entry.status === 'fulfilled')).toBe(true);
    expect(authSessionManager.getSnapshot().status).toBe('authenticated');
    expect(mocks.stored?.refreshToken).toBe('new-refresh');
  });
});
