import { calculateOfflineIdleRewards, type FacilityState, type PartnerCompanion } from './idle-system';

export type OfflineReward = NonNullable<ReturnType<typeof calculateOfflineIdleRewards>>;

interface AccruesOffline {
  facilities: FacilityState[];
  partners: PartnerCompanion[];
  pendingOfflineReward: OfflineReward | null;
}

export function restorePendingReward(value: unknown): OfflineReward | null {
  if (!value || typeof value !== 'object') return null;
  const reward = value as Partial<OfflineReward>;
  const amounts = [reward.elapsedSec, reward.cappedElapsedSec, reward.maxHours, reward.earnedAcorns, reward.earnedExp];
  if (!amounts.every((amount) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)) return null;
  return reward as OfflineReward;
}

export function accrueOfflineReward<T extends AccruesOffline>(state: T, since: number, now: number): T {
  const earned = calculateOfflineIdleRewards(since, now, state.facilities, state.partners);
  if (!earned || (earned.earnedAcorns <= 0 && earned.earnedExp <= 0)) return state;
  const pending = state.pendingOfflineReward;
  // Each absence is capped independently; an earlier unclaimed reward remains owed.
  return {
    ...state,
    pendingOfflineReward: pending ? {
      elapsedSec: pending.elapsedSec + earned.elapsedSec,
      cappedElapsedSec: pending.cappedElapsedSec + earned.cappedElapsedSec,
      maxHours: earned.maxHours,
      earnedAcorns: pending.earnedAcorns + earned.earnedAcorns,
      earnedExp: pending.earnedExp + earned.earnedExp,
    } : earned,
  };
}
