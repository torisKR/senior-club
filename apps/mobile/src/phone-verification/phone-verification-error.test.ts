import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/api-error';

import { phoneVerificationErrorMessage } from './phone-verification-error';

describe('phone verification error UX', () => {
  it.each(['auth/invalid-verification-code', 'auth/session-expired', 'auth/quota-exceeded', 'auth/too-many-requests', 'auth/network-request-failed', 'auth/operation-not-allowed', 'auth/app-not-authorized', 'auth/web-context-cancelled'])('maps %s to a readable message without native credentials', (code) => {
    expect(phoneVerificationErrorMessage({ code, message: 'SECRET proof-token +821012345678' })).not.toMatch(/SECRET|proof-token|\+8210/);
  });
  it('does not expose unknown native errors', () => {
    expect(phoneVerificationErrorMessage(new Error('SECRET'))).not.toContain('SECRET');
  });
  it('retains authenticated session error instructions from the existing API mapper', () => {
    expect(phoneVerificationErrorMessage(new ApiError({ code: 'INVALID_SESSION', status: 401, message: 'invalid' }))).toContain('다시 로그인');
  });
});
