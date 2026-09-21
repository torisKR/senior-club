import {
  isKakaoTalkLoginAvailable,
  login,
} from '@react-native-kakao/user';
import { initializeKakaoSDK } from '@react-native-kakao/core';
import Constants from 'expo-constants';

let sdkInitialization: Promise<void> | undefined;

function initializeKakao() {
  const appKey = Constants.expoConfig?.extra?.kakaoNativeAppKey;
  if (typeof appKey !== 'string' || appKey.length === 0) {
    throw new Error('Kakao native app key is missing from the Expo configuration.');
  }
  sdkInitialization ??= initializeKakaoSDK(appKey).catch((error) => {
    sdkInitialization = undefined;
    throw error;
  });
  return sdkInitialization;
}

export async function requestKakaoAccessToken() {
  await initializeKakao();
  const useKakaoAccountLogin = !(await isKakaoTalkLoginAvailable());
  try {
    const token = await login({ useKakaoAccountLogin });
    return token.accessToken;
  } catch (error) {
    // KakaoTalk can be installed but unable to authenticate. Do not retry a
    // cancelled flow, or recursively retry an account-login failure.
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (useKakaoAccountLogin || code === 'Cancelled') throw error;
    const token = await login({ useKakaoAccountLogin: true });
    return token.accessToken;
  }
}
