import { Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Native tabs can report a zero top inset on edge-to-edge Android builds.
 * Fall back to the platform status-bar height so content never sits under it.
 */
export function useEffectiveSafeAreaInsets() {
  const insets = useSafeAreaInsets();
  const androidStatusBarHeight = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0;

  return {
    ...insets,
    top: Math.max(insets.top, androidStatusBarHeight),
  };
}
