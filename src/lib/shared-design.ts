import type { CSSProperties } from "react";

import {
  AmbientColors,
  CardDimensions,
  ControlDimensions,
  ForestPalette,
  getButtonRoles,
  LightColors,
  Shadows,
  Typography,
} from "../../shared/design/foundation";

export { LightColors } from "../../shared/design/foundation";

const px = (value: number) => `${value}px`;

/** Server-rendered on html so the first paint and hydration share one source. */
export const sharedDesignStyle: CSSProperties & Record<`--${string}`, string | number> = {
  "--font-body": `"${Typography.variableFamily}", ${Typography.family}, "Noto Sans KR", "Apple SD Gothic Neo", system-ui, sans-serif`,
  "--canvas": LightColors.background,
  "--canvas-deep": LightColors.backgroundSelected,
  "--surface": LightColors.surface,
  "--ink": LightColors.text,
  "--muted": LightColors.textSecondary,
  "--primary": LightColors.primary,
  "--primary-strong": LightColors.primaryPressed,
  "--sky": ForestPalette.sage,
  "--sky-soft": LightColors.infoSurface,
  "--surface-soft": LightColors.backgroundElement,
  "--primary-light": ForestPalette.sage,
  "--line-soft": LightColors.divider,
  "--accent": LightColors.accent,
  "--accent-soft": ForestPalette.accentSoft,
  "--sun": ForestPalette.sun,
  "--line": LightColors.border,
  "--success": LightColors.success,
  "--warning": LightColors.warning,
  "--danger": LightColors.danger,
  "--focus": LightColors.primaryPressed,
  "--ambient-start": AmbientColors.start,
  "--ambient-tint": AmbientColors.tint,
  "--shadow": Shadows.web,
  "--radius": px(CardDimensions.radius),
  "--card-padding": px(CardDimensions.padding),
  "--card-border-width": px(CardDimensions.borderWidth),
  "--control-min-height": px(ControlDimensions.minHeight),
  "--control-large-min-height": px(ControlDimensions.largeTextMinHeight),
  "--control-radius": px(ControlDimensions.radius),
  "--control-padding-x": px(ControlDimensions.paddingHorizontal),
  "--control-padding-y": px(ControlDimensions.paddingVertical),
  "--control-gap": px(ControlDimensions.gap),
  "--control-border-width": px(ControlDimensions.borderWidth),
  "--control-disabled-opacity": ControlDimensions.disabledOpacity,
  ...Object.fromEntries(Object.entries(getButtonRoles(LightColors)).flatMap(([role, appearance]) => [
    [`--button-${role}-background`, appearance.background],
    [`--button-${role}-pressed`, appearance.pressed],
    [`--button-${role}-text`, appearance.text],
    [`--button-${role}-border`, appearance.border],
    [`--button-${role}-pressed-border`, appearance.pressedBorder],
    [`--button-${role}-border-width`, px(appearance.borderWidth)],
  ])),
};
