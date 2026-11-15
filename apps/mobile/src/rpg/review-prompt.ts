import { storage } from '@/utils/storage';

const REVIEW_LOG_KEY = 'senior_club_review_prompts_v1';
const DAY_MS = 24 * 60 * 60 * 1000;
/** 한 번 물어본 뒤 다시 묻기까지 최소 간격. */
const MIN_GAP_MS = 30 * DAY_MS;
/** 1년에 최대 몇 번까지 물어볼지. */
const MAX_PER_YEAR = 3;

export interface ReviewLog {
  moments: string[];
  askedAtMs: number[];
}

export const EMPTY_REVIEW_LOG: ReviewLog = { moments: [], askedAtMs: [] };

/** 좋은 순간(첫 승리·승급)마다 한 번, 30일 간격, 1년 3번까지만 묻습니다. */
export function shouldAskForReview(log: ReviewLog, moment: string, nowMs: number): boolean {
  if (log.moments.includes(moment)) return false;
  const last = log.askedAtMs.at(-1);
  if (last !== undefined && nowMs - last < MIN_GAP_MS) return false;
  return log.askedAtMs.filter((at) => nowMs - at < 365 * DAY_MS).length < MAX_PER_YEAR;
}

export function nextReviewLog(log: ReviewLog, moment: string, nowMs: number): ReviewLog {
  return { moments: [...log.moments, moment], askedAtMs: [...log.askedAtMs, nowMs] };
}

/**
 * 조건에 맞을 때만 Google Play 인앱 리뷰 창을 띄웁니다.
 * 실패해도 게임 흐름은 막지 않습니다(평가는 선택 사항).
 */
export async function askForReviewAt(moment: string): Promise<void> {
  try {
    const log = storage.get<ReviewLog>(REVIEW_LOG_KEY, EMPTY_REVIEW_LOG);
    const nowMs = Date.now();
    if (!shouldAskForReview(log, moment, nowMs)) return;
    // 네이티브 모듈이 없는 빌드에서도 앱이 멈추지 않도록 필요할 때만 불러옵니다.
    const StoreReview = await import('expo-store-review');
    if (!(await StoreReview.hasAction())) return;
    storage.set(REVIEW_LOG_KEY, nextReviewLog(log, moment, nowMs));
    await StoreReview.requestReview();
  } catch (error) {
    console.warn('[review-prompt] 인앱 리뷰 요청 실패', error);
  }
}
