import { useFonts } from 'expo-font';
import materialSymbols from 'expo-symbols/androidWeights/regular';
import { Text, View, type ColorValue } from 'react-native';

/** The installed Expo Material Symbols outline font, shared by every UI icon. */
const glyphs = {
  home: 59530,
  groups: 62003,
  calendar: 60364,
  chat: 57546,
  person: 59389,
  notifications: 59380,
  explore: 59514,
  activity: 58375,
  handshake: 60363,
  check: 58826,
  back: 58820,
  forward: 58824,
} as const;

export type AppIconName = keyof typeof glyphs;

export function AppIcon({ name, color, size = 24 }: { name: AppIconName; color: ColorValue; size?: number }) {
  const [loaded] = useFonts({ [materialSymbols.name]: materialSymbols.font });
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {loaded ? (
        <Text
          // This private-use glyph is a graphic; readable labels still scale.
          allowFontScaling={false}
          selectable={false}
          style={{ color, fontFamily: materialSymbols.name, fontSize: size, lineHeight: size, includeFontPadding: false }}>
          {String.fromCodePoint(glyphs[name])}
        </Text>
      ) : null}
    </View>
  );
}
