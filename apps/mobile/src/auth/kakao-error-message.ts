import { apiErrorMessage } from '@/api/error-message';

export function kakaoErrorMessage(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (code === 'Cancelled') return '카카오 로그인을 취소했습니다.';
  if (code === 'Misconfigured' || code === 'InvalidClient') {
    return '카카오 로그인 연결을 확인해야 합니다. 잠시 후 다시 시도해 주세요.';
  }
  return apiErrorMessage(error, '카카오로 로그인하지 못했습니다.');
}
