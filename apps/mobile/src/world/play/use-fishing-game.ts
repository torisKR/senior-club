import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { useArcade } from '@/arcade/arcade-store';
import { playSfx } from '@/audio/sound-manager';

import { rollFish, type FishId } from '../life';
import { castLine, createFishing, setHook, tickFishing, type FishingState, type Point } from './fishing';

const TICK_MS = 50;
/** 화면이 잠깐 버벅여도 그 시간만큼 한꺼번에 흐르지 않게 합니다. */
const MAX_TICK_MS = 250;

export interface CatchResult { saved: boolean; isNew: boolean }

interface FishingGameOptions {
  /** 마을 화면이 가려지거나 앱이 뒤로 가면 false — 그동안 낚시 시간이 흐르지 않습니다. */
  active: boolean;
  simple: boolean;
  onLand: (fishId: FishId) => CatchResult;
  onNotice: (text: string) => void;
}

/** 낚시 한 판의 진행: 시간 흐름, 입력, 소리·진동 신호, 낚은 물고기 저장. */
export function useFishingGame({ active, simple, onLand, onNotice }: FishingGameOptions) {
  const { state: arcade, triggerHaptic } = useArcade();
  const [game, setGame] = useState<FishingState>(createFishing);
  const [result, setResult] = useState<CatchResult | null>(null);
  const [holding, setHolding] = useState(false);
  const gameRef = useRef(game);
  const holdingRef = useRef(false);

  const hold = (on: boolean) => {
    holdingRef.current = on;
    setHolding(on);
  };
  const signal = () => {
    playSfx('chime', arcade.soundEnabled);
    triggerHaptic('medium');
  };
  const commit = (next: FishingState) => {
    const prev = gameRef.current;
    if (next === prev) return;
    gameRef.current = next;
    setGame(next);
    if (prev.phase === 'wait' && next.phase === 'bite') signal();
    if (prev.phase === 'reel' && next.phase === 'reel' && prev.struggleLeftMs === 0 && next.struggleLeftMs > 0) signal();
    if (prev.phase !== 'done' && next.phase === 'done') {
      hold(false);
      if (next.fishId) setResult(onLand(next.fishId));
    }
  };

  const onTick = useEffectEvent((dtMs: number) => commit(tickFishing(gameRef.current, dtMs, holdingRef.current)));
  const finished = game.phase === 'done';
  useEffect(() => {
    if (!active || finished) return;
    let last = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      onTick(Math.min(now - last, MAX_TICK_MS));
      last = now;
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [active, finished]);

  return {
    game,
    result,
    holding,
    hold,
    cast: (spot: Point) => {
      if (gameRef.current.phase !== 'aim') return;
      playSfx('tileMatch', arcade.soundEnabled);
      commit(castLine(gameRef.current, spot, Math.random()));
    },
    pull: () => {
      const current = gameRef.current;
      if (current.phase === 'wait') onNotice('아직이에요. 찌가 쏙 들어갈 때 당겨 주세요.');
      if (current.phase === 'bite') commit(setHook(current, rollFish(Math.random()).id, simple));
    },
    /** 저장이 막혔던 물고기를 다시 담습니다. */
    keep: () => {
      const current = gameRef.current;
      if (current.phase === 'done' && current.fishId && !result?.saved) setResult(onLand(current.fishId));
    },
    again: () => {
      setResult(null);
      commit(createFishing());
    },
  };
}
