import { describe, expect, it, vi } from 'vitest';

import type { ProfileStateSnapshot } from '@/api/profile-api-core';

import type { PhoneAuthDriver, PhoneProofUser } from './phone-auth-driver';
import { PhoneVerificationController, PHONE_RESEND_DELAY_MS } from './phone-verification-controller';

const profile: ProfileStateSnapshot = {
  user: { id: 'kakao-user', name: '초록별', email: '', phoneNumber: '+821012345678', phoneVerifiedAt: '2026-09-30T00:00:00Z', ageGroup: '60대', region: '서울', role: 'member', interestIds: ['photo'], joinedClubIds: [] },
  selectedInterestIds: ['photo'], onboardingCompleted: true, onboardingCompletedAt: '2026-09-01T00:00:00Z',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function setup() {
  let now = 1000;
  let onUser: (user: PhoneProofUser | null) => void = () => undefined;
  const unsubscribe = vi.fn();
  const user: PhoneProofUser = { phoneNumber: '+821012345678', getIdToken: vi.fn().mockResolvedValue('fresh-proof') };
  const confirm = vi.fn().mockResolvedValue({ user });
  const driver: PhoneAuthDriver = {
    requestCode: vi.fn().mockResolvedValue({ confirm }),
    onUserChanged: vi.fn((listener) => { onUser = listener; return unsubscribe; }),
    getCurrentUser: vi.fn().mockReturnValue(null),
    clearSession: vi.fn().mockResolvedValue(undefined),
  };
  const createDriver = vi.fn().mockResolvedValue(driver);
  const submitProof = vi.fn().mockResolvedValue(profile);
  const onVerified = vi.fn();
  const controller = new PhoneVerificationController({ createDriver, submitProof, onVerified, now: () => now });
  return { controller, driver, createDriver, submitProof, onVerified, confirm, user, unsubscribe,
    emit: (value: PhoneProofUser | null) => onUser(value),
    advance: (ms: number) => { now += ms; },
  };
}

describe('optional native phone verification lifecycle', () => {
  it('requires consent and a valid nonempty number before loading Firebase or sending SMS', async () => {
    const s = setup();
    await s.controller.send('01012345678', false);
    expect(s.controller.getSnapshot().error).toContain('동의');
    await s.controller.send('', true);
    await s.controller.send('bad-phone', true);
    expect(s.createDriver).not.toHaveBeenCalled();
    expect(s.submitProof).not.toHaveBeenCalled();
  });
  it('normalizes the number, clears old proof and requests the first code without force resend', async () => {
    const s = setup();
    await s.controller.send('010-1234-5678', true);
    expect(s.driver.clearSession).toHaveBeenCalledOnce();
    expect(s.driver.requestCode).toHaveBeenCalledWith('+821012345678', false);
    expect(s.controller.getSnapshot()).toMatchObject({ stage: 'code', canConfirm: true, resendAt: 1000 + PHONE_RESEND_DELAY_MS });
    expect(s.onVerified).not.toHaveBeenCalled();
  });
  it('refreshes the Firebase ID token, links proof and only then reports profile completion', async () => {
    const s = setup();
    await s.controller.send('01012345678', true);
    await s.controller.confirm('123456');
    expect(s.confirm).toHaveBeenCalledWith('123456');
    expect(s.user.getIdToken).toHaveBeenCalledWith(true);
    expect(s.submitProof).toHaveBeenCalledWith('fresh-proof', '+821012345678', expect.any(AbortSignal));
    expect(s.onVerified).toHaveBeenCalledWith(profile);
    expect(s.onVerified.mock.invocationCallOrder[0]).toBeGreaterThan(s.submitProof.mock.invocationCallOrder[0]!);
    expect(s.driver.clearSession).toHaveBeenCalledTimes(2);
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    expect(s.controller.getSnapshot().stage).toBe('success');
  });
  it('keeps a wrong code editable and never calls the backend until Firebase verifies', async () => {
    const s = setup();
    s.confirm.mockRejectedValueOnce({ code: 'auth/invalid-verification-code', message: 'private details' });
    await s.controller.send('01012345678', true);
    await s.controller.confirm('123456');
    expect(s.controller.getSnapshot()).toMatchObject({ stage: 'code', canConfirm: true, codeError: true });
    expect(s.controller.getSnapshot().error).not.toContain('private details');
    expect(s.submitProof).not.toHaveBeenCalled();
    s.controller.clearCodeError();
    await s.controller.confirm('654321');
    expect(s.controller.getSnapshot().stage).toBe('success');
  });
  it('rejects incomplete codes locally', async () => {
    const s = setup();
    await s.controller.send('01012345678', true);
    await s.controller.confirm('12345');
    expect(s.confirm).not.toHaveBeenCalled();
    expect(s.controller.getSnapshot().codeError).toBe(true);
  });
  it('requires a new request after expired verification instead of retrying an expired credential', async () => {
    const s = setup();
    s.confirm.mockRejectedValue({ code: 'auth/session-expired' });
    await s.controller.send('01012345678', true);
    await s.controller.confirm('123456');
    await s.controller.confirm('123456');
    expect(s.confirm).toHaveBeenCalledOnce();
    expect(s.controller.getSnapshot()).toMatchObject({ stage: 'code', canConfirm: false });
  });
  it('throttles repeat SMS requests and forces native resend only after the cooldown', async () => {
    const s = setup();
    await s.controller.send('01012345678', true);
    await s.controller.resend();
    expect(s.driver.requestCode).toHaveBeenCalledOnce();
    s.advance(PHONE_RESEND_DELAY_MS);
    await s.controller.resend();
    expect(s.driver.requestCode).toHaveBeenLastCalledWith('+821012345678', true);
    await s.controller.resend();
    expect(s.driver.requestCode).toHaveBeenCalledTimes(2);
  });
  it('allows resend after a request error and retains a friendly error without fake verification', async () => {
    const s = setup();
    vi.mocked(s.driver.requestCode).mockRejectedValueOnce({ code: 'auth/network-request-failed' });
    await s.controller.send('01012345678', true);
    expect(s.controller.getSnapshot()).toMatchObject({ stage: 'code', canConfirm: false });
    expect(s.controller.getSnapshot().error).toContain('인터넷');
    s.advance(PHONE_RESEND_DELAY_MS);
    await s.controller.resend();
    expect(s.controller.getSnapshot().canConfirm).toBe(true);
  });
  it('handles Android automatic verification and a simultaneous manual result with one backend write', async () => {
    const s = setup();
    const confirmation = deferred<{ user: PhoneProofUser }>();
    const token = deferred<string>();
    s.confirm.mockReturnValue(confirmation.promise);
    vi.mocked(s.user.getIdToken).mockReturnValue(token.promise);
    await s.controller.send('01012345678', true);
    const manual = s.controller.confirm('123456');
    s.emit(s.user);
    s.emit(s.user);
    confirmation.resolve({ user: s.user });
    token.resolve('auto-proof');
    await manual;
    expect(s.submitProof).toHaveBeenCalledOnce();
    expect(s.onVerified).toHaveBeenCalledOnce();
  });
  it('ignores automatic proof for a different number', async () => {
    const s = setup();
    await s.controller.send('01012345678', true);
    s.emit({ ...s.user, phoneNumber: '+821099998888' });
    expect(s.submitProof).not.toHaveBeenCalled();
    expect(s.controller.getSnapshot().stage).toBe('code');
  });
  it('rejects a mismatched manual credential without using its token', async () => {
    const s = setup();
    s.confirm.mockResolvedValue({ user: { ...s.user, phoneNumber: '+821099998888' } });
    await s.controller.send('01012345678', true);
    await s.controller.confirm('123456');
    expect(s.submitProof).not.toHaveBeenCalled();
    expect(s.controller.getSnapshot().canConfirm).toBe(false);
  });
  it('retries server linking with a fresh token without requesting another SMS', async () => {
    const s = setup();
    s.submitProof.mockRejectedValueOnce(new Error('server failed'));
    vi.mocked(s.user.getIdToken).mockResolvedValueOnce('proof-1').mockResolvedValueOnce('proof-2');
    await s.controller.send('01012345678', true);
    await s.controller.confirm('123456');
    expect(s.controller.getSnapshot().stage).toBe('link-error');
    expect(s.onVerified).not.toHaveBeenCalled();
    await s.controller.retryLink();
    expect(s.submitProof).toHaveBeenLastCalledWith('proof-2', '+821012345678', expect.any(AbortSignal));
    expect(s.driver.requestCode).toHaveBeenCalledOnce();
    expect(s.controller.getSnapshot().stage).toBe('success');
  });
  it('cancels a code challenge, removes listeners and ignores late automatic proof', async () => {
    const s = setup();
    await s.controller.send('01012345678', true);
    await s.controller.cancel();
    s.emit(s.user);
    expect(s.onVerified).not.toHaveBeenCalled();
    expect(s.submitProof).not.toHaveBeenCalled();
    expect(s.unsubscribe).toHaveBeenCalledOnce();
    expect(s.controller.getSnapshot()).toMatchObject({ stage: 'idle', cleaningUp: false, phoneNumber: '' });
  });
  it('ignores a confirmation that resolves after cancellation', async () => {
    const s = setup();
    const confirmation = deferred<{ user: PhoneProofUser }>();
    s.confirm.mockReturnValue(confirmation.promise);
    await s.controller.send('01012345678', true);
    const confirming = s.controller.confirm('123456');
    const cancelled = s.controller.cancel();
    confirmation.resolve({ user: s.user });
    await Promise.all([confirming, cancelled]);
    expect(s.submitProof).not.toHaveBeenCalled();
  });
  it('aborts linking and refuses late profile writes after screen/account changes', async () => {
    const s = setup();
    const saving = deferred<ProfileStateSnapshot>();
    s.submitProof.mockReturnValue(saving.promise);
    await s.controller.send('01012345678', true);
    const confirming = s.controller.confirm('123456');
    await vi.waitFor(() => expect(s.submitProof).toHaveBeenCalledOnce());
    const signal = s.submitProof.mock.calls[0]![2] as AbortSignal;
    await s.controller.cancel();
    expect(signal.aborted).toBe(true);
    saving.resolve(profile);
    await confirming;
    expect(s.onVerified).not.toHaveBeenCalled();
  });
  it('blocks repeated taps while a native send is pending', async () => {
    const s = setup();
    const pending = deferred<{ confirm: typeof s.confirm }>();
    vi.mocked(s.driver.requestCode).mockReturnValue(pending.promise);
    const first = s.controller.send('01012345678', true);
    await vi.waitFor(() => expect(s.driver.requestCode).toHaveBeenCalledOnce());
    await s.controller.send('01099998888', true);
    expect(s.driver.requestCode).toHaveBeenCalledOnce();
    pending.resolve({ confirm: s.confirm });
    await first;
  });
  it('handles an unavailable native module without disabling profile editing', async () => {
    const s = setup();
    s.createDriver.mockRejectedValue({ code: 'PHONE_VERIFICATION_NATIVE_UNAVAILABLE' });
    await s.controller.send('01012345678', true);
    expect(s.controller.getSnapshot().stage).toBe('idle');
    expect(s.controller.getSnapshot().error).toContain('인증 없이');
    expect(s.driver.requestCode).not.toHaveBeenCalled();
    await s.controller.cancel();
  });
});
