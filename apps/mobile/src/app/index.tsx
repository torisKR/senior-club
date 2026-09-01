import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import {
  buildPendingAuthHref,
  readPendingAuthNavigation,
  type PendingAuthNavigation,
} from '@/auth/pending-auth-navigation';
import { Colors, FontWeights } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';

const palette = Colors.light;

export default function AppEntryScreen() {
  const { isHydrated, onboardingCompleted, session } = useAppState();
  const [pendingNavigation, setPendingNavigation] = useState<
    PendingAuthNavigation | null | undefined
  >(undefined);

  useEffect(() => {
    let active = true;
    void readPendingAuthNavigation()
      .then((pending) => {
        if (active) setPendingNavigation(pending);
      })
      .catch(() => {
        if (active) setPendingNavigation(null);
      });

    return () => {
      active = false;
    };
  }, []);

  if (!isHydrated || pendingNavigation === undefined) {
    return (
      <View
        accessibilityRole="progressbar"
        accessibilityLabel="시니어클럽을 준비하고 있습니다"
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          backgroundColor: palette.background,
          padding: 24,
        }}>
        <ActivityIndicator color={palette.primary} size="large" />
        <Text selectable style={{ color: palette.text, fontSize: 18, fontFamily: FontWeights.emphasis }}>
          시니어클럽을 준비하고 있어요
        </Text>
      </View>
    );
  }

  if (!session) {
    return (
      <Redirect
        href={
          pendingNavigation
            ? buildPendingAuthHref(pendingNavigation, 'anonymous')
            : '/login'
        }
      />
    );
  }

  if (!onboardingCompleted) {
    return (
      <Redirect
        href={
          pendingNavigation
            ? buildPendingAuthHref(pendingNavigation, 'onboarding')
            : '/onboarding'
        }
      />
    );
  }

  return (
    <Redirect
      href={
        pendingNavigation ? buildPendingAuthHref(pendingNavigation, 'complete') : '/home'
      }
    />
  );
}
