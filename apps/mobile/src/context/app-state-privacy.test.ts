// @vitest-environment jsdom
import { act, createElement, useContext } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiProfile } from '@/api/profile-api-core';
import type { AppStateContextValue } from '@/types';

const mocks = vi.hoisted(() => ({
  secure: new Map<string, string>(),
  getSecure: vi.fn(), setSecure: vi.fn(), deleteSecure: vi.fn(), fetch: vi.fn(),
  unregister: vi.fn(),
  profile: {} as ApiProfile,
  applications: [] as unknown[],
  profileResponse: null as (() => Promise<Response>) | null,
}));

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: mocks.getSecure,
  setItemAsync: mocks.setSecure,
  deleteItemAsync: mocks.deleteSecure,
}));
vi.mock('expo/fetch', () => ({ fetch: mocks.fetch }));
vi.mock('@/config/env', () => ({
  EnvironmentConfigurationError: class extends Error {},
  getMobileEnvironment: () => ({ apiUrl: 'https://api.example.org' }),
}));
vi.mock('@/api/idempotency-key', () => ({
  createNativeIdempotencyKey: () => '00000000-0000-4000-8000-000000000000',
}));
vi.mock('@/auth/kakao-login', () => ({ requestKakaoAccessToken: vi.fn() }));
vi.mock('@/notifications/push-registration', () => ({
  unregisterCurrentAndroidDevice: mocks.unregister,
}));
vi.mock('react-native', () => ({
  Platform: { select: (options: { default: unknown }) => options.default },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  ActivityIndicator: () => createElement('span', null, 'loading'),
  View: ({ children }: { children?: import('react').ReactNode }) => createElement('div', null, children),
}));
vi.mock('@/components/ui', () => ({ AppText: 'span' }));
vi.mock('expo-router', () => ({
  Redirect: ({ href }: { href: string | { pathname: string } }) =>
    createElement('span', { 'data-redirect': typeof href === 'string' ? href : href.pathname }),
  useGlobalSearchParams: () => ({}),
  usePathname: () => '/home',
}));

const OLD_KEY = 'senior-club.app-state.v4';
const PREF_KEY = 'senior-club.ui-preferences.v1';
const SECURE_KEY = 'senior-club.session.v1';
const SENTINEL = 'private-profile-sentinel';
let root: Root | null = null;
let container: HTMLDivElement;
let current: AppStateContextValue | undefined;
let observed: AppStateContextValue[];

function issued() {
  return {
    accessToken: `${SENTINEL}-access`, refreshToken: `${SENTINEL}-rotated-refresh`,
    accessTokenExpiresAt: new Date(Date.now() + 900_000).toISOString(),
    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    sessionId: `${SENTINEL}-session`,
    user: {
      id: mocks.profile.id, email: mocks.profile.email, name: mocks.profile.name,
      phoneNumber: mocks.profile.phoneNumber, role: 'MEMBER',
      onboardingCompletedAt: mocks.profile.onboardingCompletedAt,
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function state() {
  if (!current) throw new Error('Missing mounted app state');
  return current;
}

async function mount() {
  const { AppStateContext, AppStateProvider } = await import('./app-state');
  const { RequireAuth } = await import('@/components/auth/require-auth');
  function Probe() {
    current = useContext(AppStateContext);
    if (current) observed.push(current);
    return createElement(RequireAuth, null, createElement('p', null, 'Authenticated page'));
  }
  root = createRoot(container);
  await act(async () => { root?.render(createElement(AppStateProvider, null, createElement(Probe))); });
}

async function unmount() {
  await act(async () => { root?.unmount(); });
  root = null;
}

async function settle(predicate: () => boolean) {
  for (let attempt = 0; attempt < 30; attempt++) {
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    if (predicate()) return;
  }
  throw new Error('App state did not settle');
}

function expectPreferenceOnlyBytes() {
  expect(Object.keys(localStorage)).toEqual([PREF_KEY]);
  expect(localStorage.getItem(PREF_KEY)).toBe('{"largeTextEnabled":true}');
  expect(localStorage.getItem(OLD_KEY)).toBeNull();
  expect(JSON.stringify(localStorage)).not.toContain(SENTINEL);
}

beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  mocks.secure.clear();
  mocks.getSecure.mockReset().mockImplementation(async (key: string) => mocks.secure.get(key) ?? null);
  mocks.setSecure.mockReset().mockImplementation(async (key: string, value: string) => { mocks.secure.set(key, value); });
  mocks.deleteSecure.mockReset().mockImplementation(async (key: string) => { mocks.secure.delete(key); });
  mocks.unregister.mockReset().mockResolvedValue(undefined);
  mocks.profileResponse = null;
  mocks.profile = {
    id: 'fresh-member', email: `${SENTINEL}@example.org`, phoneNumber: '+821055551234',
    phoneVerifiedAt: null, name: `${SENTINEL}-nickname`, birthYear: 1951,
    region: `${SENTINEL}-region`, gender: null, avatarUrl: null, bio: null, role: 'MEMBER',
    onboardingCompletedAt: '2026-10-01T00:00:00Z',
    interests: [{ id: `${SENTINEL}-interest-id`, slug: 'photo', name: '사진', icon: 'camera' }],
  };
  mocks.applications = [{
    id: `${SENTINEL}-application`, eventId: `${SENTINEL}-event`, userId: 'fresh-member',
    status: 'APPROVED', attendance: 'NOT_CHECKED', appliedAt: '2026-10-01T00:00:00.000Z',
    decidedAt: '2026-10-01T00:00:00.000Z', canceledAt: null, updatedAt: '2026-10-01T00:00:00.000Z',
    event: {
      id: `${SENTINEL}-event`, title: `${SENTINEL}-title`, startAt: '2026-11-01T00:00:00.000Z',
      locationName: `${SENTINEL}-location`, club: { slug: 'photo', title: `${SENTINEL}-club` },
    },
  }];
  mocks.fetch.mockReset().mockImplementation(async (url: string | URL, options: RequestInit) => {
    const path = new URL(String(url)).pathname;
    if (path === '/v1/auth/refresh') return Response.json(issued());
    if (path === '/v1/me') return mocks.profileResponse?.() ?? Response.json(mocks.profile);
    if (path === '/v1/me/profile' && options.method === 'PATCH') {
      mocks.profile = { ...mocks.profile, onboardingCompletedAt: '2026-10-01T00:00:00Z' };
      return Response.json(mocks.profile);
    }
    if (path === '/v1/me/applications') return Response.json(mocks.applications);
    if (path === '/v1/interests') return Response.json({ data: mocks.profile.interests });
    if (path === '/v1/events') return Response.json({ data: [], page: { nextCursor: null, hasNextPage: false } });
    if (path === '/v1/me/deletion-request') return Response.json({
      id: 'fixture-deletion', status: 'REQUESTED', requestedAt: '2026-10-01T00:00:00.000Z',
      scheduledFor: '2026-10-08T00:00:00.000Z', completedAt: null,
    });
    if (path === '/v1/auth/logout') return Response.json({ success: true });
    throw new Error(`Unexpected fixture request: ${path}`);
  });
  localStorage.clear();
  localStorage.setItem(OLD_KEY, JSON.stringify({
    largeTextEnabled: true, onboardingCompleted: true,
    session: { userId: 'old-admin', role: 'admin' },
    user: { id: 'old-admin', name: 'stale-private-name', phoneNumber: '+821099999999' },
    selectedInterestIds: ['old-private-interest'], participations: ['old-private-activity'],
  }));
  mocks.secure.set(SECURE_KEY, JSON.stringify({
    version: 1, userId: 'fresh-member', refreshToken: `${SENTINEL}-old-refresh`,
    sessionId: 'old-session', savedAt: Date.now(), refreshTokenExpiresAt: Date.now() + 86_400_000,
  }));
  container = document.createElement('div');
  document.body.append(container);
  current = undefined;
  observed = [];
});

afterEach(async () => {
  await unmount();
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('provider hydration with preference-only persistence', () => {
  it('restores SecureStore credentials, refreshes profile on cold restart, and retains font/access guards', async () => {
    const refresh = deferred<Response>();
    const defaultFetch = mocks.fetch.getMockImplementation()!;
    mocks.fetch.mockImplementation((url: string | URL, options: RequestInit) =>
      new URL(String(url)).pathname === '/v1/auth/refresh' ? refresh.promise : defaultFetch(url, options));
    await mount();
    expect(state().isHydrated).toBe(false);
    expect(state().session).toBeNull();
    expect(state().profile.id).toBe('anonymous');
    expect(state().onboardingCompleted).toBe(false);
    expect(container.textContent).not.toContain('Authenticated page');
    expectPreferenceOnlyBytes();

    await act(async () => { refresh.resolve(Response.json(issued())); });
    await settle(() => state().profile.birthYear === 1951 && state().participations.length === 1);
    expect(state().isAuthenticated).toBe(true);
    expect(state().profile).toMatchObject({ id: 'fresh-member', name: `${SENTINEL}-nickname`, region: `${SENTINEL}-region` });
    expect(state().selectedInterestIds).toEqual(['photo']);
    expect(state().participations[0]).toMatchObject({ id: `${SENTINEL}-application`, userId: 'fresh-member', status: 'approved' });
    expect(state().getParticipationStatus(`${SENTINEL}-event`)).toBe('approved');
    expect(state().largeTextEnabled).toBe(true);
    expect(container.textContent).toContain('Authenticated page');
    expect(mocks.setSecure).toHaveBeenCalledWith(SECURE_KEY, expect.any(String), { keychainAccessible: 'device-only' });
    expect(mocks.secure.get(SECURE_KEY)).toContain(`${SENTINEL}-rotated-refresh`);
    expect(mocks.secure.get(SECURE_KEY)).not.toContain(`${SENTINEL}-access`);
    expect(mocks.secure.get(SECURE_KEY)).not.toContain(mocks.profile.name);
    const profileRequest = mocks.fetch.mock.calls.find(([url]) => new URL(String(url)).pathname === '/v1/me')!;
    expect(new Headers(profileRequest[1].headers).get('authorization')).toBe(`Bearer ${SENTINEL}-access`);
    expectPreferenceOnlyBytes();

    await unmount();
    vi.resetModules(); // A fresh auth manager must read the secure credential again.
    mocks.profile.name = `${SENTINEL}-server-edited`;
    mocks.profile.region = `${SENTINEL}-new-region`;
    mocks.fetch.mockImplementation(defaultFetch);
    observed = [];
    await mount();
    await settle(() => state().profile.region === `${SENTINEL}-new-region` && state().participations.length === 1);
    expect(observed[0].session).toBeNull();
    expect(observed[0].profile.id).toBe('anonymous');
    expect(state().profile.name).toBe(`${SENTINEL}-server-edited`);
    expect(state().largeTextEnabled).toBe(true);
    expect(mocks.getSecure.mock.calls.filter(([key]) => key === SECURE_KEY)).toHaveLength(2);
    expect(mocks.fetch.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/v1/me')).toHaveLength(2);
    expectPreferenceOnlyBytes();
  });

  it('does not republish account data if token rotation finishes while logout awaits push cleanup', async () => {
    await mount();
    await settle(() => state().profile.birthYear === 1951);
    const refresh = deferred<Response>();
    const unregister = deferred<void>();
    mocks.unregister.mockImplementation(() => unregister.promise);
    const defaultFetch = mocks.fetch.getMockImplementation()!;
    let expired = false;
    mocks.fetch.mockImplementation((url: string | URL, options: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === '/v1/auth/refresh') return refresh.promise;
      if (path === '/v1/me' && !expired) {
        expired = true;
        return Promise.resolve(Response.json({ error: { code: 'AUTHENTICATION_REQUIRED' } }, { status: 401 }));
      }
      return defaultFetch(url, options);
    });
    const { getAuthenticatedHttpClient } = await import('@/auth/auth-session-manager');
    const request = getAuthenticatedHttpClient().requestJson('/v1/me', { auth: 'required' });
    await settle(() => mocks.fetch.mock.calls.filter(([url]) => new URL(String(url)).pathname === '/v1/auth/refresh').length === 2);
    let logout!: Promise<void>;
    await act(async () => { logout = state().signOut(); });
    expect(state().session).toBeNull();
    await act(async () => { refresh.resolve(Response.json(issued())); await request; });
    // Generic persistence no longer drives the UI; session publication must also stay cleared.
    try {
      expect(state().session).toBeNull();
      expect(state().profile.id).toBe('anonymous');
    } finally {
      await act(async () => { unregister.resolve(); await logout; });
    }
    expect(mocks.secure.has(SECURE_KEY)).toBe(false);
    expectPreferenceOnlyBytes();
  });

  it('does not grant access or revive a cached profile without a secure session', async () => {
    mocks.secure.clear();
    await mount();
    await settle(() => state().isHydrated);
    expect(state().isAuthenticated).toBe(false);
    expect(state().profile.id).toBe('anonymous');
    expect(state().onboardingCompleted).toBe(false);
    expect(state().selectedInterestIds).toEqual([]);
    expect(state().participations).toEqual([]);
    expect(container.querySelector('[data-redirect]')?.getAttribute('data-redirect')).toContain('/login');
    expect(mocks.fetch.mock.calls.some(([url]) => new URL(String(url)).pathname === '/v1/me')).toBe(false);
    expectPreferenceOnlyBytes();
  });

  it('clears memory and secure credentials despite generic cache cleanup failures and a late profile response', async () => {
    const profile = deferred<Response>();
    mocks.profileResponse = () => profile.promise;
    await mount();
    await settle(() => state().isHydrated && state().isAuthenticated);
    localStorage.setItem(OLD_KEY, JSON.stringify({ largeTextEnabled: true, user: { name: 'stale-private-name' } }));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('write unavailable'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('delete unavailable'); });
    await act(async () => { await state().signOut(); });
    expect(state().session).toBeNull();
    expect(state().profile.id).toBe('anonymous');
    expect(state().onboardingCompleted).toBe(false);
    expect(state().largeTextEnabled).toBe(true);
    expect(mocks.secure.has(SECURE_KEY)).toBe(false);
    expect(mocks.deleteSecure).toHaveBeenCalledWith(SECURE_KEY, { keychainAccessible: 'device-only' });
    await act(async () => { profile.resolve(Response.json(mocks.profile)); });
    expect(state().profile.id).toBe('anonymous');
    await unmount();
    vi.resetModules();
    await mount();
    await settle(() => state().isHydrated);
    expect(state().session).toBeNull();
    expect(state().profile.id).toBe('anonymous');
    expect(state().largeTextEnabled).toBe(true);
    expect(container.textContent).not.toContain('Authenticated page');
  });

  it('uses the server onboarding result without persisting completion, interests or profile bytes', async () => {
    mocks.profile.onboardingCompletedAt = null;
    await mount();
    await settle(() => state().profile.birthYear === 1951);
    expect(state().onboardingCompleted).toBe(false);
    expect(container.querySelector('[data-redirect]')?.getAttribute('data-redirect')).toContain('/onboarding');
    await act(async () => { await state().completeOnboarding({
      name: mocks.profile.name, region: mocks.profile.region!, birthYear: 1951, interestSlugs: ['photo'],
    }); });
    expect(state().onboardingCompleted).toBe(true);
    expect(state().selectedInterestIds).toEqual(['photo']);
    expect(container.textContent).toContain('Authenticated page');
    expectPreferenceOnlyBytes();
  });

  it('clears deleted-account memory even when push and generic-storage cleanup fail', async () => {
    await mount();
    await settle(() => state().profile.birthYear === 1951 && state().participations.length === 1);
    mocks.unregister.mockRejectedValueOnce(new Error('fixture push cleanup failed'));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('write unavailable'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('delete unavailable'); });
    let result: { status: string } | undefined;
    await act(async () => { result = await state().deleteAccount('fixture reason'); });
    expect(result?.status).toBe('REQUESTED');
    expect(state().session).toBeNull();
    expect(state().profile.id).toBe('anonymous');
    expect(state().participations).toEqual([]);
    expect(state().selectedInterestIds).toEqual([]);
    expect(state().onboardingCompleted).toBe(false);
    expect(state().largeTextEnabled).toBe(true);
    expect(mocks.secure.has(SECURE_KEY)).toBe(false);
    expectPreferenceOnlyBytes();
  });
});
