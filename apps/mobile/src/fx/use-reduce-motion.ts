import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** null means the OS preference is still being loaded; callers should stay static. */
export function useReduceMotion(): boolean | null {
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    let receivedChange = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      receivedChange = true;
      if (active) setReduceMotion(enabled);
    });

    AccessibilityInfo.isReduceMotionEnabled().then(
      (enabled) => {
        if (active && !receivedChange) setReduceMotion(enabled);
      },
      () => {
        // If the platform cannot report its setting, avoid unexpected motion.
        if (active && !receivedChange) setReduceMotion(true);
      },
    );

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return reduceMotion;
}
