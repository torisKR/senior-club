import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestReviewerIdToken } from './reviewer-login.native';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' },
  getApp: vi.fn(), getAuth: vi.fn(), signInWithEmailAndPassword: vi.fn(),
  getIdToken: vi.fn(), signOut: vi.fn(),
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('@react-native-firebase/app', () => ({ getApp: mocks.getApp }));
vi.mock('@react-native-firebase/auth', () => ({
  getAuth: mocks.getAuth, signInWithEmailAndPassword: mocks.signInWithEmailAndPassword,
  getIdToken: mocks.getIdToken, signOut: mocks.signOut,
}));

const auth = { currentUser: null };
const user = { uid: 'fixture-reviewer' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.platform.OS = 'android';
  mocks.getApp.mockReturnValue({ name: '[DEFAULT]' });
  mocks.getAuth.mockReturnValue(auth);
  mocks.signInWithEmailAndPassword.mockResolvedValue({ user });
  mocks.getIdToken.mockResolvedValue('fixture-fresh-id-token');
  mocks.signOut.mockResolvedValue(undefined);
});

describe('temporary Android reviewer Firebase authentication', () => {
  it('forces a fresh token and waits for cleanup before releasing it to the app', async () => {
    const cleanup = deferred<void>();
    mocks.signOut.mockImplementation(() => cleanup.promise);
    let completed = false;
    const result = requestReviewerIdToken(' reviewer@example.test ', ' fixture password ')
      .then((token) => { completed = true; return token; });
    await vi.waitFor(() => expect(mocks.signOut).toHaveBeenCalledWith(auth));
    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledWith(auth, 'reviewer@example.test', ' fixture password ');
    expect(mocks.getIdToken).toHaveBeenCalledWith(user, true);
    expect(completed).toBe(false);
    cleanup.resolve();
    await expect(result).resolves.toBe('fixture-fresh-id-token');
  });

  it.each(['signInWithEmailAndPassword', 'getIdToken'] as const)(
    'clears Firebase after %s fails and strips sensitive SDK messages', async (operation) => {
      mocks[operation].mockRejectedValueOnce({ code: 'auth/invalid-credential', message: 'sensitive fixture credentials' });
      await expect(requestReviewerIdToken('reviewer@example.test', 'fixture-password')).rejects.toMatchObject({
        code: 'REVIEWER_LOGIN_FAILED',
      });
      expect(mocks.signOut).toHaveBeenCalledWith(auth);
      if (operation === 'signInWithEmailAndPassword') expect(mocks.getIdToken).not.toHaveBeenCalled();
    },
  );

  it('blocks the exchange when Firebase sign-out fails, and allows a later clean attempt', async () => {
    mocks.signOut.mockRejectedValueOnce(new Error('sensitive fixture token'));
    await expect(requestReviewerIdToken('reviewer@example.test', 'fixture-password')).rejects.toMatchObject({
      code: 'REVIEWER_AUTH_CLEANUP_FAILED',
    });
    await expect(requestReviewerIdToken('reviewer@example.test', 'fixture-password')).resolves.toBe('fixture-fresh-id-token');
    expect(mocks.signOut).toHaveBeenCalledTimes(2);
  });

  it('clears Firebase even if the SDK returns an empty token', async () => {
    mocks.getIdToken.mockResolvedValueOnce('');
    await expect(requestReviewerIdToken('reviewer@example.test', 'fixture-password')).rejects.toMatchObject({ code: 'REVIEWER_LOGIN_FAILED' });
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('rejects overlapping attempts without signing out the active attempt', async () => {
    const signin = deferred<{ user: typeof user }>();
    mocks.signInWithEmailAndPassword.mockImplementationOnce(() => signin.promise);
    const first = requestReviewerIdToken('reviewer@example.test', 'fixture-password');
    await vi.waitFor(() => expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledOnce());
    await expect(requestReviewerIdToken('other@example.test', 'other-fixture')).rejects.toMatchObject({ code: 'REVIEWER_LOGIN_PENDING' });
    expect(mocks.signOut).not.toHaveBeenCalled();
    signin.resolve({ user });
    await first;
    expect(mocks.signInWithEmailAndPassword).toHaveBeenCalledOnce();
    expect(mocks.signOut).toHaveBeenCalledOnce();
  });

  it('refuses iOS before loading Firebase auth', async () => {
    mocks.platform.OS = 'ios';
    await expect(requestReviewerIdToken('reviewer@example.test', 'fixture-password')).rejects.toMatchObject({ code: 'REVIEWER_LOGIN_UNSUPPORTED' });
    expect(mocks.getApp).not.toHaveBeenCalled();
    expect(mocks.signInWithEmailAndPassword).not.toHaveBeenCalled();
  });
});
