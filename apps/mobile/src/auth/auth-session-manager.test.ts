import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  stored: null as null | Record<string, unknown>,
  fetch: vi.fn(),
}));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('@/api/idempotency-key', () => ({ createNativeIdempotencyKey: () => '00000000-0000-4000-8000-000000000000' }));
vi.mock('@/config/env', () => ({ getMobileEnvironment: () => ({ apiUrl: 'https://api.example.org' }) }));
vi.mock('@/auth/session-store', () => ({ sessionStore: {
  read: async () => mocks.stored,
  write: async (value: Record<string, unknown>) => {
    mocks.stored = { ...value, version: 1, savedAt: Date.now() };
    return mocks.stored;
  },
  clear: async () => { mocks.stored = null; },
} }));

beforeEach(() => {
  vi.resetModules();
  mocks.fetch.mockReset();
  mocks.stored = {
    version: 1, userId: 'member', sessionId: 'session', refreshToken: 'old-refresh',
    refreshTokenExpiresAt: Date.now() + 86_400_000, savedAt: Date.now(),
  };
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
