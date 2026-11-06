import type { PhoneAuthDriver } from './phone-auth-driver';
import { PhoneVerificationError } from './phone-verification-error';

// Metro selects native-phone-auth.native.ts on Android/iOS. Web never imports native Firebase.
export async function createNativePhoneAuthDriver(): Promise<PhoneAuthDriver> {
  throw new PhoneVerificationError(
    'PHONE_VERIFICATION_NATIVE_UNAVAILABLE',
    '휴대폰 인증은 Android 또는 iPhone 앱에서 이용해 주세요. 번호는 인증 없이 저장할 수 있어요.',
  );
}
