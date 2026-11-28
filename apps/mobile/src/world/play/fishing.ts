/**
 * 낚시 놀이의 판정과 상태 전이: 찌 던지기 → 입질 → 챔질 → 릴 감기. 순수 함수만 둡니다.
 * 시간은 화면이 넘겨 주는 경과 시간(dtMs)으로만 흐르므로, 화면이 멈추면 낚시도 멈춥니다.
 */
import { FISH, FISH_CATCH_WINDOW_MS, rollBiteDelayMs, type FishId } from '../life';

/** 물 위의 자리. 가로·세로 모두 0~1. */
export interface Point { x: number; y: number }
export interface FishShadow extends Point { facingLeft: boolean }
export type FishingOutcome = 'landed' | 'missed' | 'snapped' | 'escaped';
export interface ReelProfile {
  /** 버티지 않을 때 끝까지 감는 데 걸리는 누름 시간 */
  reelMs: number;
  /** 감은 정도(at)에 이르면 ms 동안 버팁니다 */
  struggles: readonly { at: number; ms: number }[];
}

export type FishingState =
  | { phase: 'aim'; clockMs: number }
  | { phase: 'wait'; clockMs: number; cast: Point; biteInMs: number }
  | { phase: 'bite'; clockMs: number; cast: Point; windowLeftMs: number }
  | {
      phase: 'reel'; clockMs: number; cast: Point; fishId: FishId; profile: ReelProfile;
      /** 줄 힘 0~1. 1이면 끊어집니다. */
      tension: number;
      /** 감은 정도 0~1. 1이면 낚습니다. */
      progress: number;
      slackMs: number;
      struggleLeftMs: number;
      struggleIndex: number;
    }
  | { phase: 'done'; clockMs: number; outcome: FishingOutcome; fishId: FishId | null };

export const TENSION_START = 0.4;
/** 평소에는 아무리 감아도 이 힘을 넘지 않아, 버틸 때만 줄이 끊어질 수 있습니다. */
export const CALM_TENSION_CAP = 0.7;
const HOLD_RISE_PER_S = 0.12;
const EASE_TO_CAP_PER_S = 0.1;
/** 버티는 동안 누르고 있을 때 오르는 속도 — 가장 팽팽한 상태에서도 1.5초의 여유가 있습니다. */
const STRUGGLE_RISE_PER_S = 0.2;
const RELEASE_FALL_PER_S = 0.35;
/** 줄 힘이 바닥난 채로 이만큼 지나면 물고기가 달아납니다. */
export const SLACK_LIMIT_MS = 2500;
const SLACK_SIGNAL = 0.15;
const TIGHT_SIGNAL = 0.85;
const NEAR_SHADOW_REACH = 0.5;
const NEAR_SHADOW_SPEEDUP = 0.6;

/** 물고기 그림자가 도는 길. 화면 밖으로 나가지 않는 느린 8자·타원입니다. */
const SHADOW_PATHS = [
  { cx: 0.3, cy: 0.34, rx: 0.2, ry: 0.14, periodMs: 11_000, offset: 0 },
  { cx: 0.68, cy: 0.56, rx: 0.22, ry: 0.18, periodMs: 14_000, offset: 0.4 },
  { cx: 0.45, cy: 0.74, rx: 0.3, ry: 0.1, periodMs: 17_000, offset: 0.75 },
] as const;

const clamp01 = (value: number) => Math.min(Math.max(value, 0), 1);

export function shadowPositions(clockMs: number): FishShadow[] {
  return SHADOW_PATHS.map((path) => {
    const angle = 2 * Math.PI * (clockMs / path.periodMs + path.offset);
    return {
      x: path.cx + path.rx * Math.cos(angle),
      y: path.cy + path.ry * Math.sin(2 * angle),
      facingLeft: Math.sin(angle) > 0,
    };
  });
}

/** 가장 가까운 그림자와 가까울수록 입질이 빨라집니다. */
export function biteDelayMs(cast: Point, shadows: readonly Point[], rand: number): number {
  const nearest = shadows.reduce((best, shadow) => Math.min(best, Math.hypot(shadow.x - cast.x, shadow.y - cast.y)), Infinity);
  const closeness = clamp01(1 - nearest / NEAR_SHADOW_REACH);
  return Math.round(rollBiteDelayMs(rand) * (1 - NEAR_SHADOW_SPEEDUP * closeness));
}

/** 희귀할수록(뽑힐 확률이 낮을수록) 오래, 자주, 길게 버팁니다. */
export function reelProfile(fishId: FishId): ReelProfile {
  const commonest = Math.max(...FISH.map((fish) => fish.weight));
  const weight = FISH.find((fish) => fish.id === fishId)?.weight ?? commonest;
  const rarity = clamp01(1 - weight / commonest);
  const count = Math.round(rarity * 3);
  return {
    reelMs: Math.round(3000 + 6000 * rarity),
    struggles: Array.from({ length: count }, (_, index) => ({
      at: (index + 1) / (count + 1),
      ms: Math.round(1500 + 1000 * rarity),
    })),
  };
}

export function createFishing(): FishingState {
  return { phase: 'aim', clockMs: 0 };
}

export function castLine(state: FishingState, spot: Point, rand: number): FishingState {
  if (state.phase !== 'aim') return state;
  const cast = { x: clamp01(spot.x), y: clamp01(spot.y) };
  return { phase: 'wait', clockMs: state.clockMs, cast, biteInMs: biteDelayMs(cast, shadowPositions(state.clockMs), rand) };
}

/** 챔질. 입질 전에는 아무 일도 없고, skipReel이면 릴 감기 없이 바로 낚습니다(단순 모드). */
export function setHook(state: FishingState, fishId: FishId, skipReel = false): FishingState {
  if (state.phase !== 'bite') return state;
  if (skipReel) return { phase: 'done', clockMs: state.clockMs, outcome: 'landed', fishId };
  return {
    phase: 'reel', clockMs: state.clockMs, cast: state.cast, fishId, profile: reelProfile(fishId),
    tension: TENSION_START, progress: 0, slackMs: 0, struggleLeftMs: 0, struggleIndex: 0,
  };
}

export type ReelSignal = 'struggle' | 'tight' | 'slack' | 'steady';

export function reelSignal(state: FishingState): ReelSignal | null {
  if (state.phase !== 'reel') return null;
  if (state.struggleLeftMs > 0) return 'struggle';
  if (state.tension >= TIGHT_SIGNAL) return 'tight';
  return state.tension <= SLACK_SIGNAL ? 'slack' : 'steady';
}

type Reeling = Extract<FishingState, { phase: 'reel' }>;

function nextTension(state: Reeling, seconds: number, holding: boolean): number {
  if (!holding) return Math.max(0, state.tension - RELEASE_FALL_PER_S * seconds);
  if (state.struggleLeftMs > 0) return state.tension + STRUGGLE_RISE_PER_S * seconds;
  return state.tension > CALM_TENSION_CAP
    ? Math.max(CALM_TENSION_CAP, state.tension - EASE_TO_CAP_PER_S * seconds)
    : Math.min(CALM_TENSION_CAP, state.tension + HOLD_RISE_PER_S * seconds);
}

function tickReel(state: Reeling, dtMs: number, holding: boolean): FishingState {
  const clockMs = state.clockMs + dtMs;
  const lost = (outcome: FishingOutcome): FishingState => ({ phase: 'done', clockMs, outcome, fishId: null });
  const struggling = state.struggleLeftMs > 0;
  const tension = nextTension(state, dtMs / 1000, holding);
  if (tension >= 1) return lost('snapped');
  const slackMs = tension <= 0 ? state.slackMs + dtMs : 0;
  if (slackMs >= SLACK_LIMIT_MS) return lost('escaped');
  const progress = holding && !struggling ? state.progress + dtMs / state.profile.reelMs : state.progress;
  if (progress >= 1) return { phase: 'done', clockMs, outcome: 'landed', fishId: state.fishId };
  const upcoming = struggling ? undefined : state.profile.struggles[state.struggleIndex];
  const startsStruggle = upcoming !== undefined && progress >= upcoming.at;
  return {
    ...state, clockMs, tension, progress, slackMs,
    struggleLeftMs: startsStruggle ? upcoming.ms : Math.max(0, state.struggleLeftMs - dtMs),
    struggleIndex: state.struggleIndex + (startsStruggle ? 1 : 0),
  };
}

/** dtMs만큼 시간을 흘립니다. holding은 릴 버튼을 누르고 있는지입니다. */
export function tickFishing(state: FishingState, dtMs: number, holding: boolean): FishingState {
  const clockMs = state.clockMs + dtMs;
  switch (state.phase) {
    case 'aim':
      return { ...state, clockMs };
    case 'wait':
      return state.biteInMs - dtMs <= 0
        ? { phase: 'bite', clockMs, cast: state.cast, windowLeftMs: FISH_CATCH_WINDOW_MS }
        : { ...state, clockMs, biteInMs: state.biteInMs - dtMs };
    case 'bite':
      return state.windowLeftMs - dtMs <= 0
        ? { phase: 'done', clockMs, outcome: 'missed', fishId: null }
        : { ...state, clockMs, windowLeftMs: state.windowLeftMs - dtMs };
    case 'reel':
      return tickReel(state, dtMs, holding);
    default:
      return state;
  }
}

/** 지도 종류와 상관없이, 선착장 위이거나 물 타일(강·연못·바다·계곡 모두 'water') 바로 옆이면 낚시할 수 있습니다. */
export function canFishAt(hereType: string, neighborTypes: readonly string[]): boolean {
  return hereType === 'dock' || neighborTypes.includes('water');
}
