import { describe, expect, it } from 'vitest';

import type { AuthSession, PersistedAppState, User } from '@/types';

import {
  createAnonymousUser,
  createDefaultAppState,
  normalizePersistedAppState,
} from './persisted-app-state';

const session: AuthSession = {
  userId: 'user-a',
  email: 'server@example.com',
  displayName: '서버 이름',
  role: 'member',
  sessionId: 'session-a',
  accessTokenExpiresAt: '2026-07-30T10:00:00.000Z',
  refreshTokenExpiresAt: '2026-08-30T10:00:00.000Z',
  onboardingCompletedAt: '2026-07-29T10:00:00.000Z',
  signedInAt: '2026-07-29T10:00:00.000Z',
};

const cachedUser: User = {
  id: 'user-a',
  email: 'old@example.com',
  name: '캐시 이름',
  birthYear: 1962,
  ageGroup: '60대',
  region: '서울 마포구',
  role: 'leader',
  interestIds: ['hiking'],
  joinedClubIds: ['club-a'],
};

function persisted(overrides: Partial<PersistedAppState> = {}): PersistedAppState {
  return {
    ...createDefaultAppState(),
    session,
    user: cachedUser,
    onboardingCompleted: true,
    selectedInterestIds: ['hiking'],
    participations: [
      {
        id: 'application-a',
        eventId: 'event-a',
        userId: 'user-a',
        status: 'reviewed',
        appliedAt: '2026-07-29T10:00:00.000Z',
        updatedAt: '2026-07-30T10:00:00.000Z',
      },
    ],
    ...overrides,
  };
}

describe('persisted app state ownership', () => {
  it('starts with a neutral anonymous user and no member fixture data', () => {
    expect(createDefaultAppState()).toEqual({
      session: null,
      user: createAnonymousUser(),
      onboardingCompleted: false,
      largeTextEnabled: false,
      selectedInterestIds: [],
      participations: [],
    });
  });

  it('clears a previous member profile, interests, and participations after logout', () => {
    const state = normalizePersistedAppState(
      persisted({ session: null, largeTextEnabled: true }),
    );

    expect(state).toEqual({
      ...createDefaultAppState(),
      largeTextEnabled: true,
    });
  });

  it('preserves only the current session user offline cache', () => {
    const state = normalizePersistedAppState({
      ...persisted(),
      selectedInterestIds: ['hiking', 'hiking', 'photo'],
      participations: [
        ...persisted().participations,
        {
          id: 'application-other',
          eventId: 'event-other',
          userId: 'user-other',
          status: 'approved',
          appliedAt: '2026-07-29T10:00:00.000Z',
          updatedAt: '2026-07-30T10:00:00.000Z',
        },
      ],
    });

    expect(state.user).toMatchObject({
      id: 'user-a',
      email: 'server@example.com',
      name: '서버 이름',
      role: 'member',
      birthYear: 1962,
      region: '서울 마포구',
    });
    expect(state.selectedInterestIds).toEqual(['hiking', 'photo']);
    expect(state.participations).toHaveLength(1);
    expect(state.participations[0]).toMatchObject({
      id: 'application-a',
      userId: 'user-a',
      status: 'attended',
    });
  });

  it('drops cached member data when the authenticated account changes', () => {
    const nextSession: AuthSession = {
      ...session,
      userId: 'user-b',
      email: 'next@example.com',
      displayName: '다음 회원',
      sessionId: 'session-b',
      onboardingCompletedAt: null,
    };

    const state = normalizePersistedAppState({
      ...persisted(),
      session: nextSession,
    });

    expect(state.user).toEqual({
      id: 'user-b',
      email: 'next@example.com',
      phoneNumber: null,
      name: '다음 회원',
      role: 'member',
      ageGroup: '미설정',
      region: '',
      interestIds: [],
      joinedClubIds: [],
    });
    expect(state.onboardingCompleted).toBe(false);
    expect(state.selectedInterestIds).toEqual([]);
    expect(state.participations).toEqual([]);
  });

  it('fails closed for malformed persisted sessions', () => {
    const state = normalizePersistedAppState({
      ...persisted(),
      session: { userId: 'user-a' },
    });

    expect(state).toEqual(createDefaultAppState());
  });
});
