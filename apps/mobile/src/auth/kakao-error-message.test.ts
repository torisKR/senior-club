import { describe, expect, it } from 'vitest';
import { kakaoErrorMessage } from './kakao-error-message';

describe('Kakao native error messages', () => {
  it.each([
    ['Cancelled', '카카오 로그인을 취소했습니다.'],
    ['Misconfigured', '카카오 로그인 연결을 확인해야 합니다. 잠시 후 다시 시도해 주세요.'],
    ['InvalidClient', '카카오 로그인 연결을 확인해야 합니다. 잠시 후 다시 시도해 주세요.'],
    ['ClientError', '카카오로 로그인하지 못했습니다.'],
  ])('safely describes %s without exposing native details', (code, expected) => {
    expect(kakaoErrorMessage({ code, message: 'sensitive provider detail' })).toBe(expected);
  });
});
