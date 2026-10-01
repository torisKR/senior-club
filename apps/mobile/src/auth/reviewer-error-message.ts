const MESSAGES: Readonly<Record<string, string>> = {
  REVIEWER_LOGIN_UNSUPPORTED: '심사 계정 로그인은 Android 앱에서 이용해 주세요.',
  REVIEWER_LOGIN_PENDING: '심사 계정 로그인을 확인하고 있어요. 잠시 기다려 주세요.',
  REVIEWER_AUTH_CLEANUP_FAILED: '임시 인증 정보를 정리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  REVIEWER_LOGIN_DISABLED: '심사 계정 로그인을 준비하고 있습니다. 잠시 후 다시 시도해 주세요.',
  REVIEWER_LOGIN_UNAVAILABLE: '심사 계정 로그인 연결을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
  REVIEWER_RATE_LIMITED: '로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.',
  CONSENT_REQUIRED: '서비스 이용약관과 개인정보 처리방침에 모두 동의해 주세요.',
  AUTH_SESSION_CHANGED: '로그인 상태가 바뀌었습니다. 다시 시도해 주세요.',
  SESSION_STORAGE_FAILED: '안전한 로그인 정보를 기기에 저장하지 못했습니다. 다시 시도해 주세요.',
  NETWORK_ERROR: '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  'auth/network-request-failed': '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  REQUEST_TIMEOUT: '서버 응답이 늦어지고 있어요. 잠시 후 다시 시도해 주세요.',
  'auth/too-many-requests': '로그인 시도가 많아요. 잠시 후 다시 시도해 주세요.',
};

// Never display Firebase or server error text, which may contain credentials or tokens.
export function reviewerErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  if (typeof code === 'string' && Object.hasOwn(MESSAGES, code)) return MESSAGES[code];
  return '심사 계정으로 로그인하지 못했습니다. 제공받은 계정 정보를 확인한 뒤 다시 시도해 주세요.';
}

export class ReviewerLoginError extends Error {
  constructor(public readonly code: string) {
    super(reviewerErrorMessage({ code }));
    this.name = 'ReviewerLoginError';
  }
}
