import { useLocalSearchParams } from 'expo-router';

import { RequireAuth } from '@/components/auth/require-auth';
import { OnboardingScreen } from '@/screens/auth/onboarding-screen';
import { sanitizeAuthIntent, sanitizeReturnTo } from '@/utils/auth-routing';

export default function OnboardingRoute() {
  const params = useLocalSearchParams<{
    intent?: string | string[];
    returnTo?: string | string[];
  }>();
  const intent = sanitizeAuthIntent(params.intent);
  const returnTo = sanitizeReturnTo(params.returnTo);

  return (
    <RequireAuth intent={intent} loginReturnTo={returnTo} requireOnboarding={false}>
      <OnboardingScreen />
    </RequireAuth>
  );
}
