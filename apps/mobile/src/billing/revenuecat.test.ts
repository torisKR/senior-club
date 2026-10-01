import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' }, constants: { executionEnvironment: 'bare' },
  snapshot: { status: 'authenticated', session: { userId: 'alice' }, restoreError: undefined as unknown },
  sdk: { configure: vi.fn(), logIn: vi.fn(), logOut: vi.fn(), isAnonymous: vi.fn(),
    syncPurchases: vi.fn(), restorePurchases: vi.fn() },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-constants', () => ({ default: mocks.constants }));
vi.mock('@/auth/auth-session-manager', () => ({ authSessionManager: {
  getSnapshot: () => mocks.snapshot, subscribe: vi.fn(() => () => {}),
} }));
vi.mock('react-native-purchases', () => ({ default: mocks.sdk,
  PURCHASES_ARE_COMPLETED_BY_TYPE: { MY_APP: 'MY_APP' }, STOREKIT_VERSION: { STOREKIT_2: 'STOREKIT_2' },
}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.platform.OS = 'android'; mocks.constants.executionEnvironment = 'bare';
  mocks.snapshot = { status: 'authenticated', session: { userId: 'alice' }, restoreError: undefined };
  mocks.sdk.isAnonymous.mockResolvedValue(false);
  mocks.sdk.logIn.mockResolvedValue({}); mocks.sdk.logOut.mockResolvedValue({});
});

describe('RevenueCat observer lifecycle', () => {
  it('configures once before billing, with the Android key and MY_APP', async () => {
    const { withRevenueCat } = await import('./revenuecat');
    const action = vi.fn(async () => { expect(mocks.sdk.configure).toHaveBeenCalledOnce(); });
    await Promise.all([withRevenueCat(action), withRevenueCat(action)]);
    expect(mocks.sdk.configure).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'goog_nCiAtuVHUJhsiEPugAkfdaZyayY', appUserID: 'alice',
      purchasesAreCompletedBy: expect.objectContaining({ type: 'MY_APP' }),
    }));
  });
  it.each(['ios', 'web'])('never configures the Android key on %s', async (platform) => {
    mocks.platform.OS = platform;
    const { withRevenueCat } = await import('./revenuecat');
    await withRevenueCat(async (sdk) => { expect(sdk).toBeNull(); });
    expect(mocks.sdk.configure).not.toHaveBeenCalled();
  });
  it('blocks Expo Go before any SDK or billing work', async () => {
    mocks.constants.executionEnvironment = 'storeClient';
    const { withRevenueCat } = await import('./revenuecat');
    const action = vi.fn();
    await expect(withRevenueCat(action)).rejects.toMatchObject({ code: 'unavailable' });
    expect(action).not.toHaveBeenCalled(); expect(mocks.sdk.configure).not.toHaveBeenCalled();
  });
  it('switches identified users without logging out into an aliasable anonymous user', async () => {
    const { withRevenueCat } = await import('./revenuecat');
    await withRevenueCat(async () => {});
    mocks.snapshot.session = { userId: 'bob' };
    await withRevenueCat(async () => { expect(mocks.sdk.logIn).toHaveBeenCalledWith('bob'); });
    expect(mocks.sdk.logOut).not.toHaveBeenCalled();
  });
  it('rejects results from a purchase whose auth identity changed in flight', async () => {
    const { withRevenueCat } = await import('./revenuecat');
    await expect(withRevenueCat(async () => {
      mocks.snapshot.session = { userId: 'bob' };
      return 'purchase';
    })).rejects.toMatchObject({ code: 'retryable' });
  });
  it('fails closed on identity errors, then retries', async () => {
    const { withRevenueCat } = await import('./revenuecat');
    await withRevenueCat(async () => {});
    mocks.snapshot.session = { userId: 'bob' };
    mocks.sdk.logIn.mockRejectedValueOnce(new Error('offline'));
    const action = vi.fn();
    await expect(withRevenueCat(action)).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
    await withRevenueCat(action); expect(action).toHaveBeenCalledOnce();
  });
  it('does not attribute purchases while auth is restoring or failed to restore', async () => {
    const { withRevenueCat } = await import('./revenuecat');
    mocks.snapshot.status = 'restoring';
    await expect(withRevenueCat(vi.fn())).rejects.toMatchObject({ code: 'retryable' });
    mocks.snapshot.status = 'anonymous'; mocks.snapshot.restoreError = new Error('offline');
    await expect(withRevenueCat(vi.fn())).rejects.toMatchObject({ code: 'retryable' });
    expect(mocks.sdk.configure).not.toHaveBeenCalled();
  });
});
