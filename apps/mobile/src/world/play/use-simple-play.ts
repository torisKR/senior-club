import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { useReduceMotion } from '@/fx/use-reduce-motion';

/**
 * 낭독기(TalkBack)나 '동작 줄이기'를 쓰면 놀이를 큰 버튼 한두 번의 단순한 방식으로 바꿉니다.
 * 동작 설정을 아직 읽는 중이면 단순한 쪽으로 둡니다.
 */
export function useSimplePlay(): boolean {
  const reduceMotion = useReduceMotion();
  const [screenReader, setScreenReader] = useState(false);

  useEffect(() => {
    let alive = true;
    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', (enabled) => {
      if (alive) setScreenReader(enabled);
    });
    AccessibilityInfo.isScreenReaderEnabled().then(
      (enabled) => { if (alive) setScreenReader(enabled); },
      () => undefined,
    );
    return () => {
      alive = false;
      subscription?.remove();
    };
  }, []);

  return screenReader || reduceMotion !== false;
}
