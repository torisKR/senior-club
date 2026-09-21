import { apiErrorMessage } from '@/api/error-message';

export function kakaoErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'Cancelled') return '카카오 로그인을 취소했습니다.';
  if (code === 'Misconfigured' || code === 'InvalidClient') {
    return '카카오 로그인 설정을 확인해야 합니다. 다른 로그인 방법을 이용해 주세요.';
  }
  return apiErrorMessage(error, '카카오로 로그인하지 못했습니다.');
}
