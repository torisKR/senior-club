import type { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { useEffect, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppIcon } from '@/components/ui/app-icon';
import { FontWeights, Radius } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { BottomDestinations, bottomNavigationLayout } from './bottom-navigation-layout';

type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function BottomNavigation({ state, descriptors, navigation }: BottomTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const { largeTextEnabled } = useAppState();
  const [keyboardVisible, setKeyboardVisible] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const focusedOptions = descriptors[state.routes[state.index].key].options;
  if (keyboardVisible && focusedOptions.tabBarHideOnKeyboard) return null;
  const layout = bottomNavigationLayout({ width: width - insets.left - insets.right, fontScale, largeTextEnabled, bottomInset: insets.bottom, count: state.routes.length });

  return (
    <View
      testID="bottom-navigation"
      style={{ backgroundColor: theme.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.divider, paddingBottom: layout.bottomInset }}>
      <View style={{ flexDirection: 'row', minHeight: layout.rowHeight, paddingLeft: insets.left, paddingRight: insets.right }}>
        {state.routes.map((route, index) => {
          const destination = BottomDestinations.find((item) => item.name === route.name);
          if (!destination) return null;
          const selected = index === state.index;
          const options = descriptors[route.key].options;
          const color = selected ? theme.primary : theme.textSecondary;
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!selected && !event.defaultPrevented) navigation.navigate(route.name, route.params);
          };
          return (
            <Pressable
              key={route.key}
              testID={options.tabBarButtonTestID}
              accessibilityRole="tab"
              accessibilityLabel={options.tabBarAccessibilityLabel ?? `${destination.label} 탭`}
              accessibilityState={{ selected }}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              style={({ pressed }) => ({
                flex: 1, minWidth: 48, minHeight: 48, paddingVertical: 6, paddingHorizontal: 4,
                alignItems: 'center', justifyContent: 'center', gap: 4, opacity: pressed ? 0.72 : 1,
              })}>
              <View style={{ width: 48, height: 28, borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? theme.backgroundSelected : 'transparent' }}>
                <AppIcon name={destination.icon} color={color} />
              </View>
              <Text
                allowFontScaling
                selectable={false}
                style={{ color, fontFamily: FontWeights.emphasis, fontSize: layout.labelSize, lineHeight: layout.labelLineHeight, textAlign: 'center', alignSelf: 'stretch' }}>
                {destination.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
