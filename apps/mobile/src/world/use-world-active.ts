import { useIsFocused } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** 마을 화면이 보이고 앱이 활성일 때만 움직임을 처리합니다. */
export function useWorldActive(): boolean {
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(() => AppState.currentState == null || AppState.currentState === 'active');
  useEffect(() => {
    const listener = AppState.addEventListener('change', (state) => setForeground(state === 'active'));
    return () => listener.remove();
  }, []);
  return focused && foreground;
}
