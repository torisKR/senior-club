import { Platform } from 'react-native';

/**
 * The palette is early morning outdoors, not a warm interior: members are
 * heading out to hike, shoot photos, and garden. Backgrounds stay close to
 * white so text contrast is never spent on atmosphere, forest green carries
 * every action, and the ember accent is reserved for the one decisive control
 * on a screen. Every foreground/background pair below meets WCAG AA for
 * normal-sized text.
 */
export const BrandColors = {
  forest: '#0E5142',
  forestPressed: '#083C31',
  ember: '#C2410C',
  emberPressed: '#9A3412',
  sky: '#5FB4D9',
  skySoft: '#E5F4FA',
  ink: '#18312B',
  white: '#FFFFFF',
} as const;

export const Colors = {
  light: {
    text: BrandColors.ink,
    textSecondary: '#51645F',
    textMuted: '#64756F',
    inverseText: BrandColors.white,
    background: '#FBFCFB',
    surface: BrandColors.white,
    backgroundElement: '#F1F5F3',
    backgroundSelected: '#DDECE7',
    primary: BrandColors.forest,
    primaryPressed: BrandColors.forestPressed,
    accent: BrandColors.ember,
    accentPressed: BrandColors.emberPressed,
    info: '#237CA4',
    infoSurface: BrandColors.skySoft,
    border: '#A6B8B2',
    divider: '#CBD7D3',
    success: '#236B4D',
    successSurface: '#E3F3EA',
    warning: '#855B00',
    warningSurface: '#FFF1C7',
    danger: '#A22D2D',
    dangerPressed: '#7D2020',
    dangerSurface: '#FBE8E8',
    overlay: 'rgba(10, 35, 29, 0.48)',
  },
  dark: {
    text: '#F5FAF8',
    textSecondary: '#C4D2CE',
    textMuted: '#A9BBB5',
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
export const FontFamilies = {
  regular: 'Pretendard-Regular',
  semiBold: 'Pretendard-SemiBold',
  extraBold: 'Pretendard-ExtraBold',
} as const;

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

/** Named keys are preferred in new screens; legacy numeric keys stay intact. */
export const Spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  huge: 40,
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
  pill: 999,
} as const;

export const TouchTarget = {
  minimum: 56,
  compact: 48,
} as const;

export const Layout = {
  screenPadding: 20,
  sectionGap: 28,
  cardPadding: 20,
  maxContentWidth: 720,
} as const;

export const Shadows = {
  card: '0 3px 12px rgba(14, 81, 66, 0.10)',
  floating: '0 8px 24px rgba(14, 81, 66, 0.18)',
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = Layout.maxContentWidth;

/** Lowercase aliases keep screen code concise without weakening the full theme API. */
export const colors = Colors.light;
export const spacing = Spacing;
export const radii = Radius;
