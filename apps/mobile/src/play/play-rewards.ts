/**
 * 마을 놀이(제기차기·돌탑 쌓기) 별점, 하루 보상 상한, 최고 기록. 순수 함수만 둡니다.
 * 기록은 rpg·arcade 저장과 섞지 않고 별도 키(PLAY_RECORDS_KEY)에 둡니다.
 */
import type { Stars } from '@/arcade/round-stars';

export type PlayGameId = 'jegi' | 'stones';

export const PLAY_RECORDS_KEY = 'senior_club_play_records_v1';

export interface PlayRecords {
  best: Record<PlayGameId, number>;
  /** 아래 두 값이 쌓인 날짜(YYYY-MM-DD). 날이 바뀌면 0부터 다시 셉니다. */
  rewardDay: string | null;
  acornsToday: number;
  warmthToday: number;
}

export const EMPTY_PLAY_RECORDS: PlayRecords = { best: { jegi: 0, stones: 0 }, rewardDay: null, acornsToday: 0, warmthToday: 0 };

/** [별 2개, 별 3개]가 되는 점수 */
export const STAR_SCORES: Record<PlayGameId, readonly [number, number]> = { jegi: [8, 20], stones: [6, 14] };
/** 이 점수는 넘겨야 보상을 줍니다(누르기만 해서는 받지 못하게). */
export const MIN_REWARD_SCORE = 3;
export const ACORNS_PER_STAR = 4;
export const WARMTH_PER_ROUND = 1;
/** 두 놀이를 합친 하루 보상 상한 */
export const DAILY_ACORN_CAP = 60;
export const DAILY_WARMTH_CAP = 5;

export interface PlayRoundResult {
  records: PlayRecords;
  stars: Stars;
  acorns: number;
  warmth: number;
  isNewBest: boolean;
  /** 오늘 받을 수 있는 보상을 다 받아 이번 판은 줄어들었거나 없음 */
  capReached: boolean;
}

export function playStars(game: PlayGameId, score: number): Stars {
  const [two, three] = STAR_SCORES[game];
  if (score >= three) return 3;
  return score >= two ? 2 : 1;
}

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);

/** 저장된 값이 없거나 깨져 있어도 안전한 기본값으로 읽습니다. */
export function normalizePlayRecords(raw: unknown): PlayRecords {
  if (typeof raw !== 'object' || raw === null) return EMPTY_PLAY_RECORDS;
  const saved = raw as Partial<Record<keyof PlayRecords, unknown>>;
  const best = (typeof saved.best === 'object' && saved.best !== null ? saved.best : {}) as Partial<Record<PlayGameId, unknown>>;
  return {
    best: { jegi: count(best.jegi), stones: count(best.stones) },
    rewardDay: typeof saved.rewardDay === 'string' ? saved.rewardDay : null,
    acornsToday: count(saved.acornsToday),
    warmthToday: count(saved.warmthToday),
  };
}

/** 한 판을 정산합니다: 별, 최고 기록, 상한을 넘지 않는 보상. */
export function settlePlayRound(records: PlayRecords, game: PlayGameId, score: number, today: string): PlayRoundResult {
  const stars = playStars(game, score);
  const sameDay = records.rewardDay === today;
  const acornsToday = sameDay ? records.acornsToday : 0;
  const warmthToday = sameDay ? records.warmthToday : 0;
  const earns = score >= MIN_REWARD_SCORE;
  const acorns = earns ? Math.min(stars * ACORNS_PER_STAR, DAILY_ACORN_CAP - acornsToday) : 0;
  const warmth = earns ? Math.min(WARMTH_PER_ROUND, DAILY_WARMTH_CAP - warmthToday) : 0;
  const isNewBest = score > records.best[game];
  return {
    records: {
      best: isNewBest ? { ...records.best, [game]: score } : records.best,
      rewardDay: today,
      acornsToday: acornsToday + acorns,
      warmthToday: warmthToday + warmth,
    },
    stars, acorns, warmth, isNewBest,
    capReached: earns && acorns < stars * ACORNS_PER_STAR,
  };
}

/** 보상 저장에 실패했을 때: 최고 기록만 남기고 오늘 받은 양은 그대로 둡니다. */
export function withoutReward(result: PlayRoundResult, previous: PlayRecords): PlayRecords {
  return { ...previous, best: result.records.best };
}

export interface PlayRoundCommit {
  /** 저장된(또는 그대로 남은) 기록 */
  records: PlayRecords;
  acorns: number;
  warmth: number;
  saveFailed: boolean;
}

/**
 * 정산을 저장하고 보상을 줍니다. 오늘 받은 양을 먼저 적은 뒤에만 보상을 주므로,
 * 저장이 실패해도 하루 상한을 넘겨 받는 일은 없습니다(실패하면 보상 없이 다시 하게 합니다).
 */
export function commitPlayRound(
  previous: PlayRecords,
  result: PlayRoundResult,
  io: { save: (records: PlayRecords) => void; pay: (acorns: number, warmth: number) => boolean },
): PlayRoundCommit {
  const failed = (records: PlayRecords): PlayRoundCommit => ({ records, acorns: 0, warmth: 0, saveFailed: true });
  try {
    io.save(result.records);
  } catch {
    return failed(previous);
  }
  const hasReward = result.acorns > 0 || result.warmth > 0;
  if (!hasReward || io.pay(result.acorns, result.warmth)) {
    return { records: result.records, acorns: result.acorns, warmth: result.warmth, saveFailed: false };
  }
  // 보상을 주지 못했으니 오늘 받은 양을 되돌립니다. 되돌리기까지 실패하면 덜 받는 쪽으로 남습니다.
  const reverted = withoutReward(result, previous);
  try {
    io.save(reverted);
  } catch {
    return failed(result.records);
  }
  return failed(reverted);
}

/** 이만큼 연달아 보상 기준에 못 미치면 느린 모드를 권합니다. */
export const EASY_SUGGEST_STREAK = 3;

export function nextLowStreak(streak: number, score: number): number {
  return score < MIN_REWARD_SCORE ? streak + 1 : 0;
}

export function shouldSuggestEasy(streak: number, easy: boolean): boolean {
  return !easy && streak >= EASY_SUGGEST_STREAK;
}
