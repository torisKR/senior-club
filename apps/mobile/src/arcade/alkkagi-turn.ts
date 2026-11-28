import type { AlkkagiStone } from './arcade-logic';
import { chooseAlkkagiAiShot, chooseAlkkagiShot, type AlkkagiAiLevel } from './alkkagi-ai';
import { simulateAlkkagiShot, type AlkkagiHit, type AlkkagiShot } from './alkkagi-physics';

/** 내 돌이 멈춘 뒤 상대가 튕기기까지 쉬는 프레임 수 (30fps 기준 약 0.7초) */
const OPPONENT_PAUSE_FRAMES = 20;

export interface AlkkagiTurn {
  /** 내 튕기기와 상대의 응수가 모두 끝난 뒤의 판 */
  stones: AlkkagiStone[];
  /** 내 튕기기 → 잠깐 멈춤 → 상대 튕기기를 이어 붙인 재생 프레임 */
  frames: AlkkagiStone[][];
  hits: AlkkagiHit[];
  /** 상대가 튕기기 시작하는 프레임. 상대가 두지 않았으면 null */
  aiStartFrame: number | null;
  aiShooterId: string | null;
  /** 내 튕기기로 나간 상대 돌 / 내 돌 */
  knockedOutByMe: string[];
  lostByMe: string[];
  /** 상대 튕기기로 나간 내 돌 / 상대 돌 */
  knockedOutByOpponent: string[];
  lostByOpponent: string[];
  /** 한 번에 상대 돌 2개 이상 탈락 */
  doubleKnockout: boolean;
  result: 'win' | 'lose' | 'continue';
}

const countAlive = (stones: readonly AlkkagiStone[], owner: AlkkagiStone['owner']) =>
  stones.filter((stone) => stone.owner === owner && stone.alive).length;
const ownedBy = (ids: readonly string[], prefix: 'p' | 'a') => ids.filter((id) => id.startsWith(prefix));
/** 상대 돌이 모두 나가면 승리, 그다음 내 돌이 모두 나가면 패배. */
const judge = (stones: readonly AlkkagiStone[]): AlkkagiTurn['result'] =>
  countAlive(stones, 'ai') === 0 ? 'win' : countAlive(stones, 'player') === 0 ? 'lose' : 'continue';

/**
 * 내 튕기기 한 번과, 대국이 이어지면 상대의 응수까지 계산합니다.
 * levelOverride 를 주면 급수(levelIdx) 대신 그 실력으로 응수합니다(이야기 시련용).
 */
export function resolveAlkkagiTurn(
  stones: readonly AlkkagiStone[],
  shot: AlkkagiShot,
  levelIdx: number,
  random: () => number,
  levelOverride?: AlkkagiAiLevel,
): AlkkagiTurn {
  const mine = simulateAlkkagiShot(stones, shot);
  const knockedOutByMe = ownedBy(mine.knockedOut, 'a');
  const base = {
    knockedOutByMe,
    lostByMe: ownedBy(mine.knockedOut, 'p'),
    doubleKnockout: knockedOutByMe.length >= 2,
  };
  const afterMine = judge(mine.stones);
  const reply = afterMine !== 'continue' ? null
    : levelOverride ? chooseAlkkagiShot(mine.stones, levelOverride, random) : chooseAlkkagiAiShot(mine.stones, levelIdx, random);
  if (!reply) {
    return {
      ...base, stones: mine.stones, frames: mine.frames, hits: mine.hits, aiStartFrame: null, aiShooterId: null,
      knockedOutByOpponent: [], lostByOpponent: [], result: afterMine,
    };
  }
  const theirs = simulateAlkkagiShot(mine.stones, reply);
  const pause = Array.from({ length: OPPONENT_PAUSE_FRAMES }, () => mine.stones);
  const aiStartFrame = mine.frames.length + pause.length;
  return {
    ...base,
    stones: theirs.stones,
    frames: [...mine.frames, ...pause, ...theirs.frames],
    hits: [...mine.hits, ...theirs.hits.map((hit) => ({ ...hit, frame: hit.frame + aiStartFrame }))],
    aiStartFrame,
    aiShooterId: reply.stoneId,
    knockedOutByOpponent: ownedBy(theirs.knockedOut, 'p'),
    lostByOpponent: ownedBy(theirs.knockedOut, 'a'),
    result: judge(theirs.stones),
  };
}
