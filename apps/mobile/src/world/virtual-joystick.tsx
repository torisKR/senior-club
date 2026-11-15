import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, StyleSheet, View, type AccessibilityActionEvent } from 'react-native';

import { joystickVector } from './joystick-direction';

type StepDirection = 'up' | 'down' | 'left' | 'right';

const BASE_SIZE = 136;
const THUMB_SIZE = 60;
const MAX_TRAVEL = (BASE_SIZE - THUMB_SIZE) / 2;

const DELTAS: Record<StepDirection, { dx: number; dy: number; label: string }> = {
  up: { dx: 0, dy: -1, label: '위로 걷기' },
  down: { dx: 0, dy: 1, label: '아래로 걷기' },
  left: { dx: -1, dy: 0, label: '왼쪽으로 걷기' },
  right: { dx: 1, dy: 0, label: '오른쪽으로 걷기' },
};

/**
 * 좌하단 가상 조이스틱. 끄는 방향과 세기(0~1)를 그대로 넘겨 8방향으로 자유롭게 걷습니다.
 * onStep 은 TalkBack 사용자를 위한 한 칸 걷기입니다.
 */
export function VirtualJoystick({
  onVector,
  onRelease,
  onStep,
  disabled = false,
  reduceMotion = null,
}: {
  onVector: (x: number, y: number) => void;
  onRelease: () => void;
  onStep: (dx: number, dy: number) => void;
  disabled?: boolean;
  reduceMotion?: boolean | null;
}) {
  const [thumb] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const handlers = useRef({ onVector, onRelease });
  const active = useRef(false);
  const disabledRef = useRef(disabled);
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    handlers.current = { onVector, onRelease };
  }, [onVector, onRelease]);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
    if (reduceMotion !== false && !active.current) {
      thumb.stopAnimation();
      thumb.setValue({ x: 0, y: 0 });
    }
  }, [reduceMotion, thumb]);

  const stopGesture = useCallback((animate: boolean) => {
    if (!active.current) return;
    active.current = false;
    handlers.current.onVector(0, 0);
    handlers.current.onRelease();
    if (animate && reduceMotionRef.current === false) Animated.spring(thumb, { toValue: { x: 0, y: 0 }, useNativeDriver: true }).start();
    else thumb.setValue({ x: 0, y: 0 });
  }, [thumb]);

  useEffect(() => {
    disabledRef.current = disabled;
    if (disabled) stopGesture(false);
  }, [disabled, stopGesture]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopGesture(false);
    });
    return () => {
      subscription.remove();
      stopGesture(false);
    };
  }, [stopGesture]);

  // eslint-disable-next-line react-hooks/refs -- 렌더 중이 아니라 PanResponder 콜백에서만 ref를 읽습니다.
  const [responder] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => !disabledRef.current,
      onMoveShouldSetPanResponder: () => !disabledRef.current,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        if (disabledRef.current) return;
        thumb.stopAnimation();
        thumb.setValue({ x: 0, y: 0 });
        active.current = true;
      },
      onPanResponderMove: (_, gesture) => {
        if (!active.current) return;
        const length = Math.hypot(gesture.dx, gesture.dy);
        const scale = length > MAX_TRAVEL ? MAX_TRAVEL / length : 1;
        thumb.setValue({ x: gesture.dx * scale, y: gesture.dy * scale });
        const vector = joystickVector(gesture.dx, gesture.dy, MAX_TRAVEL);
        handlers.current.onVector(vector.x, vector.y);
      },
      onPanResponderRelease: () => stopGesture(true),
      onPanResponderTerminate: () => stopGesture(false),
    }),
  );

  const onAccessibilityAction = (event: AccessibilityActionEvent) => {
    if (disabled) return;
    const delta = DELTAS[event.nativeEvent.actionName as StepDirection];
    if (delta) onStep(delta.dx, delta.dy);
  };

  return (
    <View
      testID="virtual-joystick"
      style={styles.base}
      accessible
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityLabel="이동 조이스틱"
      accessibilityHint="원하는 방향으로 끌고 있으면 걷습니다. 화면 읽기 도구의 동작 메뉴에서 방향을 선택하면 한 칸 이동합니다."
      accessibilityActions={(Object.keys(DELTAS) as StepDirection[]).map((name) => ({ name, label: DELTAS[name].label }))}
      onAccessibilityAction={onAccessibilityAction}
      {...responder.panHandlers}>
      <Animated.View pointerEvents="none" style={[styles.thumb, { transform: thumb.getTranslateTransform() }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: BASE_SIZE,
    height: BASE_SIZE,
    borderRadius: BASE_SIZE / 2,
    backgroundColor: 'rgba(24, 38, 32, 0.45)',
    borderWidth: 3,
    borderColor: 'rgba(252, 249, 242, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FCF9F2',
    borderWidth: 3,
    borderColor: '#8A5A2B',
  },
});
