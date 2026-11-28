import { useCallback, useEffect, useRef, useState } from 'react';

import type { ParkGolfHoleSpec } from './arcade-logic';
import {
  PARK_GOLF_STEP_SECONDS, launchParkGolfBall, stepParkGolfBall,
  type ParkGolfShot, type ParkGolfStepEvents, type Point,
} from './park-golf-physics';

/** 화면이 잠깐 멈췄다 돌아와도 공이 순간 이동하지 않도록 한 프레임에 따라잡는 시간을 제한합니다. */
const MAX_FRAME_SECONDS = 0.1;

export interface ParkGolfRollRun {
  hole: ParkGolfHoleSpec;
  from: Point;
  shot: ParkGolfShot;
  onFrame: (position: Point) => void;
  onEvents: (events: ParkGolfStepEvents) => void;
  /** 공이 멈췄거나, 중간에 바로 결과로 넘어가야 할 때(settle) 한 번 불립니다. */
  onRest: () => void;
}

/** 물리 스텝을 프레임마다 돌려 공을 실제로 굴리는 루프. */
export function useParkGolfRoll() {
  const active = useRef<{ frame: number; onRest: () => void } | null>(null);
  const [rolling, setRolling] = useState(false);

  const stop = useCallback(() => {
    const run = active.current;
    if (!run) return null;
    active.current = null;
    cancelAnimationFrame(run.frame);
    setRolling(false);
    return run.onRest;
  }, []);
  /** 결과 없이 굴리기를 버립니다(홀 변경 등). */
  const cancel = useCallback(() => { stop(); }, [stop]);
  /** 남은 굴리기를 건너뛰고 바로 결과를 확정합니다(동작 줄이기, 화면 이탈). */
  const settle = useCallback(() => { stop()?.(); }, [stop]);

  const start = useCallback((run: ParkGolfRollRun) => {
    stop();
    const handle = { frame: 0, onRest: run.onRest };
    let ball = launchParkGolfBall(run.hole, run.from, run.shot);
    let last: number | null = null;
    let pending = 0;
    const tick = (now: number) => {
      if (active.current !== handle) return;
      pending += last === null ? PARK_GOLF_STEP_SECONDS : Math.min(MAX_FRAME_SECONDS, (now - last) / 1000);
      last = now;
      while (pending >= PARK_GOLF_STEP_SECONDS && ball.moving) {
        const step = stepParkGolfBall(run.hole, ball);
        ball = step.ball;
        pending -= PARK_GOLF_STEP_SECONDS;
        run.onEvents(step.events);
      }
      run.onFrame(ball);
      if (ball.moving) handle.frame = requestAnimationFrame(tick);
      else settle();
    };
    active.current = handle;
    setRolling(true);
    handle.frame = requestAnimationFrame(tick);
  }, [stop, settle]);

  useEffect(() => () => {
    if (active.current) cancelAnimationFrame(active.current.frame);
    active.current = null;
  }, []);

  return { rolling, start, settle, cancel };
}
