import type { PhoneAuthDriver } from './phone-auth-driver';
import { PhoneVerificationError } from './phone-verification-error';

export async function createNativePhoneAuthDriver(): Promise<PhoneAuthDriver> {
  try {
    // Load only after the member explicitly requests optional verification.
    const [{ getApp }, { getAuth, getIdToken, onAuthStateChanged, verifyPhoneNumber, PhoneAuthProvider, signInWithCredential, signOut }] = await Promise.all([
      import('@react-native-firebase/app'),
      import('@react-native-firebase/auth'),
    ]);
    const auth = getAuth(getApp());
    let generation = 0;
    let pendingSignIn: Promise<unknown> | null = null;
    let cancelPendingRequest: (() => void) | null = null;
    let reportError: ((error: unknown) => void) | undefined;
    const wrapUser = (user: NonNullable<typeof auth.currentUser>) => ({
      phoneNumber: user.phoneNumber,
      getIdToken: (forceRefresh?: boolean) => getIdToken(user, forceRefresh),
    });
    return {
      // RNFirebase 26's modular signInWithPhoneNumber does not accept forceResend.
      // The native listener API supports resend, manual codes and instant verification.
      requestCode: (phoneNumber, forceResend) => new Promise((resolve, reject) => {
        const requestGeneration = ++generation;
        cancelPendingRequest = () => reject(new PhoneVerificationError('PHONE_CANCELLED', '휴대폰 인증을 취소했어요.'));
        const signIn = async (verificationId: string, code: string) => {
          if (generation !== requestGeneration) throw new Error('Phone verification cancelled');
          const operation = signInWithCredential(auth, PhoneAuthProvider.credential(verificationId, code));
          pendingSignIn = operation;
          const credential = await operation;
          return { user: wrapUser(credential.user) };
        };
        verifyPhoneNumber(auth, phoneNumber, 60, forceResend).on(
          'state_changed',
          (snapshot) => {
            if (generation !== requestGeneration) return;
            if (snapshot.error || snapshot.state === 'error') {
              reject(snapshot.error);
              reportError?.(snapshot.error);
              return;
            }
            if (snapshot.state === 'sent' || snapshot.state === 'timeout') {
              resolve({ confirm: (code) => signIn(snapshot.verificationId, code) });
            } else if (snapshot.state === 'verified') {
              // Android instant verification may supply a null ID/code at runtime;
              // PhoneAuthProvider passes the ID through to the native cached credential.
              const operation = signIn(snapshot.verificationId, snapshot.code ?? '');
              resolve({ confirm: () => operation });
              void operation.catch((error) => {
                if (generation === requestGeneration) reportError?.(error);
              });
            }
          },
          (error) => {
            if (generation !== requestGeneration) return;
            reject(error);
            reportError?.(error);
          },
        );
      }),
      onUserChanged: (listener, onError) => {
        reportError = onError;
        const unsubscribe = onAuthStateChanged(auth, (user) => listener(user ? wrapUser(user) : null));
        return () => { reportError = undefined; unsubscribe(); };
      },
      getCurrentUser: () => auth.currentUser ? wrapUser(auth.currentUser) : null,
      // This Firebase proof session is independent of the Kakao app session.
      clearSession: async () => {
        generation += 1;
        cancelPendingRequest?.();
        cancelPendingRequest = null;
        await pendingSignIn?.catch(() => undefined);
        pendingSignIn = null;
        await signOut(auth);
      },
    };
  } catch {
    throw new PhoneVerificationError(
      'PHONE_VERIFICATION_NATIVE_UNAVAILABLE',
      '이 앱에서 휴대폰 인증을 준비하고 있어요. 최신 앱으로 업데이트해 주세요. 번호는 인증 없이 저장할 수 있어요.',
    );
  }
}
