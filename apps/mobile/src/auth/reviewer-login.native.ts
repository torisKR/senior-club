import { Platform } from 'react-native';

import { ReviewerLoginError } from './reviewer-error-message';

let loginPending = false;

export async function requestReviewerIdToken(email: string, password: string): Promise<string> {
  if (Platform.OS !== 'android') throw new ReviewerLoginError('REVIEWER_LOGIN_UNSUPPORTED');
  // A second attempt must not sign out the first attempt's temporary Firebase user.
  if (loginPending) throw new ReviewerLoginError('REVIEWER_LOGIN_PENDING');
  loginPending = true;
  try {
    const [{ getApp }, { getAuth, signInWithEmailAndPassword, getIdToken, signOut }] = await Promise.all([
      import('@react-native-firebase/app'),
      import('@react-native-firebase/auth'),
    ]);
    const auth = getAuth(getApp());
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await getIdToken(credential.user, true);
      if (!idToken) throw new ReviewerLoginError('REVIEWER_LOGIN_FAILED');
      return idToken;
    } finally {
      // Await cleanup even if sign-in or token retrieval failed. Never exchange a
      // proof while Firebase still owns a signed-in user on this device.
      try {
        await signOut(auth);
      } catch {
        throw new ReviewerLoginError('REVIEWER_AUTH_CLEANUP_FAILED');
      }
    }
  } catch (error) {
    if (error instanceof ReviewerLoginError) throw error;
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    // Preserve only useful, non-sensitive error categories; discard SDK messages/causes.
    throw new ReviewerLoginError(
      code === 'auth/network-request-failed' || code === 'auth/too-many-requests'
        ? code : 'REVIEWER_LOGIN_FAILED',
    );
  } finally {
    loginPending = false;
  }
}
