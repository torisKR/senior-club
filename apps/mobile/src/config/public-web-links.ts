import { PRIVACY_POLICY_URL } from './public-policy-url';

export { PRIVACY_POLICY_URL } from './public-policy-url';

export type PublicWebPage = 'privacy' | 'account-deletion';

// The policy also provides a contact path for former account holders.
export function getPublicWebPageUrl(_page: PublicWebPage): string {
  return PRIVACY_POLICY_URL;
}
