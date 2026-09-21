import { describe, expect, it } from 'vitest';
import { kakaoErrorMessage } from './kakao-error-message';

describe('Kakao native error messages', () => {
  it.each([
    ['Cancelled', '카카오 로그인을 취소했습니다.'],
    ['Misconfigured', '카카오 로그인 설정을 확인해야 합니다. 다른 로그인 방법을 이용해 주세요.'],
    ['InvalidClient', '카카오 로그인 설정을 확인해야 합니다. 다른 로그인 방법을 이용해 주세요.'],
    ['ClientError', '카카오로 로그인하지 못했습니다.'],
  ])('safely describes %s without exposing native details', (code, expected) => {
    expect(kakaoErrorMessage({ code, message: 'sensitive provider detail' })).toBe(expected);
  });
});
