import { Platform } from 'react-native';

import { Layout, LightColors, Radius, Spacing, Typography } from '../../../../shared/design/foundation';

export {
  CardDimensions, ControlDimensions, getButtonAppearance, Layout, Radius,
  Shadows, Spacing, TouchTarget,
} from '../../../../shared/design/foundation';
export type { ButtonVariant } from '../../../../shared/design/foundation';

/** Legacy public names; the light palette comes from the web forest source. */
export const BrandColors = {
  forest: LightColors.primary,
  forestPressed: LightColors.primaryPressed,
  ember: LightColors.accent,
  emberPressed: LightColors.accentPressed,
  // Existing native dark navigation uses this blue independently of light tokens.
  sky: '#5FB4D9',
  skySoft: LightColors.infoSurface,
  ink: LightColors.text,
  white: LightColors.inverseText,
} as const;

export const Colors = {
  light: LightColors,
  dark: {
    text: '#F5FAF8',
    textSecondary: '#C4D2CE',
    textMuted: '#AABCB6',
    inverseText: '#092F26',
    background: '#0A1E19',
    surface: '#102A23',
    backgroundElement: '#19372F',
    backgroundSelected: '#245143',
    primary: '#8ED4BE',
    primaryPressed: '#B0E6D5',
    accent: '#F29A78',
    accentPressed: '#FFC0A7',
    info: '#8CD4F0',
    infoSurface: '#173A49',
    border: '#59766D',
    divider: '#35534A',
    success: '#82D7AE',
    successSurface: '#163E2E',
    warning: '#FFD37A',
    warningSurface: '#4A370E',
    danger: '#FFAAA5',
    dangerPressed: '#FFD0CC',
    dangerSurface: '#4B2222',
    overlay: 'rgba(0, 0, 0, 0.62)',
  },
} as const;

export type ColorSchemeName = keyof typeof Colors;
export type ThemeColor = keyof (typeof Colors)['light'] & keyof (typeof Colors)['dark'];

/**
 * Pretendard is the one family across the whole app. Hierarchy comes from
 * weight, not from mixing typefaces, so a reader only has to learn one set of
 * letterforms. `FontFamilies` names the loaded assets; `FontWeights` maps a
 * role to the family that renders it.
 */
export const FontFamilies = Typography.nativeFamilies;

export const FontWeights = {
  /** Body copy and long-form reading. */
  body: FontFamilies.regular,
  /** Labels, buttons, and anything the eye should land on first. */
  emphasis: FontFamilies.semiBold,
  /** Screen titles and the single most important number on a card. */
  strong: FontFamilies.extraBold,
} as const;

export const Fonts = Platform.select({
  ios: {
    sans: FontFamilies.regular,
    serif: 'ui-serif',
    rounded: FontFamilies.regular,
    mono: 'ui-monospace',
  },
  default: {
    sans: FontFamilies.regular,
    serif: 'serif',
    rounded: FontFamilies.regular,
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const FontSizes = {
  standard: {
    caption: 16,
    body: 18,
    key: 20,
    sectionTitle: 22,
    title: 28,
    display: 34,
  },
  large: {
    caption: 18,
    body: 20,
    key: 22,
    sectionTitle: 25,
    title: 32,
    display: 38,
  },
} as const;

export const LineHeights = {
  standard: {
    caption: 23,
    body: 28,
    key: 30,
    sectionTitle: 31,
    title: 38,
    display: 44,
  },
  large: {
    caption: 27,
    body: 31,
    key: 33,
    sectionTitle: 35,
    title: 42,
    display: 48,
  },
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = Layout.maxContentWidth;

/** Lowercase aliases keep screen code concise without weakening the full theme API. */
export const colors = Colors.light;
export const spacing = Spacing;
export const radii = Radius;
