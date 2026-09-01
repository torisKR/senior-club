import type { PropsWithChildren } from 'react';
import type { ScrollViewProps, StyleProp, ViewStyle } from 'react-native';
import { ScrollView, View, useWindowDimensions } from 'react-native';

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
  const { width } = useWindowDimensions();
  const horizontalPadding = padded ? (width < 360 ? Spacing.lg : Layout.screenPadding) : 0;
  const bottomPadding = includeBottomInset ? Math.max(Spacing.xxxl, insets.bottom + Spacing.xl) : Spacing.xxxl;
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
        <View style={[{ flex: 1, paddingTop: insets.top }, innerStyle]}>{children}</View>
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
      contentContainerStyle={[innerStyle, { paddingTop: insets.top + Spacing.lg }]}
      {...scrollViewProps}>
      {children}
    </ScrollView>
  );
}
