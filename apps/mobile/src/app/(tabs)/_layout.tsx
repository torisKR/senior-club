import { Tabs } from 'expo-router';
import { Image, type ColorValue } from 'react-native';

import { RequireAuth } from '@/components/auth/require-auth';
import { useTheme } from '@/hooks/use-theme';
import { FontWeights } from '@/constants/theme';

const tabIcons = {
  home: require('@/assets/images/tab-icons-v2/home.png'),
  clubs: require('@/assets/images/tab-icons-v2/clubs.png'),
  events: require('@/assets/images/tab-icons-v2/events.png'),
  chat: require('@/assets/images/tab-icons-v2/chat.png'),
  me: require('@/assets/images/tab-icons-v2/profile.png'),
} as const;

function tabIcon(source: number) {
  function RenderTabIcon({ color, size }: { color: ColorValue; size: number }) {
    return (
      <Image
        accessibilityIgnoresInvertColors
        source={source}
        style={{ width: size, height: size, tintColor: color }}
      />
    );
  }

  return RenderTabIcon;
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <RequireAuth>
      <Tabs
        backBehavior="history"
        screenOptions={{
          headerShown: false,
          tabBarActiveBackgroundColor: theme.backgroundSelected,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textSecondary,
          tabBarHideOnKeyboard: true,
          tabBarLabelStyle: { fontSize: 15, fontFamily: FontWeights.strong },
          tabBarStyle: {
            minHeight: 68,
            paddingTop: 6,
            borderTopColor: theme.divider,
            backgroundColor: theme.surface,
          },
          sceneStyle: { backgroundColor: theme.background },
        }}>
        <Tabs.Screen
          name="home"
          options={{
            title: '홈',
            tabBarAccessibilityLabel: '홈 탭',
            tabBarButtonTestID: 'tab-home',
            tabBarIcon: tabIcon(tabIcons.home),
          }}
        />
        <Tabs.Screen
          name="clubs"
          options={{
            title: '커뮤니티',
            tabBarAccessibilityLabel: '커뮤니티 탭',
            tabBarButtonTestID: 'tab-clubs',
            tabBarIcon: tabIcon(tabIcons.clubs),
          }}
        />
        <Tabs.Screen
          name="events"
          options={{
            title: '모임',
            tabBarAccessibilityLabel: '모임 탭',
            tabBarButtonTestID: 'tab-events',
            tabBarIcon: tabIcon(tabIcons.events),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: '대화',
            tabBarAccessibilityLabel: '대화 탭',
            tabBarButtonTestID: 'tab-chat',
            tabBarIcon: tabIcon(tabIcons.chat),
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: '내 정보',
            tabBarAccessibilityLabel: '내 정보 탭',
            tabBarButtonTestID: 'tab-me',
            tabBarIcon: tabIcon(tabIcons.me),
          }}
        />
      </Tabs>
    </RequireAuth>
  );
}
