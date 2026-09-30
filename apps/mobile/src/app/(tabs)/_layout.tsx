import { Tabs } from 'expo-router';

import { RequireAuth } from '@/components/auth/require-auth';
import { BottomNavigation } from '@/components/navigation/bottom-navigation';
import { BottomDestinations } from '@/components/navigation/bottom-navigation-layout';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <RequireAuth>
      <Tabs
        backBehavior="history"
        tabBar={(props) => <BottomNavigation {...props} />}
        screenOptions={{ headerShown: false, tabBarHideOnKeyboard: true, sceneStyle: { backgroundColor: theme.background } }}>
        {BottomDestinations.map((destination) => (
          <Tabs.Screen key={destination.name} name={destination.name} options={{
            title: destination.label,
            tabBarAccessibilityLabel: `${destination.label} 탭`,
            tabBarButtonTestID: `tab-${destination.name}`,
          }} />
        ))}
      </Tabs>
    </RequireAuth>
  );
}
