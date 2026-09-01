import { ApiError } from '@/api/api-error';
import { EnvironmentConfigurationError } from '@/config/env';

const ERROR_MESSAGES: Readonly<Record<string, string>> = Object.freeze({
  NETWORK_ERROR: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  REQUEST_TIMEOUT: '서버 응답이 늦어지고 있어요. 잠시 뒤 다시 시도해 주세요.',
  REQUEST_ABORTED: '요청이 취소되었습니다.',
  INVALID_RESPONSE: '서버 응답을 확인하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
  AUTHENTICATION_REQUIRED: '로그인이 필요합니다.',
  INVALID_SESSION: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
  INVALID_REFRESH_TOKEN: '로그인 시간이 만료되었습니다. 다시 로그인해 주세요.',
});

export function apiErrorMessage(error: unknown, fallback: string) {
  if (error instanceof EnvironmentConfigurationError) {
    return `${error.message} 앱의 API 환경 설정을 확인해 주세요.`;
  }

  if (error instanceof ApiError) {
    return ERROR_MESSAGES[error.code] ?? error.message ?? fallback;
  }

  return fallback;
}

