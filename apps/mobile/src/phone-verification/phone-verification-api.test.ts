import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ProfileStateSnapshot } from '@/api/profile-api-core';

import { verifyNativePhoneToken } from './phone-verification-api';

const mocks = vi.hoisted(() => ({ request: vi.fn(), me: vi.fn() }));
vi.mock('@/auth/auth-session-manager', () => ({ getAuthenticatedHttpClient: () => ({ requestJson: mocks.request }) }));
vi.mock('@/api/profile-api', () => ({ profileApi: { me: mocks.me } }));

const profile: ProfileStateSnapshot = {
  user: { id: 'kakao-user', name: '초록별', email: '', phoneNumber: '+821012345678', phoneVerifiedAt: '2026-09-30T00:00:00.000Z', birthYear: 1962, ageGroup: '60대', region: '서울', role: 'member', interestIds: ['photo'], joinedClubIds: [] },
  selectedInterestIds: ['photo'], onboardingCompleted: true, onboardingCompletedAt: '2026-09-01T00:00:00Z',
};

describe('native phone proof API bridge', () => {
  beforeEach(() => {
    mocks.request.mockReset().mockResolvedValue({ body: { success: true } });
    mocks.me.mockReset().mockResolvedValue(profile);
  });
  it('posts only the Firebase proof through the existing authenticated client, then requests profile', async () => {
    const signal = new AbortController().signal;
    await expect(verifyNativePhoneToken('phone-proof-token', '010-1234-5678', 'kakao-user', signal)).resolves.toEqual(profile);
    expect(mocks.request).toHaveBeenCalledWith('/v1/auth/firebase/verify-phone', {
      method: 'POST', auth: 'required', json: { idToken: 'phone-proof-token' }, signal,
    });
    expect(mocks.me).toHaveBeenCalledWith(signal);
    expect(mocks.request.mock.invocationCallOrder[0]).toBeLessThan(mocks.me.mock.invocationCallOrder[0]!);
  });
  it('does not load profile or claim verification when the backend rejects proof', async () => {
    mocks.request.mockRejectedValue(new Error('backend unavailable'));
    await expect(verifyNativePhoneToken('proof', '+821012345678', 'kakao-user')).rejects.toThrow();
    expect(mocks.me).not.toHaveBeenCalled();
  });
  it('requires an explicit successful backend result', async () => {
    mocks.request.mockResolvedValue({ body: { success: false } });
    await expect(verifyNativePhoneToken('proof', '+821012345678', 'kakao-user')).rejects.toMatchObject({ code: 'PHONE_LINK_FAILED' });
    expect(mocks.me).not.toHaveBeenCalled();
  });
  it('does not claim completion if the subsequent profile request fails', async () => {
    mocks.me.mockRejectedValue(new Error('profile request failed'));
    await expect(verifyNativePhoneToken('proof', '+821012345678', 'kakao-user')).rejects.toThrow('profile request failed');
  });
  it.each([{ id: 'different-user' }, { phoneNumber: '+821099998888' }, { phoneNumber: null }])('rejects stale/mismatched server identity %j', async (change) => {
    mocks.me.mockResolvedValue({ ...profile, user: { ...profile.user, ...change } });
    await expect(verifyNativePhoneToken('proof', '+821012345678', 'kakao-user')).rejects.toMatchObject({ code: 'PHONE_PROFILE_MISMATCH' });
  });
  it.each([undefined, null, 'invalid'])('never marks a contact verified without recorded metadata %s', async (phoneVerifiedAt) => {
    mocks.me.mockResolvedValue({ ...profile, user: { ...profile.user, phoneVerifiedAt } });
    await expect(verifyNativePhoneToken('proof', '+821012345678', 'kakao-user')).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_NOT_RECORDED' });
  });
});
