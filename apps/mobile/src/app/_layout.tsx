import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppStateProvider } from '@/context/app-state';
import { BrandColors, Colors, FontWeights } from '@/constants/theme';
import { PendingAuthIntentCoordinator } from '@/auth/pending-auth-intent-coordinator';
import { PushNotificationCoordinator } from '@/notifications/push-notifications';

const palette = Colors.light;

const lightNavigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.primary,
    background: palette.background,
    card: palette.surface,
    text: palette.text,
    border: palette.border,
    notification: palette.accent,
  },
};

const darkNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: BrandColors.sky,
    background: '#0B211C',
    card: '#123128',
    text: '#F8FBF9',
    border: '#3C5D53',
    notification: palette.accent,
  },
};

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded, fontError] = useFonts({
    'Pretendard-Regular': require('../../assets/fonts/Pretendard-Regular.otf'),
    'Pretendard-SemiBold': require('../../assets/fonts/Pretendard-SemiBold.otf'),
    'Pretendard-ExtraBold': require('../../assets/fonts/Pretendard-ExtraBold.otf'),
  });

  // Keep the splash up until type is ready; a failed load still releases it so
  // the app renders with system fonts instead of hanging on a blank screen.
  useEffect(() => {
    if (fontsLoaded || fontError) {
      void SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppStateProvider>
        <PendingAuthIntentCoordinator />
        <PushNotificationCoordinator />
        <ThemeProvider value={colorScheme === 'dark' ? darkNavigationTheme : lightNavigationTheme}>
          <Stack
            screenOptions={{
              headerBackButtonDisplayMode: 'minimal',
              headerShadowVisible: false,
              headerStyle: { backgroundColor: palette.surface },
              headerTintColor: palette.primary,
              headerTitleStyle: {
                color: palette.text,
                fontSize: 20,
                fontFamily: FontWeights.strong,
              },
              contentStyle: { backgroundColor: palette.background },
            }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="event/[id]" options={{ title: '모임 자세히' }} />
            <Stack.Screen name="club/[slug]" options={{ headerShown: false }} />
            <Stack.Screen name="reviews/new" options={{ title: '후기 쓰기', presentation: 'modal' }} />
            <Stack.Screen name="notifications" options={{ title: '알림' }} />
          </Stack>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        </ThemeProvider>
      </AppStateProvider>
    </GestureHandlerRootView>
  );
}
