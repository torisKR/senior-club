import { describe, expect, it } from 'vitest';

import type { User } from '@/types/domain';

import { buildContactProfileUpdate } from './profile-edit';

const user: User = { id: 'kakao-user', name: '등산친구', email: '', phoneNumber: '+821011112222', birthYear: 1953, region: '부산광역시', ageGroup: '70대', role: 'member', interestIds: ['photo'], joinedClubIds: ['club-1'] };

describe('freely editable profile contact', () => {
  it('saves a nickname and unverified phone while preserving actual birth year and interests', () => {
    expect(buildContactProfileUpdate({ name: '  초록별  ', phoneNumber: '010-1234-5678', region: ' 부산 해운대구 ' }, user, ['photo', 'reading'])).toEqual({
      name: '초록별', phoneNumber: '+821012345678', region: '부산 해운대구', birthYear: 1953, interestSlugs: ['photo', 'reading'],
    });
  });
  it('clears the optional contact explicitly, without a verification token or consent', () => {
    const input = buildContactProfileUpdate({ name: '새로운 별명', phoneNumber: '', region: '부산광역시' }, user, ['photo']);
    expect(input.phoneNumber).toBeNull();
    expect(input).not.toHaveProperty('idToken');
    expect(input).not.toHaveProperty('phoneVerifiedAt');
  });
  it('does not invent a birth year or interests for incomplete server profiles', () => {
    expect(() => buildContactProfileUpdate({ name: '새로운 별명', phoneNumber: '', region: '부산광역시' }, { ...user, birthYear: undefined }, ['photo'])).toThrow();
    expect(() => buildContactProfileUpdate({ name: '새로운 별명', phoneNumber: '', region: '부산광역시' }, user, [])).toThrow();
  });
  it.each(['별', '<script>', 'x'.repeat(41)])('rejects names inconsistent with the server contract %s', (name) => {
    expect(() => buildContactProfileUpdate({ name, phoneNumber: '', region: '부산광역시' }, user, ['photo'])).toThrow();
  });
  it('accepts names up to the server maximum of 40 characters', () => {
    expect(buildContactProfileUpdate({ name: '별'.repeat(40), phoneNumber: '', region: '부산광역시' }, user, ['photo']).name).toHaveLength(40);
  });
});
