import type { TextProps, TextStyle } from 'react-native';
import { Text } from 'react-native';

import { FontSizes, FontWeights, LineHeights, type ThemeColor } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useTheme } from '@/hooks/use-theme';

export type AppTextVariant =
  | 'caption'
  | 'body'
  | 'bodyStrong'
  | 'key'
  | 'sectionTitle'
  | 'title'
  | 'display'
  | 'button';

export interface AppTextProps extends TextProps {
  variant?: AppTextVariant;
  color?: ThemeColor | string;
  align?: TextStyle['textAlign'];
}

const sizeKeyByVariant: Record<AppTextVariant, keyof (typeof FontSizes)['standard']> = {
  caption: 'caption',
  body: 'body',
  bodyStrong: 'body',
  key: 'key',
  sectionTitle: 'sectionTitle',
  title: 'title',
  display: 'display',
  button: 'key',
};

/**
 * Android does not synthesize weights for bundled fonts, so each variant names
 * the Pretendard file that renders it instead of relying on `fontWeight`.
 */
const familyByVariant: Record<AppTextVariant, string> = {
  caption: FontWeights.emphasis,
  body: FontWeights.body,
  bodyStrong: FontWeights.emphasis,
  key: FontWeights.emphasis,
  sectionTitle: FontWeights.strong,
  title: FontWeights.strong,
  display: FontWeights.strong,
  button: FontWeights.strong,
};

export function AppText({
  variant = 'body',
  color,
  align,
  selectable = true,
  style,
  ...props
}: AppTextProps) {
  const theme = useTheme();
  const { largeTextEnabled } = useAppState();
  const mode = largeTextEnabled ? 'large' : 'standard';
  const sizeKey = sizeKeyByVariant[variant];
  const resolvedColor = color && color in theme ? theme[color as ThemeColor] : (color ?? theme.text);

  return (
    <Text
      allowFontScaling
      selectable={selectable}
      style={[
        {
          color: resolvedColor,
          fontFamily: familyByVariant[variant],
          fontSize: FontSizes[mode][sizeKey],
          lineHeight: LineHeights[mode][sizeKey],
          textAlign: align,
        },
        style,
      ]}
      {...props}
    />
  );
}

