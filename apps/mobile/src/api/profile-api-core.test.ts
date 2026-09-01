import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  ageGroupFromBirthYear,
  type ApiProfile,
  toInterest,
  toProfileState,
  type UpdateProfileInput,
} from './profile-api-core';

const apiProfile: ApiProfile = {
  id: 'user-1',
  email: 'member@example.com',
  name: '김시니어',
  birthYear: 1962,
  region: '서울',
  gender: null,
  avatarUrl: null,
  bio: null,
  role: 'MEMBER',
  onboardingCompletedAt: '2026-07-30T00:00:00.000Z',
  interests: [
    { id: 'interest-hiking', slug: 'hiking', name: '등산', icon: 'mountain' },
    { id: 'interest-photo', slug: 'photo', name: '사진', icon: 'camera' },
  ],
};

describe('profile API contract mappers', () => {
  it('uses the stable interest slug as the mobile interest id', () => {
    expect(
      toInterest({
        id: 'database-id',
        slug: 'hiking',
        name: '등산',
        icon: 'mountain',
      }),
    ).toEqual({
      id: 'hiking',
      name: '등산',
      emoji: '🥾',
      description: '가까운 산과 둘레길을 함께 걸어요.',
    });
  });

  it('maps a /v1/me-compatible response without carrying fixture memberships', () => {
    expect(toProfileState(apiProfile)).toEqual({
      user: {
        id: 'user-1',
        name: '김시니어',
        email: 'member@example.com',
        birthYear: 1962,
        ageGroup: '60대',
        region: '서울',
        role: 'member',
        interestIds: ['hiking', 'photo'],
        joinedClubIds: [],
      },
      selectedInterestIds: ['hiking', 'photo'],
      onboardingCompleted: true,
      onboardingCompletedAt: '2026-07-30T00:00:00.000Z',
    });
  });

  it('keeps incomplete server profiles incomplete and deduplicates interest slugs', () => {
    const result = toProfileState({
      ...apiProfile,
      birthYear: null,
      region: null,
      onboardingCompletedAt: null,
      interests: [apiProfile.interests[0]!, apiProfile.interests[0]!],
    });

    expect(result.user.birthYear).toBeUndefined();
    expect(result.user.ageGroup).toBe('미설정');
    expect(result.user.region).toBe('');
    expect(result.selectedInterestIds).toEqual(['hiking']);
    expect(result.onboardingCompleted).toBe(false);
    expect(result.onboardingCompletedAt).toBeNull();
  });

  it('derives the display-only age group from the exact birth year', () => {
    expect(ageGroupFromBirthYear(1962, 2026)).toBe('60대');
    expect(ageGroupFromBirthYear(1940, 2026)).toBe('80대 이상');
  });

  it('keeps the update payload exact and server-compatible at type level', () => {
    const input = {
      name: '김시니어',
      region: '서울',
      birthYear: 1962,
      interestSlugs: ['hiking'],
    } satisfies UpdateProfileInput;

    expectTypeOf(input).toMatchTypeOf<UpdateProfileInput>();
  });
});
