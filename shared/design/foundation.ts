/** The deployed web forest palette is the source for both light themes. */
export const ForestPalette = {
  canvas: "#eef2e9",
  canvasDeep: "#dfe7d8",
  surface: "#ffffff",
  ink: "#24382b",
  muted: "#526451",
  primary: "#356347",
  primaryStrong: "#274b34",
  sage: "#779367",
  surfaceSoft: "#e4edda",
  lineSoft: "#d0daca",
  accent: "#bd522f",
  accentStrong: "#9a3412",
  accentSoft: "#fde7df",
  sun: "#f0bf4f",
  line: "#80968f",
  success: "#277357",
  warning: "#9a501f",
  warningSoft: "#fff1c7",
  danger: "#a83b35",
  dangerStrong: "#8c2f2a",
  dangerSoft: "#fbe8e8",
  ambientStart: "#f8faf5",
  shadowInk: "#14342e",
} as const;

function withOpacity(hex: string, opacity: number): string {
  const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return `rgba(${channels.join(", ")}, ${opacity})`;
}

export const LightColors = {
  text: ForestPalette.ink,
  textSecondary: ForestPalette.muted,
  textMuted: ForestPalette.muted,
  inverseText: ForestPalette.surface,
  background: ForestPalette.canvas,
  surface: ForestPalette.surface,
  backgroundElement: ForestPalette.surfaceSoft,
  backgroundSelected: ForestPalette.canvasDeep,
  primary: ForestPalette.primary,
  primaryPressed: ForestPalette.primaryStrong,
  accent: ForestPalette.accent,
  accentPressed: ForestPalette.accentStrong,
  info: ForestPalette.primaryStrong,
  infoSurface: ForestPalette.surfaceSoft,
  border: ForestPalette.line,
  divider: ForestPalette.lineSoft,
  success: ForestPalette.success,
  successSurface: ForestPalette.surfaceSoft,
  warning: ForestPalette.warning,
  warningSurface: ForestPalette.warningSoft,
  danger: ForestPalette.danger,
  dangerPressed: ForestPalette.dangerStrong,
  dangerSurface: ForestPalette.dangerSoft,
  overlay: withOpacity(ForestPalette.ink, 0.48),
} as const;

export const Typography = {
  family: "Pretendard",
  variableFamily: "Pretendard Variable",
  nativeFamilies: {
    regular: "Pretendard-Regular",
    semiBold: "Pretendard-SemiBold",
    extraBold: "Pretendard-ExtraBold",
  },
} as const;

/** Logical units: CSS px on web, density-independent units on native. */
export const Spacing = {
  none: 0, xxs: 2, xs: 4, sm: 8, md: 12, lg: 16,
  xl: 20, xxl: 24, xxxl: 32, huge: 40,
  half: 2, one: 4, two: 8, three: 16, four: 24, five: 32, six: 64,
} as const;

export const Radius = { sm: 10, md: 14, lg: 20, xl: 24, pill: 999 } as const;
export const TouchTarget = { minimum: 56, compact: 48 } as const;

export const ControlDimensions = {
  minHeight: TouchTarget.minimum,
  largeTextMinHeight: 60,
  radius: Radius.md,
  paddingHorizontal: Spacing.xl,
  paddingVertical: Spacing.md,
  gap: Spacing.sm,
  borderWidth: 2,
  quietBorderWidth: 1,
  disabledOpacity: 0.58,
} as const;

export const CardDimensions = {
  radius: Radius.lg,
  padding: Spacing.xl,
  borderWidth: 1,
} as const;

export const Layout = {
  screenPadding: Spacing.xl,
  sectionGap: 28,
  cardPadding: CardDimensions.padding,
  maxContentWidth: 720,
} as const;

export const Shadows = {
  card: `0 3px 12px ${withOpacity(ForestPalette.primary, 0.1)}`,
  floating: `0 8px 24px ${withOpacity(ForestPalette.primary, 0.18)}`,
  web: `0 18px 50px ${withOpacity(ForestPalette.shadowInk, 0.1)}`,
} as const;

export const AmbientColors = {
  start: ForestPalette.ambientStart,
  tint: withOpacity(ForestPalette.sage, 0.14),
} as const;

export type ButtonRole = "primary" | "secondary" | "quiet" | "danger" | "accent";
export type ButtonVariant = ButtonRole | "outline" | "ghost";
export const ButtonRoleAliases = { outline: "secondary", ghost: "quiet" } as const;

export interface ButtonAppearance {
  background: string;
  pressed: string;
  text: string;
  border: string;
  pressedBorder: string;
  borderWidth: number;
}

export type ButtonTheme = {
  [Key in "surface" | "text" | "inverseText" | "primary" | "primaryPressed" |
    "accent" | "accentPressed" | "backgroundElement" | "border" |
    "danger" | "dangerSurface"]: string;
};

/** Filled primary/accent; outlined secondary/danger; neutral bordered quiet. */
export function getButtonRoles(theme: ButtonTheme): Record<ButtonRole, ButtonAppearance> {
  const filled = (background: string, pressed: string): ButtonAppearance => ({
    background, pressed, text: theme.inverseText,
    border: background, pressedBorder: pressed,
    borderWidth: ControlDimensions.borderWidth,
  });
  const outlined = (text: string, border: string, pressed: string): ButtonAppearance => ({
    background: theme.surface, pressed, text, border, pressedBorder: border,
    borderWidth: ControlDimensions.borderWidth,
  });

  return {
    primary: filled(theme.primary, theme.primaryPressed),
    secondary: outlined(theme.primaryPressed, theme.primary, theme.backgroundElement),
    quiet: {
      ...outlined(theme.text, theme.border, theme.backgroundElement),
      borderWidth: ControlDimensions.quietBorderWidth,
    },
    danger: outlined(theme.danger, theme.danger, theme.dangerSurface),
    accent: filled(theme.accent, theme.accentPressed),
  };
}

export function getButtonAppearance(theme: ButtonTheme, variant: ButtonVariant): ButtonAppearance {
  const role = variant === "outline" || variant === "ghost" ? ButtonRoleAliases[variant] : variant;
  return getButtonRoles(theme)[role];
}
