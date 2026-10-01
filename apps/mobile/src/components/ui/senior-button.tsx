import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ControlDimensions, getButtonAppearance, type ButtonVariant } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { AppText } from './app-text';

export type SeniorButtonVariant = ButtonVariant;

export interface SeniorButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  variant?: SeniorButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  leftAccessory?: ReactNode;
  rightAccessory?: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function SeniorButton({
  label,
  variant = 'primary',
  loading = false,
  fullWidth = true,
  leftAccessory,
  rightAccessory,
  disabled,
  accessibilityLabel = label,
  style,
  ...props
}: SeniorButtonProps) {
  const theme = useTheme();
  const { largeTextEnabled } = useAppState();

  const palette = getButtonAppearance(theme, variant);
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={4}
      style={({ pressed }) => [
        {
          minHeight: largeTextEnabled ? ControlDimensions.largeTextMinHeight : ControlDimensions.minHeight,
          width: fullWidth ? '100%' : undefined,
          paddingHorizontal: ControlDimensions.paddingHorizontal,
          paddingVertical: ControlDimensions.paddingVertical,
          borderRadius: ControlDimensions.radius,
          borderCurve: 'continuous',
          borderWidth: palette.borderWidth,
          borderColor: pressed ? palette.pressedBorder : palette.border,
          backgroundColor: pressed ? palette.pressed : palette.background,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: ControlDimensions.gap,
          opacity: isDisabled ? ControlDimensions.disabledOpacity : 1,
        },
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator accessibilityLabel="처리 중" color={palette.text} size="small" />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ControlDimensions.gap }}>
          {leftAccessory}
          <AppText variant="button" color={palette.text} selectable={false}>
            {label}
          </AppText>
          {rightAccessory}
        </View>
      )}
    </Pressable>
  );
}
