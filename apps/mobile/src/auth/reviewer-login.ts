import { ReviewerLoginError } from './reviewer-error-message';

// Metro uses reviewer-login.native.ts on native platforms. Web never loads native Firebase.
export async function requestReviewerIdToken(_email: string, _password: string): Promise<string> {
  throw new ReviewerLoginError('REVIEWER_LOGIN_UNSUPPORTED');
}
