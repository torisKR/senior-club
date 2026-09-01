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
let anonymousClient: { baseUrl: string; client: HttpClient } | null = null;
let authenticatedClient: { baseUrl: string; client: HttpClient } | null = null;
const listeners = new Set<AuthListener>();

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

async function installIssuedSession(issued: IssuedSession) {
  const refreshTokenExpiresAt = parseExpiry(
    issued.refreshTokenExpiresAt,
    'refresh token 만료 시간',
  );
  parseExpiry(issued.accessTokenExpiresAt, 'access token 만료 시간');

  try {
    persistedSession = await sessionStore.write({
      userId: issued.user.id,
      refreshToken: issued.refreshToken,
      sessionId: issued.sessionId,
      refreshTokenExpiresAt,
    });
  } catch (error) {
    accessToken = null;
    persistedSession = null;
    await sessionStore.clear().catch(() => undefined);
    throw new ApiError({
      status: 0,
      code: 'SESSION_STORAGE_FAILED',
      message: '안전한 로그인 정보를 기기에 저장하지 못했습니다.',
      cause: error,
    });
  }

  accessToken = issued.accessToken;
  const session = toPublicSession(issued);
  publish({ status: 'authenticated', session });
  return session;
}

async function clearLocalSession(restoreError?: unknown) {
  accessToken = null;
  persistedSession = null;
  await sessionStore.clear().catch(() => undefined);
  publish({
    status: 'anonymous',
    session: null,
    ...(restoreError === undefined ? {} : { restoreError }),
  });
}

async function refreshAccessToken() {
  persistedSession ??= await sessionStore.read();
  if (!persistedSession) {
    accessToken = null;
    return null;
  }

  const response = await getAnonymousClient().requestJson<IssuedSession>('/v1/auth/refresh', {
    method: 'POST',
    auth: 'none',
    json: { refreshToken: persistedSession.refreshToken },
  });
  await installIssuedSession(response.body);
  return accessToken;
}

const tokenSource: AuthTokenSource = {
  getAccessToken: () => accessToken,
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

    publish({ status: 'restoring', session: null });
    restorePromise = (async () => {
      try {
        persistedSession = await sessionStore.read();
        if (!persistedSession) {
          publish({ status: 'anonymous', session: null });
          return null;
        }

        await refreshAccessToken();
        return snapshot.session;
      } catch (error) {
        const preserveCredential = isRetryableAuthRestoreError(error);
        accessToken = null;
        if (!preserveCredential) {
          persistedSession = null;
          await sessionStore.clear().catch(() => undefined);
        }
        publish({ status: 'anonymous', session: null, restoreError: error });
        return null;
      } finally {
        restorePromise = null;
      }
    })();

    return restorePromise;
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
    return installIssuedSession(response.body);
  },

  async verifyPhoneCode(input: PhoneCodeVerificationInput) {
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
    return installIssuedSession(response.body);
  },

  async loginWithKakao(accessToken: string, input: KakaoLoginInput) {
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
    return installIssuedSession(response.body);
  },

  async logout() {
    const refreshToken = persistedSession?.refreshToken ?? (await sessionStore.read())?.refreshToken;
    accessToken = null;
    persistedSession = null;
    publish({ status: 'anonymous', session: null });
    await sessionStore.clear().catch(() => undefined);

    if (!refreshToken) {
      return;
    }
    try {
      await getAnonymousClient().requestJson<{ success: true }>('/v1/auth/logout', {
        method: 'POST',
        auth: 'none',
        json: { refreshToken },
      });
    } catch {
      // Local logout remains authoritative when the network is unavailable.
    }
  },
};
