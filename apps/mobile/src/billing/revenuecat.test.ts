import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: { OS: 'android' }, constants: { executionEnvironment: 'bare' },
  sdk: { configure: vi.fn(), logIn: vi.fn(), logOut: vi.fn(), syncPurchases: vi.fn() },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-constants', () => ({ default: mocks.constants }));
vi.mock('react-native-purchases', () => ({ default: mocks.sdk,
  PURCHASES_ARE_COMPLETED_BY_TYPE: { MY_APP: 'MY_APP' }, STOREKIT_VERSION: { STOREKIT_2: 'STOREKIT_2' },
}));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mocks.platform.OS = 'android'; mocks.constants.executionEnvironment = 'bare';
});

describe('RevenueCat observer without an app account', () => {
  it('configures once for concurrent requests and leaves identity to the SDK', async () => {
    const { withRevenueCat } = await import('./revenuecat');
    const action = vi.fn(async () => { expect(mocks.sdk.configure).toHaveBeenCalledOnce(); });
    await Promise.all([withRevenueCat(action), withRevenueCat(action)]);
    expect(action).toHaveBeenCalledTimes(2);
    expect(mocks.sdk.configure).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: expect.any(String), purchasesAreCompletedBy: expect.objectContaining({ type: 'MY_APP' }),
    }));
    expect(mocks.sdk.configure.mock.calls[0][0]).not.toHaveProperty('appUserID');
    expect(mocks.sdk.logIn).not.toHaveBeenCalled();
    expect(mocks.sdk.logOut).not.toHaveBeenCalled();
  });

  it.each(['ios', 'web'])('does not configure the Android key on %s', async (platform) => {
    mocks.platform.OS = platform;
    const { withRevenueCat } = await import('./revenuecat');
    await withRevenueCat(async (sdk) => { expect(sdk).toBeNull(); });
    expect(mocks.sdk.configure).not.toHaveBeenCalled();
  });

  it('blocks Expo Go before SDK work', async () => {
    mocks.constants.executionEnvironment = 'storeClient';
    const { withRevenueCat } = await import('./revenuecat');
    const action = vi.fn();
    await expect(withRevenueCat(action)).rejects.toMatchObject({ code: 'unavailable' });
    expect(action).not.toHaveBeenCalled();
    expect(mocks.sdk.configure).not.toHaveBeenCalled();
  });

  it('retries SDK configuration after a failure', async () => {
    mocks.sdk.configure.mockImplementationOnce(() => { throw new Error('SDK unavailable'); });
    const { withRevenueCat } = await import('./revenuecat');
    const action = vi.fn(async () => 'ok');
    await expect(withRevenueCat(action)).rejects.toThrow('SDK unavailable');
    expect(action).not.toHaveBeenCalled();
    await expect(withRevenueCat(action)).resolves.toBe('ok');
    expect(mocks.sdk.configure).toHaveBeenCalledTimes(2);
  });
});
