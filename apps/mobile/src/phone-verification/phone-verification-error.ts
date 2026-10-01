import { ApiError } from '@/api/api-error';
import { apiErrorMessage } from '@/api/error-message';

export class PhoneVerificationError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PhoneVerificationError';
  }
}

export function phoneErrorCode(error: unknown): string {
  return error !== null && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
    ? error.code
    : '';
}

const MESSAGES: Readonly<Record<string, string>> = {
  'auth/invalid-phone-number': '휴대폰 번호를 확인해 주세요. 예: 010-1234-5678',
  'auth/missing-phone-number': '인증할 휴대폰 번호를 입력해 주세요.',
  'auth/invalid-verification-code': '인증번호가 맞지 않아요. 받은 문자에 있는 6자리 숫자를 다시 입력해 주세요.',
  'auth/missing-verification-code': '문자에 있는 6자리 인증번호를 입력해 주세요.',
  'auth/session-expired': '인증번호가 만료되었어요. 새 인증번호를 받아 주세요.',
  'auth/invalid-verification-id': '인증 요청이 만료되었어요. 새 인증번호를 받아 주세요.',
  'auth/too-many-requests': '인증 요청이 많아 잠시 제한되었어요. 잠시 후 다시 시도해 주세요.',
  'auth/quota-exceeded': '현재 문자 인증을 이용할 수 없어요. 나중에 다시 시도해 주세요. 연락처는 저장할 수 있어요.',
  'auth/network-request-failed': '인터넷 연결을 확인한 뒤 다시 시도해 주세요.',
  'auth/operation-not-allowed': '현재 문자 인증을 준비하고 있어요. 연락처는 인증 없이 저장할 수 있어요.',
  'auth/app-not-authorized': '이 앱에서 문자 인증을 이용할 수 없어요. 앱을 업데이트한 뒤 다시 시도해 주세요.',
  'auth/invalid-app-credential': '앱 확인을 완료하지 못했어요. 앱을 업데이트한 뒤 다시 시도해 주세요.',
  'auth/missing-client-identifier': '앱 확인을 완료하지 못했어요. 앱을 업데이트한 뒤 다시 시도해 주세요.',
  'auth/captcha-check-failed': '앱 확인이 완료되지 않았어요. 다시 시도해 주세요.',
  'auth/missing-activity-for-recaptcha': '앱 확인 화면을 열지 못했어요. 앱을 다시 열고 시도해 주세요.',
  'auth/web-context-cancelled': '앱 확인을 취소했어요. 원할 때 다시 인증해 주세요.',
  'auth/user-disabled': '이 번호로 인증을 완료할 수 없어요. 다른 번호를 사용하거나 고객지원에 문의해 주세요.',
  PHONE_ALREADY_IN_USE: '다른 계정에 등록된 번호예요. 다른 번호를 사용하거나 고객지원에 문의해 주세요.',
  PHONE_VERIFICATION_NATIVE_UNAVAILABLE: '문자 인증은 최신 Android 또는 iPhone 앱에서 이용해 주세요. 번호는 인증 없이 저장할 수 있어요.',
};

export function phoneVerificationErrorMessage(error: unknown): string {
  if (error instanceof PhoneVerificationError) return error.message;
  const message = MESSAGES[phoneErrorCode(error)];
  if (message) return message;
  if (error instanceof ApiError) return apiErrorMessage(error, '인증 결과를 저장하지 못했어요. 다시 시도해 주세요.');
  // Native messages can contain phone numbers, credentials and implementation details.
  return '휴대폰 인증을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
