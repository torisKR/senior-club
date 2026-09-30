import type { PropsWithChildren } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { useSegments } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Layout, Spacing } from '@/constants/theme';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';

export interface ScreenProps extends PropsWithChildren {
  scroll?: boolean;
  padded?: boolean;
  includeBottomInset?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
  scrollViewProps?: Omit<ScrollViewProps, 'children' | 'contentContainerStyle' | 'style'>;
  testID?: string;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  includeBottomInset = true,
  style,
  contentContainerStyle,
  scrollViewProps,
  testID,
}: ScreenProps) {
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const segments = useSegments();
  const insideTabs = segments.some((segment) => segment === '(tabs)');
  const horizontalPadding = padded ? Layout.screenPadding : 0;
  // A tab scene ends above the tab bar, which already owns the system bottom inset.
  const bottomPadding = includeBottomInset && !insideTabs ? Math.max(Spacing.xxxl, insets.bottom + Spacing.lg) : Spacing.xxxl;
  const requestedTop = StyleSheet.flatten(contentContainerStyle)?.paddingTop;
  const topGap = typeof requestedTop === 'number' ? requestedTop : Spacing.lg;
  const innerStyle: StyleProp<ViewStyle> = [
    {
      width: '100%',
      maxWidth: Layout.maxContentWidth,
      alignSelf: 'center',
      paddingHorizontal: horizontalPadding,
      paddingBottom: bottomPadding,
      gap: Layout.sectionGap,
    },
    contentContainerStyle,
  ];

  if (!scroll) {
    return (
      <View testID={testID} style={[{ flex: 1, backgroundColor: theme.background }, style]}>
        <View style={{ flex: 1, paddingTop: insets.top }}>
          <View style={[{ flex: 1 }, innerStyle]}>{children}</View>
        </View>
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      contentInsetAdjustmentBehavior="never"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={[{ flex: 1, backgroundColor: theme.background }, style]}
      contentContainerStyle={[innerStyle, { paddingTop: insets.top + topGap }]}
      {...scrollViewProps}>
      {children}
    </ScrollView>
  );
}
