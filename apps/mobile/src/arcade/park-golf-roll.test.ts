// @vitest-environment jsdom
import { act, createElement, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PARK_GOLF_HOLES } from './arcade-logic';
import { PARK_GOLF_STEP_SECONDS, rollParkGolfShot, type Point } from './park-golf-physics';
import { useParkGolfRoll, type ParkGolfRollRun } from './park-golf-roll';

const hole = PARK_GOLF_HOLES[0];
const shot = { angleDeg: 0, power: 0.5 };
const FRAME_MS = PARK_GOLF_STEP_SECONDS * 1000;

let root: Root;
let container: HTMLDivElement;
type Roller = ReturnType<typeof useParkGolfRoll>;
let roller: Roller;
function Probe({ expose }: { expose: (value: Roller) => void }) {
  const value = useParkGolfRoll();
  useEffect(() => { expose(value); });
  return null;
}
function run(overrides: Partial<ParkGolfRollRun> = {}) {
  const frames: Point[] = [];
  const callbacks = { onFrame: vi.fn((p: Point) => { frames.push({ x: p.x, y: p.y }); }), onEvents: vi.fn(), onRest: vi.fn() };
  act(() => roller.start({ hole, from: hole.tee, shot, ...callbacks, ...overrides }));
  return { frames, ...callbacks };
}
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms); });

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout', 'Date'] });
  container = document.createElement('div');
  root = createRoot(container);
  act(() => root.render(createElement(Probe, { expose: (value) => { roller = value; } })));
});
afterEach(() => {
  act(() => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('park golf frame loop', () => {
  it('steps the ball every frame, then rests once at the same spot as the instant roll', () => {
    const expected = rollParkGolfShot(hole, hole.tee, shot);
    const { frames, onRest, onEvents } = run();
    expect(roller.rolling).toBe(true);
    advance(FRAME_MS * 3 + 1);
    expect(frames.length).toBeGreaterThanOrEqual(2);
    expect(frames[frames.length - 1].y).toBeLessThan(frames[0].y);
    expect(onRest).not.toHaveBeenCalled();
    advance(5000);
    expect(onRest).toHaveBeenCalledOnce();
    expect(roller.rolling).toBe(false);
    const last = frames[frames.length - 1];
    expect({ x: Number(last.x.toFixed(1)), y: Number(last.y.toFixed(1)) }).toEqual(expected.finalPos);
    expect(onEvents).toHaveBeenCalledTimes(expected.path.length - 1);
    const framesAtRest = frames.length;
    advance(1000);
    expect(frames.length).toBe(framesAtRest);
  });

  it('catches up at most a tenth of a second after a long pause', () => {
    const { onEvents } = run();
    advance(FRAME_MS + 1);
    const before = onEvents.mock.calls.length;
    act(() => { vi.setSystemTime(Date.now() + 3000); vi.advanceTimersToNextFrame(); });
    expect(onEvents.mock.calls.length - before).toBeLessThanOrEqual(7);
  });

  it('settles straight to the result, and cancel drops the roll without one', () => {
    const settled = run();
    advance(FRAME_MS * 2);
    act(() => roller.settle());
    expect(settled.onRest).toHaveBeenCalledOnce();
    expect(roller.rolling).toBe(false);
    const framesAtSettle = settled.frames.length;
    advance(1000);
    expect(settled.frames.length).toBe(framesAtSettle);

    const cancelled = run();
    advance(FRAME_MS * 2);
    act(() => roller.cancel());
    advance(5000);
    expect(cancelled.onRest).not.toHaveBeenCalled();
    expect(roller.rolling).toBe(false);
  });

  it('stops stepping after unmount without reporting a result', () => {
    const { frames, onRest } = run();
    advance(FRAME_MS * 2);
    const framesAtUnmount = frames.length;
    act(() => root.unmount());
    advance(5000);
    expect(frames.length).toBe(framesAtUnmount);
    expect(onRest).not.toHaveBeenCalled();
    root = createRoot(container);
  });
});
