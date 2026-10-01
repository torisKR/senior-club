import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createNativePhoneAuthDriver } from './native-phone-auth.native';

const firebase = vi.hoisted(() => ({
  getApp: vi.fn(), getAuth: vi.fn(), getIdToken: vi.fn(), onAuthStateChanged: vi.fn(),
  verifyPhoneNumber: vi.fn(), credential: vi.fn(), signInWithCredential: vi.fn(), signOut: vi.fn(),
}));
vi.mock('@react-native-firebase/app', () => ({ getApp: firebase.getApp }));
vi.mock('@react-native-firebase/auth', () => ({
  ...firebase, PhoneAuthProvider: { credential: firebase.credential },
}));

type Snapshot = { state: 'sent' | 'verified' | 'timeout' | 'error'; verificationId: string | null; code: string | null; error: unknown };
let onSnapshot: (value: Snapshot) => void;
let onUser: (value: { phoneNumber: string } | null) => void;
const auth = { currentUser: null };
const user = { phoneNumber: '+821012345678' };

describe('RNFirebase 26 modular native phone adapter', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    firebase.getApp.mockReturnValue({ name: '[DEFAULT]' });
    firebase.getAuth.mockReturnValue(auth);
    firebase.verifyPhoneNumber.mockReturnValue({ on: vi.fn((_event, listener) => { onSnapshot = listener; }) });
    firebase.onAuthStateChanged.mockImplementation((_auth, listener) => { onUser = listener; return vi.fn(); });
    firebase.credential.mockImplementation((verificationId, code) => ({ verificationId, code }));
    firebase.signInWithCredential.mockResolvedValue({ user });
    firebase.getIdToken.mockResolvedValue('fresh-firebase-proof');
    firebase.signOut.mockResolvedValue(undefined);
  });
  it('uses native verifyPhoneNumber forceResend instead of the incompatible modular signInWithPhoneNumber argument', async () => {
    const driver = await createNativePhoneAuthDriver();
    const request = driver.requestCode('+821012345678', true);
    onSnapshot({ state: 'sent', verificationId: 'request-1', code: null, error: null });
    const confirmation = await request;
    expect(firebase.verifyPhoneNumber).toHaveBeenCalledWith(auth, '+821012345678', 60, true);
    const proof = await confirmation.confirm('123456');
    expect(firebase.credential).toHaveBeenCalledWith('request-1', '123456');
    expect(firebase.signInWithCredential).toHaveBeenCalledWith(auth, { verificationId: 'request-1', code: '123456' });
    await expect(proof?.user.getIdToken(true)).resolves.toBe('fresh-firebase-proof');
    expect(firebase.getIdToken).toHaveBeenCalledWith(user, true);
  });
  it('observes automatic Firebase proof through the modular auth listener', async () => {
    const driver = await createNativePhoneAuthDriver();
    const listener = vi.fn();
    driver.onUserChanged(listener);
    onUser(user);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ phoneNumber: '+821012345678' }));
    expect(firebase.onAuthStateChanged).toHaveBeenCalledWith(auth, expect.any(Function));
  });
  it('consumes Android instant verification without requiring a manually typed SMS code', async () => {
    const driver = await createNativePhoneAuthDriver();
    const request = driver.requestCode('+821012345678', false);
    onSnapshot({ state: 'verified', verificationId: null, code: null, error: null });
    const confirmation = await request;
    await expect(confirmation.confirm('')).resolves.toMatchObject({ user: { phoneNumber: '+821012345678' } });
    expect(firebase.credential).toHaveBeenCalledWith(null, '');
    expect(firebase.signInWithCredential).toHaveBeenCalledOnce();
  });
  it('retains manual confirmation when Android automatic retrieval times out', async () => {
    const driver = await createNativePhoneAuthDriver();
    const request = driver.requestCode('+821012345678', false);
    onSnapshot({ state: 'timeout', verificationId: 'request-1', code: null, error: null });
    const confirmation = await request;
    await confirmation.confirm('123456');
    expect(firebase.credential).toHaveBeenCalledWith('request-1', '123456');
  });
  it('reports native request failure before any app backend write', async () => {
    const driver = await createNativePhoneAuthDriver();
    const report = vi.fn();
    driver.onUserChanged(vi.fn(), report);
    const request = driver.requestCode('+821012345678', false);
    const rejection = expect(request).rejects.toMatchObject({ code: 'auth/quota-exceeded' });
    onSnapshot({ state: 'error', verificationId: '', code: null, error: { code: 'auth/quota-exceeded' } });
    await rejection;
    expect(report).toHaveBeenCalledWith({ code: 'auth/quota-exceeded' });
    expect(firebase.signInWithCredential).not.toHaveBeenCalled();
  });
  it('cancels an outstanding SMS request and ignores late auto verification callbacks', async () => {
    const driver = await createNativePhoneAuthDriver();
    const request = driver.requestCode('+821012345678', false);
    const rejection = expect(request).rejects.toMatchObject({ code: 'PHONE_CANCELLED' });
    await driver.clearSession();
    await rejection;
    onSnapshot({ state: 'verified', verificationId: null, code: null, error: null });
    expect(firebase.signInWithCredential).not.toHaveBeenCalled();
    expect(firebase.signOut).toHaveBeenCalledWith(auth);
  });
  it('suppresses callbacks from an old resend attempt', async () => {
    const driver = await createNativePhoneAuthDriver();
    const first = driver.requestCode('+821012345678', false);
    const oldCallback = onSnapshot;
    oldCallback({ state: 'sent', verificationId: 'old-request', code: null, error: null });
    await first;
    const second = driver.requestCode('+821012345678', true);
    oldCallback({ state: 'verified', verificationId: 'old-request', code: '123456', error: null });
    expect(firebase.signInWithCredential).not.toHaveBeenCalled();
    onSnapshot({ state: 'sent', verificationId: 'new-request', code: null, error: null });
    const confirmation = await second;
    await confirmation.confirm('654321');
    expect(firebase.credential).toHaveBeenCalledWith('new-request', '654321');
  });
  it('clears only Firebase proof auth and never invokes the Kakao app session manager', async () => {
    const driver = await createNativePhoneAuthDriver();
    await driver.clearSession();
    expect(firebase.signOut).toHaveBeenCalledWith(auth);
    expect(firebase.getIdToken).not.toHaveBeenCalled();
  });
  it('offers a readable unsupported message when the native app is unavailable', async () => {
    firebase.getApp.mockImplementation(() => { throw new Error('native module not found'); });
    await expect(createNativePhoneAuthDriver()).rejects.toMatchObject({ code: 'PHONE_VERIFICATION_NATIVE_UNAVAILABLE' });
  });
});
