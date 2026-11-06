import { describe, expect, it } from 'vitest';

import { reviewerErrorMessage, ReviewerLoginError } from './reviewer-error-message';

describe('safe Korean reviewer errors', () => {
  it.each([
    { code: 'auth/invalid-credential', message: 'private fixture email/password' },
    { code: 'REVIEWER_NOT_ALLOWED', message: 'private fixture UID/token' },
    { code: 'FIREBASE_NOT_CONFIGURED', message: 'private project settings' },
    new Error('private fixture password'),
    { code: 'toString', message: 'private fixture data' },
    null,
  ])('never displays unknown server or Firebase error text (%j)', (error) => {
    const message = reviewerErrorMessage(error);
    expect(message).toContain('심사 계정으로 로그인하지 못했습니다');
    expect(message).not.toContain('private');
  });
  it('uses actionable network and session-change messages', () => {
    expect(reviewerErrorMessage({ code: 'auth/network-request-failed' })).toContain('인터넷 연결');
    expect(reviewerErrorMessage({ code: 'AUTH_SESSION_CHANGED' })).toContain('로그인 상태가 바뀌었습니다');
    expect(reviewerErrorMessage({ code: 'REVIEWER_RATE_LIMITED', message: 'private server detail' })).toContain('잠시 후');
    expect(reviewerErrorMessage({ code: 'REVIEWER_LOGIN_UNAVAILABLE', message: 'private server detail' })).toContain('로그인 연결');
    expect(new ReviewerLoginError('REVIEWER_LOGIN_UNSUPPORTED').message).toContain('Android');
  });
});
