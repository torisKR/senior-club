import { profileApi } from '@/api/profile-api';
import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';

import { hasVerifiedPhone, samePhoneNumber } from './phone-number';
import { PhoneVerificationError } from './phone-verification-error';

export async function verifyNativePhoneToken(
  idToken: string,
  expectedPhoneNumber: string,
  expectedUserId: string,
  signal?: AbortSignal,
) {
  const response = await getAuthenticatedHttpClient().requestJson<{ success: boolean }>(
    '/v1/auth/firebase/verify-phone',
    { method: 'POST', auth: 'required', json: { idToken }, signal },
  );
  if (response.body.success !== true) {
    throw new PhoneVerificationError('PHONE_LINK_FAILED', '인증 결과를 저장하지 못했어요. 다시 시도해 주세요.');
  }
  // A successful Firebase sign-in alone never counts as verified app profile data.
  const snapshot = await profileApi.me(signal);
  if (snapshot.user.id !== expectedUserId || !samePhoneNumber(snapshot.user.phoneNumber, expectedPhoneNumber)) {
    throw new PhoneVerificationError(
      'PHONE_PROFILE_MISMATCH',
      '인증한 번호와 회원 정보를 확인하지 못했어요. 내 정보를 새로 확인한 뒤 다시 시도해 주세요.',
    );
  }
  if (!hasVerifiedPhone(snapshot.user)) {
    throw new PhoneVerificationError(
      'PHONE_VERIFICATION_NOT_RECORDED',
      '연락처는 저장되었지만 인증 완료 상태를 확인하지 못했어요. 잠시 후 인증 결과 저장을 다시 눌러 주세요.',
    );
  }
  return snapshot;
}
