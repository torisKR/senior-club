import { Redirect, useGlobalSearchParams, usePathname } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/ui';
import { Colors, Spacing } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import {
  buildLoginHref,
  buildOnboardingHref,
  buildReturnTo,
  type AuthIntent,
} from '@/utils/auth-routing';

interface RequireAuthProps extends PropsWithChildren {
  intent?: AuthIntent;
  loginReturnTo?: string;
  requireOnboarding?: boolean;
}

export function RequireAuth({
  children,
  intent,
  loginReturnTo,
  requireOnboarding = true,
}: RequireAuthProps) {
  const pathname = usePathname();
  const params = useGlobalSearchParams() as Record<string, string | string[] | undefined>;
  const { isHydrated, onboardingCompleted, session } = useAppState();
  const returnTo = loginReturnTo ?? buildReturnTo(pathname, params);

  if (!isHydrated) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="로그인 상태를 확인하고 있습니다"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.md,
          backgroundColor: Colors.light.background,
          padding: Spacing.xl,
        }}>
        <ActivityIndicator color={Colors.light.primary} size="large" />
        <AppText variant="bodyStrong">로그인 상태를 확인하고 있어요</AppText>
      </View>
    );
  }

  if (!session) {
    return <Redirect href={buildLoginHref(returnTo, intent)} />;
  }

  if (requireOnboarding && !onboardingCompleted) {
    return <Redirect href={buildOnboardingHref(returnTo, intent)} />;
  }

  return children;
}
