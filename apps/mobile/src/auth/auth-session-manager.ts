import { ApiError } from '@/api/api-error';
import {
  createHttpClient,
  isTerminalAuthenticationFailure,
  type AuthTokenSource,
  type HttpClient,
} from '@/api/http-client';
import { isRetryableAuthRestoreError } from '@/auth/auth-restore-retry';
import { getMobileEnvironment } from '@/config/env';
import { sessionStore, type StoredSession } from '@/auth/session-store';
import type {
  AuthSession,
  EmailCodeChallenge,
  EmailCodeRequestInput,
  EmailCodeVerificationInput,
  IssuedSession,
  KakaoLoginInput,
  PhoneCodeChallenge,
  PhoneCodeRequestInput,
  PhoneCodeVerificationInput,
} from '@/types';

export interface AuthManagerSnapshot {
  status: 'idle' | 'restoring' | 'anonymous' | 'authenticated';
  session: AuthSession | null;
  restoreError?: unknown;
}

type AuthListener = (snapshot: AuthManagerSnapshot) => void;

let accessToken: string | null = null;
let persistedSession: StoredSession | null = null;
let snapshot: AuthManagerSnapshot = { status: 'idle', session: null };
let restorePromise: Promise<AuthSession | null> | null = null;
let tokenRefreshPromise: Promise<string | null> | null = null;
let anonymousClient: { baseUrl: string; client: HttpClient } | null = null;
let authenticatedClient: { baseUrl: string; client: HttpClient } | null = null;
let sessionRevision = 0;
let storageQueue: Promise<void> = Promise.resolve();
let localCleanup: Promise<void> = Promise.resolve();
const listeners = new Set<AuthListener>();

function serializeStorage<T>(action: () => Promise<T>): Promise<T> {
  const next = storageQueue.then(action, action);
  storageQueue = next.then(() => undefined, () => undefined);
  return next;
}

function invalidateInFlightAuthentication() {
  sessionRevision += 1;
  restorePromise = null;
  tokenRefreshPromise = null;
  return sessionRevision;
}

function assertCurrentRevision(revision: number) {
  if (revision !== sessionRevision) {
    throw new ApiError({ status: 0, code: 'AUTH_SESSION_CHANGED', message: '로그인 상태가 바뀌었습니다. 다시 시도해 주세요.' });
  }
}

async function revokeIssuedSession(refreshToken: string) {
  if (typeof refreshToken !== 'string' || !refreshToken) return;
  await getAnonymousClient().requestJson('/v1/auth/logout', {
    method: 'POST', auth: 'none', json: { refreshToken }, timeoutMs: 5_000,
  }).catch(() => undefined);
}

function publish(next: AuthManagerSnapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener(snapshot));
}

function getAnonymousClient() {
  const { apiUrl } = getMobileEnvironment();
  if (anonymousClient?.baseUrl !== apiUrl) {
    anonymousClient = { baseUrl: apiUrl, client: createHttpClient({ baseUrl: apiUrl }) };
  }
  return anonymousClient.client;
}

function parseExpiry(value: string, field: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
    throw new ApiError({
      status: 0,
      code: 'INVALID_AUTH_RESPONSE',
      message: `서버의 ${field} 정보가 올바르지 않습니다.`,
    });
  }
  return timestamp;
}

function toPublicSession(issued: IssuedSession): AuthSession {
  return {
    userId: issued.user.id,
    email: issued.user.email ?? '',
    phoneNumber: issued.user.phoneNumber,
    displayName: issued.user.name,
    role: issued.user.role.toLocaleLowerCase('en-US') as AuthSession['role'],
    sessionId: issued.sessionId,
    accessTokenExpiresAt: issued.accessTokenExpiresAt,
    refreshTokenExpiresAt: issued.refreshTokenExpiresAt,
    onboardingCompletedAt: issued.user.onboardingCompletedAt,
    signedInAt: new Date().toISOString(),
  };
}

async function installIssuedSession(issued: IssuedSession, revision: number, newLogin = false) {
  try {
    assertCurrentRevision(revision);
  } catch (error) {
    await revokeIssuedSession(issued.refreshToken);
    throw error;
  }
  const refreshTokenExpiresAt = parseExpiry(
    issued.refreshTokenExpiresAt,
    'refresh token 만료 시간',
  );
  parseExpiry(issued.accessTokenExpiresAt, 'access token 만료 시간');

  try {
    const saved = await serializeStorage(() => {
      assertCurrentRevision(revision);
      return sessionStore.write({
        userId: issued.user.id,
        refreshToken: issued.refreshToken,
        sessionId: issued.sessionId,
        refreshTokenExpiresAt,
      });
    });
    assertCurrentRevision(revision);
    persistedSession = saved;
  } catch (error) {
    if (revision !== sessionRevision) {
      await revokeIssuedSession(issued.refreshToken);
      assertCurrentRevision(revision);
    }
    accessToken = null;
    persistedSession = null;
    await clearLocalSession();
    await revokeIssuedSession(issued.refreshToken);
    throw new ApiError({
      status: 0,
      code: 'SESSION_STORAGE_FAILED',
      message: '안전한 로그인 정보를 기기에 저장하지 못했습니다.',
      cause: error,
    });
  }

  accessToken = issued.accessToken;
  // Requests begun under the previous account cannot deliver data to this login.
  if (newLogin) invalidateInFlightAuthentication();
  const session = toPublicSession(issued);
  publish({ status: 'authenticated', session });
  return session;
}

async function clearLocalSession(restoreError?: unknown) {
  invalidateInFlightAuthentication();
  accessToken = null;
  persistedSession = null;
  publish({
    status: 'anonymous',
    session: null,
    ...(restoreError === undefined ? {} : { restoreError }),
  });
  localCleanup = serializeStorage(async () => {
    // Serialized before a newer login's write, including an uncancellable old write.
    await sessionStore.clear().catch(() => undefined);
  });
  await localCleanup;
}

async function performRefreshAccessToken(revision: number) {
  await localCleanup;
  assertCurrentRevision(revision);
  const stored = persistedSession ?? await serializeStorage(() => sessionStore.read());
  assertCurrentRevision(revision);
  persistedSession = stored;
  if (!persistedSession) {
    accessToken = null;
    return null;
  }

  const response = await getAnonymousClient().requestJson<IssuedSession>('/v1/auth/refresh', {
    method: 'POST',
    auth: 'none',
    json: { refreshToken: persistedSession.refreshToken },
  });
  await installIssuedSession(response.body, revision);
  return accessToken;
}

function refreshAccessToken() {
  // Restoration and screen requests use different HTTP paths. Share rotation at
  // the session owner so they cannot both spend the same stored refresh token.
  if (!tokenRefreshPromise) {
    const pending = performRefreshAccessToken(sessionRevision).finally(() => {
      if (tokenRefreshPromise === pending) tokenRefreshPromise = null;
    });
    tokenRefreshPromise = pending;
  }
  return tokenRefreshPromise;
}

const tokenSource: AuthTokenSource = {
  getAccessToken: () => accessToken,
  getSessionRevision: () => sessionRevision,
  refreshAccessToken,
  onAuthenticationFailure: (error) =>
    isTerminalAuthenticationFailure(error) ? clearLocalSession(error) : undefined,
};

export function getAuthenticatedHttpClient() {
  const { apiUrl } = getMobileEnvironment();
  if (authenticatedClient?.baseUrl !== apiUrl) {
    authenticatedClient = {
      baseUrl: apiUrl,
      client: createHttpClient({ baseUrl: apiUrl, auth: tokenSource }),
    };
  }
  return authenticatedClient.client;
}

export const authSessionManager = {
  getSnapshot() {
    return snapshot;
  },

  subscribe(listener: AuthListener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  restore() {
    if (restorePromise) {
      return restorePromise;
    }
    if (snapshot.status === 'authenticated') {
      return Promise.resolve(snapshot.session);
    }

    const revision = sessionRevision;
    publish({ status: 'restoring', session: null });
    const pending = Promise.resolve().then(async () => {
      try {
        await localCleanup;
        assertCurrentRevision(revision);
        const stored = await serializeStorage(() => sessionStore.read());
        assertCurrentRevision(revision);
        persistedSession = stored;
        if (!persistedSession) {
          publish({ status: 'anonymous', session: null });
          return null;
        }

        await refreshAccessToken();
        assertCurrentRevision(revision);
        return snapshot.session;
      } catch (error) {
        if (revision !== sessionRevision) return null;
        const preserveCredential = isRetryableAuthRestoreError(error);
        accessToken = null;
        if (!preserveCredential) {
          persistedSession = null;
          await serializeStorage(() => sessionStore.clear()).catch(() => undefined);
          if (revision !== sessionRevision) return null;
        }
        publish({ status: 'anonymous', session: null, restoreError: error });
        return null;
      } finally {
        if (restorePromise === pending) restorePromise = null;
      }
    });
    restorePromise = pending;
    return pending;
  },

  async requestEmailCode(input: EmailCodeRequestInput) {
    const response = await getAnonymousClient().requestJson<EmailCodeChallenge>(
      '/v1/auth/email/request',
      { method: 'POST', auth: 'none', json: { email: input.email } },
    );
    return response.body;
  },

  async requestPhoneCode(input: PhoneCodeRequestInput) {
    const response = await getAnonymousClient().requestJson<PhoneCodeChallenge>(
      '/v1/auth/phone/request',
      { method: 'POST', auth: 'none', json: { phoneNumber: input.phoneNumber } },
    );
    return response.body;
  },

  async verifyEmailCode(input: EmailCodeVerificationInput) {
    const revision = invalidateInFlightAuthentication();
    const response = await getAnonymousClient().requestJson<IssuedSession>(
      '/v1/auth/email/verify',
      {
        method: 'POST',
        auth: 'none',
        json: {
          challengeId: input.challengeId,
          email: input.email,
          code: input.code,
          name: input.displayName,
          clientType: 'ANDROID',
          termsAccepted: input.termsAccepted,
          privacyAccepted: input.privacyAccepted,
        },
      },
    );
    return installIssuedSession(response.body, revision, true);
  },

  async verifyPhoneCode(input: PhoneCodeVerificationInput) {
    const revision = invalidateInFlightAuthentication();
    const response = await getAnonymousClient().requestJson<IssuedSession>(
      '/v1/auth/phone/verify',
      {
        method: 'POST',
        auth: 'none',
        json: {
          challengeId: input.challengeId,
          phoneNumber: input.phoneNumber,
          code: input.code,
          name: input.displayName,
          clientType: 'ANDROID',
          termsAccepted: input.termsAccepted,
          privacyAccepted: input.privacyAccepted,
        },
      },
    );
    return installIssuedSession(response.body, revision, true);
  },

  async loginWithKakao(accessToken: string, input: KakaoLoginInput) {
    const revision = invalidateInFlightAuthentication();
    const response = await getAnonymousClient().requestJson<IssuedSession>('/v1/auth/kakao', {
      method: 'POST',
      auth: 'none',
      json: {
        accessToken,
        clientType: 'ANDROID',
        termsAccepted: input.termsAccepted,
        privacyAccepted: input.privacyAccepted,
      },
    });
    return installIssuedSession(response.body, revision, true);
  },

  async logout() {
    const previous = persistedSession;
    invalidateInFlightAuthentication();
    accessToken = null;
    persistedSession = null;
    publish({ status: 'anonymous', session: null });
    let refreshToken = previous?.refreshToken;
    localCleanup = serializeStorage(async () => {
      refreshToken ??= (await sessionStore.read().catch(() => null))?.refreshToken;
      await sessionStore.clear().catch(() => undefined);
    });
    await localCleanup;
    if (refreshToken) await revokeIssuedSession(refreshToken);
  },
};
