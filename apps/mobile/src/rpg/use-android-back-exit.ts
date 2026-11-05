import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useReducer } from 'react';
import { BackHandler, Platform } from 'react-native';

import { backExitReducer, INITIAL_BACK_EXIT } from './back-exit';

/**
 * 안드로이드 홈(탭 루트) 전용 뒤로가기 처리.
 *
 * - 뒤로가기 → "게임을 종료할까요?" 확인 다이얼로그
 * - 다이얼로그에서 취소/한 번 더 뒤로가기 → 그대로 플레이
 * - "종료하기" 확정 → BackHandler.exitApp()
 *
 * 홈 탭이 포커스일 때만 등록하므로, 다른 탭의 뒤로가기는 Expo Router 기본 동작을 따릅니다.
 * iOS/웹에서는 아무 것도 등록하지 않습니다.
 */
export function useAndroidBackExit() {
  const [state, dispatch] = useReducer(backExitReducer, INITIAL_BACK_EXIT);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return undefined;

      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        dispatch('back');
        // 기본 동작(즉시 종료)을 막고 확인을 받습니다.
        return true;
      });

      return () => {
        subscription.remove();
        dispatch('cancel');
      };
    }, []),
  );

  useEffect(() => {
    if (!state.exitRequested) return;
    dispatch('cancel');
    BackHandler.exitApp();
  }, [state.exitRequested]);

  const cancel = useCallback(() => dispatch('cancel'), []);
  const confirm = useCallback(() => dispatch('confirm'), []);

  return { confirming: state.confirming, cancel, confirm };
}
