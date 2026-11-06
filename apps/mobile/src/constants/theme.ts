import { Platform } from 'react-native';

import { Layout as SharedLayout, LightColors, Radius, Spacing, Typography } from '../../../../shared/design/foundation';

export {
  CardDimensions, ControlDimensions, getButtonAppearance, Radius,
  Shadows, Spacing, TouchTarget,
} from '../../../../shared/design/foundation';
export type { ButtonVariant } from '../../../../shared/design/foundation';

/** Native density adapts the shared roles without changing the web foundation. */
export const Layout = { ...SharedLayout, screenPadding: 16, cardPadding: 16, sectionGap: 24 } as const;

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
    caption: 13,
    body: 16,
    key: 17,
    sectionTitle: 20,
    title: 24,
    display: 28,
  },
  large: {
    caption: 15,
    body: 18,
    key: 19,
    sectionTitle: 22,
    title: 27,
    display: 31,
  },
} as const;

export const LineHeights = {
  standard: {
    caption: 19,
    body: 24,
    key: 24,
    sectionTitle: 28,
    title: 32,
    display: 36,
  },
  large: {
    caption: 22,
    body: 28,
    key: 28,
    sectionTitle: 31,
    title: 36,
    display: 40,
  },
} as const;

export const MaxContentWidth = Layout.maxContentWidth;

/** Lowercase aliases keep screen code concise without weakening the full theme API. */
export const colors = Colors.light;
export const spacing = Spacing;
export const radii = Radius;
