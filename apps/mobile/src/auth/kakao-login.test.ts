import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initializeKakaoSDK: vi.fn(),
  isKakaoTalkLoginAvailable: vi.fn(),
  login: vi.fn(),
  extra: { kakaoNativeAppKey: '0123456789abcdef0123456789abcdef' } as Record<string, unknown>,
}));

vi.mock('@react-native-kakao/core', () => ({ initializeKakaoSDK: mocks.initializeKakaoSDK }));
vi.mock('@react-native-kakao/user', () => ({
  isKakaoTalkLoginAvailable: mocks.isKakaoTalkLoginAvailable,
  login: mocks.login,
}));
vi.mock('expo-constants', () => ({ default: { expoConfig: { extra: mocks.extra } } }));

describe('Kakao native login initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.extra.kakaoNativeAppKey = '0123456789abcdef0123456789abcdef';
    mocks.initializeKakaoSDK.mockResolvedValue(undefined);
    mocks.isKakaoTalkLoginAvailable.mockResolvedValue(false);
    mocks.login.mockResolvedValue({ accessToken: 'token' });
  });

  it('initializes before checking availability and only initializes once', async () => {
    const events: string[] = [];
    mocks.initializeKakaoSDK.mockImplementation(async () => events.push('initialize'));
    mocks.isKakaoTalkLoginAvailable.mockImplementation(async () => {
      events.push('available');
      return false;
    });
    mocks.login.mockImplementation(async () => {
      events.push('login');
      return { accessToken: 'token' };
    });
    const { requestKakaoAccessToken } = await import('./kakao-login');

    await requestKakaoAccessToken();
    await requestKakaoAccessToken();

    expect(events).toEqual(['initialize', 'available', 'login', 'available', 'login']);
    expect(mocks.initializeKakaoSDK).toHaveBeenCalledTimes(1);
  });

  it('fails clearly when the Expo configuration has no native app key', async () => {
    mocks.extra.kakaoNativeAppKey = undefined;
    const { requestKakaoAccessToken } = await import('./kakao-login');

    await expect(requestKakaoAccessToken()).rejects.toThrow('Kakao native app key is missing');
    expect(mocks.initializeKakaoSDK).not.toHaveBeenCalled();
    expect(mocks.isKakaoTalkLoginAvailable).not.toHaveBeenCalled();
  });

  it('allows a later login to retry after initialization fails', async () => {
    mocks.initializeKakaoSDK
      .mockRejectedValueOnce(new Error('temporary failure'))
      .mockResolvedValueOnce(undefined);
    const { requestKakaoAccessToken } = await import('./kakao-login');

    await expect(requestKakaoAccessToken()).rejects.toThrow('temporary failure');
    await expect(requestKakaoAccessToken()).resolves.toBe('token');
    expect(mocks.initializeKakaoSDK).toHaveBeenCalledTimes(2);
  });
});
