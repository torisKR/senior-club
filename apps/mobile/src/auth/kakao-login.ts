import {
  isKakaoTalkLoginAvailable,
  login,
} from '@react-native-kakao/user';

export async function requestKakaoAccessToken() {
  const useKakaoAccountLogin = !(await isKakaoTalkLoginAvailable());
  const token = await login({ useKakaoAccountLogin });
  return token.accessToken;
}
