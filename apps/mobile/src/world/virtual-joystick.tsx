import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, PanResponder, StyleSheet, View, type AccessibilityActionEvent, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';

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
 * 떠다니는 가상 조이스틱. 마을의 빈 곳 어디든 누르면 그 자리에 조이스틱이 생기고,
 * 끄는 방향과 세기(0~1)를 그대로 넘겨 8방향으로 걷습니다. 손을 떼면 좌하단 쉼 자리로 돌아갑니다.
 * 화면 위 버튼·대화창은 이 층보다 위에 있어 그대로 눌립니다. onStep 은 TalkBack 한 칸 걷기입니다.
 */
export function VirtualJoystick({
  onVector,
  onRelease,
  onStep,
  disabled = false,
  reduceMotion = null,
  restLeft = 16,
  restBottom = 16,
}: {
  onVector: (x: number, y: number) => void;
  onRelease: () => void;
  onStep: (dx: number, dy: number) => void;
  disabled?: boolean;
  reduceMotion?: boolean | null;
  /** 손을 떼고 있을 때 조이스틱이 쉬는 좌하단 위치(dp). */
  restLeft?: number;
  restBottom?: number;
}) {
  const [thumb] = useState(() => new Animated.ValueXY({ x: 0, y: 0 }));
  const handlers = useRef({ onVector, onRelease });
  const active = useRef(false);
  const disabledRef = useRef(disabled);
  const reduceMotionRef = useRef(reduceMotion);
  const area = useRef<React.ComponentRef<typeof View>>(null);
  const areaOrigin = useRef({ x: 0, y: 0 });
  const [areaHeight, setAreaHeight] = useState(0);
  // 누른 자리(영역 기준 dp). null 이면 쉼 자리에 그립니다.
  const [touchOrigin, setTouchOrigin] = useState<{ x: number; y: number } | null>(null);
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
    setTouchOrigin(null);
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
      onPanResponderGrant: (event: GestureResponderEvent) => {
        if (disabledRef.current) return;
        thumb.stopAnimation();
        thumb.setValue({ x: 0, y: 0 });
        active.current = true;
        const { pageX, pageY } = event.nativeEvent;
        setTouchOrigin({ x: pageX - areaOrigin.current.x, y: pageY - areaOrigin.current.y });
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

  const onAreaLayout = (event: LayoutChangeEvent) => {
    setAreaHeight(event.nativeEvent.layout.height);
    area.current?.measureInWindow?.((x: number, y: number) => { areaOrigin.current = { x, y }; });
  };
  const center = touchOrigin ?? { x: restLeft + BASE_SIZE / 2, y: areaHeight - restBottom - BASE_SIZE / 2 };

  return (
    <View ref={area} testID="joystick-area" style={StyleSheet.absoluteFill} onLayout={onAreaLayout} {...responder.panHandlers}>
    <View
      testID="virtual-joystick"
      pointerEvents="box-none"
      style={[styles.base, { left: center.x - BASE_SIZE / 2, top: center.y - BASE_SIZE / 2 }, !touchOrigin && styles.resting, areaHeight === 0 && styles.hidden]}
      accessible
      accessibilityRole="adjustable"
      accessibilityState={{ disabled }}
      accessibilityLabel="이동 조이스틱"
      accessibilityHint="원하는 방향으로 끌고 있으면 걷습니다. 화면 읽기 도구의 동작 메뉴에서 방향을 선택하면 한 칸 이동합니다."
      accessibilityActions={(Object.keys(DELTAS) as StepDirection[]).map((name) => ({ name, label: DELTAS[name].label }))}
      onAccessibilityAction={onAccessibilityAction}>
      <Animated.View pointerEvents="none" style={[styles.thumb, { transform: thumb.getTranslateTransform() }]} />
    </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    width: BASE_SIZE,
    height: BASE_SIZE,
    borderRadius: BASE_SIZE / 2,
    backgroundColor: 'rgba(24, 38, 32, 0.45)',
    borderWidth: 3,
    borderColor: 'rgba(252, 249, 242, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 쉬는 동안은 옅게: 어디를 눌러도 된다는 안내 역할만 합니다.
  resting: { opacity: 0.55 },
  hidden: { opacity: 0 },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FCF9F2',
    borderWidth: 3,
    borderColor: '#8A5A2B',
  },
});
