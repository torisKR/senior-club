import type { ReactNode } from 'react';
import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ControlDimensions, getButtonAppearance, type ButtonVariant } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

import { useGameSkin } from '@/components/game/game-skin';
import { PixelBorder, PixelPalette, pixelButtonAppearance } from '@/components/game/pixel-theme';

import { AppText } from './app-text';

/** 픽셀 스킨: 바깥선은 진한 호두색, 아래 두꺼운 테두리가 눌림 깊이(베벨)입니다. */
function toPixelAppearance(variant: ButtonVariant) {
  const pixel = pixelButtonAppearance(variant);
  return {
    background: pixel.face, pressed: pixel.face, text: pixel.text,
    border: PixelPalette.outline, pressedBorder: pixel.bevel, borderWidth: PixelBorder.frame,
  };
}

function pixelButtonShape(pressed: boolean, bevel: string): ViewStyle {
  return {
    borderRadius: 2,
    borderColor: PixelPalette.outline,
    boxShadow: `inset 0 ${pressed ? -PixelBorder.pressedBevel : -PixelBorder.bevel}px 0 ${bevel}`,
    transform: [{ translateY: pressed ? PixelBorder.bevel - PixelBorder.pressedBevel : 0 }],
  };
}

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

  const isGameSkin = useGameSkin();
  const palette = isGameSkin ? toPixelAppearance(variant) : getButtonAppearance(theme, variant);
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
        isGameSkin && pixelButtonShape(pressed, palette.pressedBorder),
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
