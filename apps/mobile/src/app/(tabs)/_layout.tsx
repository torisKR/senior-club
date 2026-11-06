import { Tabs } from 'expo-router';

import { ArcadeProvider } from '@/arcade/arcade-store';
import { RpgProvider } from '@/rpg/rpg-store';
import { RpgStorageGate } from '@/rpg/rpg-storage-gate';
import { BottomNavigation } from '@/components/navigation/bottom-navigation';
import { BottomDestinations } from '@/components/navigation/bottom-navigation-layout';
import { useTheme } from '@/hooks/use-theme';

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <RpgProvider>
      <RpgStorageGate>
        <ArcadeProvider>
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
        </ArcadeProvider>
      </RpgStorageGate>
    </RpgProvider>
  );
}
