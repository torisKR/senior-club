import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { todayKey, withDailyReset } from './daily-reset';
import { chooseBondEpisode } from './bond-episodes';
import {
  calculateOfflineIdleRewards,
  calculateProductionRate,
  DEFAULT_FACILITIES,
  DEFAULT_PARTNERS,
  type FacilityState,
  type PartnerCompanion,
} from './idle-system';
import {
  addBond,
  BOND_REWARDS,
  canClaimDailyWalk,
  claimDailyWalk as claimDailyWalkBond,
  clampWarmth,
  createInitialBonds,
  getBond,
  normalizeBonds,
  NPC_IDS,
  type NpcBond,
  type NpcId,
} from './bond-logic';
import {
  advanceOnboarding as advanceOnboardingState,
  DEFAULT_ONBOARDING,
  restoreOnboarding,
  type OnboardingEvent,
  type OnboardingState,
} from './onboarding';
import { INITIAL_QUESTS, INITIAL_STATS, updateWellnessQuest, VILLAGE_GRID_SIZE } from './rpg-logic';
import { getRpgStorage } from './rpg-db';
import type { QuestItem, RpgCharacterStats, RpgQuest } from './rpg-types';
import { STORY_CHAPTERS, type StoryChapter } from './story-data';
import { completeStoryChapter, continueStoryAfterFailures, performStoryAction, recordStoryTrial, resolveLegacyStoryChoice, type StoryActionId, type StoryActionSource, type StoryGameResult, type StoryLegacyArchive, type StoryLegacyChoice } from './story-progress';
import { migrateRpgStorySave, parseRpgSave, PREVIOUS_STORY_BACKUP_KEY, STORY_MIGRATION_BACKUP_KEY, STORY_SAVE_VERSION } from './story-migration';
import type { RpgGuardedWriteResult, RpgGuardedKeyValueStorage, RpgSaveBackup } from './rpg-storage';

const STORAGE_KEY = 'senior_club_rpg_state_v1';
type OfflineReward = NonNullable<ReturnType<typeof calculateOfflineIdleRewards>>;

export interface RpgPersistedState {
  playerPos: { x: number; y: number };
  stats: RpgCharacterStats;
  quests: RpgQuest[];
  inventory: QuestItem[];
  facilities: FacilityState[];
  partners: PartnerCompanion[];
  lastSavedTimestampMs: number;
  offlineStartedAtMs: number | null;
  pendingOfflineReward: OfflineReward | null;
  currentChapterId: string;
  completedChapterIds: string[];
  completedTrialIds: string[];
  storyVersion: number;
  storyTrialFailures: Record<string, number>;
  storyAttemptIds: string[];
  storySkippedTrialIds: string[];
  storyActionFlags: Partial<Record<StoryActionId, StoryActionSource>>;
  storyLegacyChoice: StoryLegacyChoice | null;
  storyLegacyKeepChapterId: string | null;
  storyLegacyArchive: StoryLegacyArchive | null;
  storyRewardedChapterIds: string[];
  storyFreshTrialChapterIds: string[];
  storyFreshTrialCompletedIds: string[];
  lastDailyResetDate: string | null;
  /** 첫 실행 프롤로그·튜토리얼 진행 상태 */
  onboarding: OnboardingState;
  /** NPC별 유대 — 성장의 두 번째 축 */
  bonds: NpcBond[];
  /** 지금 함께 걷고 있는 NPC */
  companionId: NpcId | null;
  /** 마음 온도 0~100 */
  heartWarmth: number;
}

const DEFAULT_INVENTORY: QuestItem[] = [
  { id: 'water_bottle', name: '따뜻한 보온병', description: '생강차가 담긴 보온병. 활력을 20 회복합니다.', count: 3, icon: '🍵' },
  { id: 'magnifier', name: '황동 돋보기', description: '흐린 글씨와 사천성 짝을 한눈에 비춰줍니다.', count: 2, icon: '🔍' },
  { id: 'herbal_patch', name: '한방 파스', description: '알까기와 퍼팅 전 어깨 결림을 풀어줍니다.', count: 5, icon: '🩹' },
];

const DEFAULT_STATE: RpgPersistedState = {
  playerPos: { x: 3, y: 3 },
  stats: INITIAL_STATS,
  quests: [...INITIAL_QUESTS],
  inventory: DEFAULT_INVENTORY,
  facilities: [...DEFAULT_FACILITIES],
  partners: [...DEFAULT_PARTNERS],
  lastSavedTimestampMs: Date.now(),
  offlineStartedAtMs: null,
  pendingOfflineReward: null,
  currentChapterId: 'chapter_1',
  completedChapterIds: [],
  completedTrialIds: [],
  storyVersion: STORY_SAVE_VERSION,
  storyTrialFailures: {},
  storyAttemptIds: [],
  storySkippedTrialIds: [],
  storyActionFlags: {},
  storyLegacyChoice: null,
  storyLegacyKeepChapterId: null,
  storyLegacyArchive: null,
  storyRewardedChapterIds: [],
  storyFreshTrialChapterIds: [],
  storyFreshTrialCompletedIds: [],
  lastDailyResetDate: null,
  onboarding: DEFAULT_ONBOARDING,
  bonds: createInitialBonds(),
  companionId: null,
  heartWarmth: 50,
};

type SaveProtection = 'ready' | 'checking' | 'read_failed' | Exclude<RpgGuardedWriteResult, 'written'>;

interface RpgContextValue {
  state: RpgPersistedState;
  saveProtection: SaveProtection;
  retrySaveProtection: () => void;
  resolveLegacyStory: (choice: 'keep' | 'replay') => void;
  /** 유대 목록 (state.bonds 별칭) */
  bonds: NpcBond[];
  /** 동행 중인 NPC */
  companionId: NpcId | null;
  /** 마음 온도 0~100 */
  heartWarmth: number;
  productionRates: { acornsPerSec: number; expPerSec: number };
  currentChapter: StoryChapter;
  pendingOfflineReward: ReturnType<typeof calculateOfflineIdleRewards> | null;
  claimOfflineReward: (doubleReward?: boolean) => void;
  upgradeFacility: (facilityId: FacilityState['id']) => boolean;
  assignPartnerToFacility: (partnerId: string, facilityId: FacilityState['id']) => void;
  recruitPartner: (partnerId: string) => boolean;
  advanceChapter: (cp: number) => void;
  recordStoryResult: (result: StoryGameResult) => void;
  continueStoryAfterFailures: () => void;
  performStoryAction: (actionId: StoryActionId) => void;
  chooseBondEpisode: (npcId: NpcId, episodeId: string, choiceId: string) => void;
  movePlayer: (dx: number, dy: number) => boolean;
  doMorningGym: () => void;
  takeMedication: () => void;
  completeQuestStep: (targetType: RpgQuest['targetType']) => void;
  claimQuestReward: (questId: string) => boolean;
  useInventoryItem: (itemId: string) => boolean;
  /** 프롤로그 닫기·이동·체조·입장·건너뛰기 */
  advanceOnboarding: (event: OnboardingEvent) => void;
  /** 동행 산책 시작/종료 */
  startCompanion: (npcId: NpcId) => void;
  stopCompanion: () => void;
  /** 오늘의 산책 보상 (하루 1회) */
  claimDailyWalk: () => boolean;
  /** 미니게임을 함께 한 뒤 유대 적립 */
  recordGameWithNpc: (npcId: NpcId) => void;
}

const RpgContext = createContext<RpgContextValue | null>(null);

function restorePendingReward(value: unknown): OfflineReward | null {
  if (!value || typeof value !== 'object') return null;
  const reward = value as Partial<OfflineReward>;
  const amounts = [reward.elapsedSec, reward.cappedElapsedSec, reward.maxHours, reward.earnedAcorns, reward.earnedExp];
  if (!amounts.every((amount) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0)) return null;
  return reward as OfflineReward;
}

function accrueOfflineReward(state: RpgPersistedState, since: number, now: number): RpgPersistedState {
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

interface LoadedRpgSave {
  state: RpgPersistedState;
  storage: RpgGuardedKeyValueStorage;
  expectedRaw: string | null;
  backup: RpgSaveBackup | null;
  migrationRaw: string | null;
  protection: SaveProtection;
}

function loadRpgSave(): LoadedRpgSave {
  const storage = getRpgStorage();
  const now = Date.now();
  const fallback = withDailyReset({ ...DEFAULT_STATE, lastSavedTimestampMs: now }, todayKey());
  try {
    // A read error must never look like an empty/new save.
    const raw = storage.readStringStrict(STORAGE_KEY);
    if (raw === null) return { state: fallback, storage, expectedRaw: null, backup: null, migrationRaw: null, protection: storage.supportsGuardedWrites ? 'ready' : 'unavailable' };
    const parsed = parseRpgSave(raw);
    if (!parsed) return { state: fallback, storage, expectedRaw: raw, backup: null, migrationRaw: null, protection: 'read_failed' };
    const oldVersion = typeof parsed.storyVersion === 'number' ? parsed.storyVersion : 1;
    if (!Number.isFinite(oldVersion) || oldVersion > STORY_SAVE_VERSION) return { state: fallback, storage, expectedRaw: raw, backup: null, migrationRaw: null, protection: 'read_failed' };
    const oldRaw = oldVersion === 2 ? storage.readStringStrict(PREVIOUS_STORY_BACKUP_KEY) : null;
    const oldSave = oldRaw === null ? null : parseRpgSave(oldRaw);
    if (oldRaw !== null && !oldSave) return { state: fallback, storage, expectedRaw: raw, backup: null, migrationRaw: null, protection: 'read_failed' };
    const migrated = migrateRpgStorySave(parsed, oldSave);
    const saved = migrated as Partial<RpgPersistedState>;
    const lastTime = typeof saved.offlineStartedAtMs === 'number' && Number.isFinite(saved.offlineStartedAtMs)
      ? saved.offlineStartedAtMs
      : typeof saved.lastSavedTimestampMs === 'number' && Number.isFinite(saved.lastSavedTimestampMs)
        ? saved.lastSavedTimestampMs : now;
    const facs = saved.facilities ?? DEFAULT_STATE.facilities;
    const parts = saved.partners ?? DEFAULT_STATE.partners;
    const hasExistingSave = Boolean(saved.playerPos || saved.stats || saved.quests || saved.currentChapterId);
    const restored: RpgPersistedState = {
      ...DEFAULT_STATE,
      ...saved,
      stats: { ...DEFAULT_STATE.stats, ...(saved.stats ?? {}) },
      quests: saved.quests && saved.quests.length > 0 ? saved.quests : DEFAULT_STATE.quests,
      inventory: saved.inventory ?? DEFAULT_STATE.inventory,
      facilities: facs,
      partners: parts,
      lastSavedTimestampMs: now,
      offlineStartedAtMs: null,
      pendingOfflineReward: restorePendingReward(saved.pendingOfflineReward),
      currentChapterId: saved.currentChapterId ?? 'chapter_1',
      completedChapterIds: saved.completedChapterIds ?? [],
      completedTrialIds: migrated.completedTrialIds,
      lastDailyResetDate: saved.lastDailyResetDate ?? null,
      onboarding: restoreOnboarding(saved.onboarding, hasExistingSave),
      bonds: normalizeBonds(saved.bonds),
      companionId: typeof saved.companionId === 'string' && (NPC_IDS as readonly string[]).includes(saved.companionId) ? saved.companionId as NpcId : null,
      heartWarmth: typeof saved.heartWarmth === 'number' ? clampWarmth(saved.heartWarmth) : 50,
    };
    const needsUpgrade = oldVersion < STORY_SAVE_VERSION;
    const next = withDailyReset(accrueOfflineReward(restored, lastTime, now), todayKey());
    return {
      state: next, storage, expectedRaw: raw,
      backup: needsUpgrade ? { key: STORY_MIGRATION_BACKUP_KEY, value: raw } : null,
      // Persist the accrued but unclaimed reward and clear its interval once,
      // including for already-upgraded saves, before the app can restart.
      migrationRaw: JSON.stringify(next),
      protection: !storage.supportsGuardedWrites ? 'unavailable' : 'checking',
    };
  } catch {
    return { state: fallback, storage, expectedRaw: null, backup: null, migrationRaw: null, protection: 'read_failed' };
  }
}

export function RpgProvider({ children }: { children: React.ReactNode }) {
  const [loaded] = useState(loadRpgSave);
  const [state, setState] = useState(loaded.state);
  const stateRef = useRef(loaded.state);
  const guard = useRef({ storage: loaded.storage, expectedRaw: loaded.expectedRaw, backup: loaded.backup, migrationRaw: loaded.migrationRaw, readFailed: loaded.protection === 'read_failed' });
  const [saveProtection, setSaveProtection] = useState<SaveProtection>(loaded.protection);
  const pendingOfflineReward = state.pendingOfflineReward;

  const persistGuarded = useCallback((raw: string): boolean => {
    const current = guard.current;
    if (current.readFailed) { setSaveProtection('read_failed'); return false; }
    if (!current.storage.supportsGuardedWrites) { setSaveProtection('unavailable'); return false; }
    let result: RpgGuardedWriteResult;
    try {
      result = current.storage.guardedWrite(STORAGE_KEY, current.expectedRaw, raw, current.backup ?? undefined);
    } catch {
      result = 'write_failed';
    }
    if (result !== 'written') { setSaveProtection(result); return false; }
    current.expectedRaw = raw;
    current.backup = null;
    current.migrationRaw = null;
    setSaveProtection('ready');
    return true;
  }, []);

  const updateAndPersist = useCallback((updater: (prev: RpgPersistedState) => RpgPersistedState): boolean => {
    const prev = stateRef.current;
    const updated = updater(prev);
    if (updated === prev) return false;
    const next = { ...updated, lastSavedTimestampMs: Date.now() };
    if (!persistGuarded(JSON.stringify(next))) return false;
    stateRef.current = next;
    setState(next);
    return true;
  }, [persistGuarded]);

  const retrySaveProtection = useCallback(() => {
    const current = guard.current;
    if (current.readFailed) { setSaveProtection('read_failed'); return; }
    if (!current.storage.supportsGuardedWrites) { setSaveProtection('unavailable'); return; }
    if (current.migrationRaw !== null) { persistGuarded(current.migrationRaw); return; }
    try {
      setSaveProtection(current.storage.readStringStrict(STORAGE_KEY) === current.expectedRaw ? 'ready' : 'conflict');
    } catch {
      setSaveProtection('read_failed');
    }
  }, [persistGuarded]);

  // The exact old bytes, backup read-back, source check and replacement share one SQLite transaction.
  useEffect(() => {
    if (guard.current.migrationRaw !== null) retrySaveProtection();
  }, [retrySaveProtection]);

useEffect(() => {
    const handleAppState = (status: string) => {
      const now = Date.now();
      if (status === 'background') {
        updateAndPersist((prev) => prev.offlineStartedAtMs === null
          ? { ...prev, offlineStartedAtMs: now }
          : prev);
      } else if (status === 'active') {
        updateAndPersist((prev) => {
          const resumed = prev.offlineStartedAtMs === null ? prev : {
            ...accrueOfflineReward(prev, prev.offlineStartedAtMs, now),
            offlineStartedAtMs: null,
          };
          return withDailyReset(resumed, todayKey());
        });
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    if (AppState.currentState === 'background') handleAppState('background');
    return () => subscription.remove();
  }, [updateAndPersist]);

  const productionRates = useMemo(
    () => calculateProductionRate(state.facilities, state.partners),
    [state.facilities, state.partners],
  );

  const currentChapter = useMemo(
    () => STORY_CHAPTERS.find((c) => c.id === state.currentChapterId) ?? STORY_CHAPTERS[0],
    [state.currentChapterId],
  );

  const claimOfflineReward = useCallback((doubleReward = false) => {
    updateAndPersist((prev) => {
      if (!prev.pendingOfflineReward) return prev;
      const multiplier = doubleReward ? 2 : 1;
      return {
        ...prev,
        pendingOfflineReward: null,
        stats: {
          ...prev.stats,
          acorns: prev.stats.acorns + prev.pendingOfflineReward.earnedAcorns * multiplier,
          wisdomExp: prev.stats.wisdomExp + prev.pendingOfflineReward.earnedExp * multiplier,
        },
      };
    });
  }, [updateAndPersist]);

  const upgradeFacility = useCallback(
    (facilityId: FacilityState['id']) => {
      let success = false;
      const persisted = updateAndPersist((prev) => {
        const fac = prev.facilities.find((f) => f.id === facilityId);
        if (!fac || prev.stats.acorns < fac.upgradeCost) return prev;
        success = true;
        const nextCost = Math.floor(fac.upgradeCost * 1.6);
        const nextFacilities = prev.facilities.map((f) =>
          f.id === facilityId ? { ...f, level: f.level + 1, upgradeCost: nextCost } : f,
        );
        return {
          ...prev,
          facilities: nextFacilities,
          stats: {
            ...prev.stats,
            acorns: prev.stats.acorns - fac.upgradeCost,
            reputation: prev.stats.reputation + 5,
          },
        };
      });
      return persisted && success;
    },
    [updateAndPersist],
  );

  const assignPartnerToFacility = useCallback(
    (partnerId: string, facilityId: FacilityState['id']) => {
      updateAndPersist((prev) => {
        const nextPartners = prev.partners.map((p) => {
          if (p.id === partnerId) {
            return { ...p, assignedFacilityId: facilityId };
          }
          // If another partner was assigned to this facility, unassign
          if (p.assignedFacilityId === facilityId) {
            return { ...p, assignedFacilityId: null };
          }
          return p;
        });
        const nextFacilities = prev.facilities.map((f) =>
          f.id === facilityId ? { ...f, assignedPartnerId: partnerId } : f,
        );
        return {
          ...prev,
          partners: nextPartners,
          facilities: nextFacilities,
        };
      });
    },
    [updateAndPersist],
  );

  const recruitPartner = useCallback(
    (partnerId: string) => {
      let recruited = false;
      const persisted = updateAndPersist((prev) => {
        const partner = prev.partners.find((p) => p.id === partnerId);
        if (!partner || partner.recruited || prev.stats.acorns < partner.recruitCost) return prev;
        recruited = true;
        const nextPartners = prev.partners.map((p) =>
          p.id === partnerId ? { ...p, recruited: true } : p,
        );
        return {
          ...prev,
          partners: nextPartners,
          stats: {
            ...prev.stats,
            acorns: prev.stats.acorns - partner.recruitCost,
            reputation: prev.stats.reputation + 15,
          },
        };
      });
      return persisted && recruited;
    },
    [updateAndPersist],
  );

  const advanceChapter = useCallback((cp: number) => {
    updateAndPersist((prev) => {
      const progress = completeStoryChapter(prev, cp);
      if (progress === prev) return prev;
      const alreadyRewarded = prev.storyRewardedChapterIds.includes(prev.currentChapterId);
      return {
        ...progress,
        storyRewardedChapterIds: alreadyRewarded ? prev.storyRewardedChapterIds : [...prev.storyRewardedChapterIds, prev.currentChapterId],
        stats: alreadyRewarded ? prev.stats : {
          ...prev.stats,
          wisdomExp: prev.stats.wisdomExp + 300,
          acorns: prev.stats.acorns + 200,
          reputation: prev.stats.reputation + 25,
        },
      };
    });
  }, [updateAndPersist]);

  const recordStoryResult = useCallback((result: StoryGameResult) => {
    updateAndPersist((prev) => recordStoryTrial(prev, result));
  }, [updateAndPersist]);

  const resolveLegacyStory = useCallback((choice: 'keep' | 'replay') => {
    updateAndPersist((prev) => resolveLegacyStoryChoice(prev, choice));
  }, [updateAndPersist]);

  const continueStory = useCallback(() => {
    updateAndPersist((prev) => continueStoryAfterFailures(prev));
  }, [updateAndPersist]);

  const applyStoryAction = useCallback((actionId: StoryActionId) => {
    updateAndPersist((prev) => performStoryAction(prev, actionId));
  }, [updateAndPersist]);

  const selectBondEpisode = useCallback((npcId: NpcId, episodeId: string, choiceId: string) => {
    updateAndPersist((prev) => {
      const next = chooseBondEpisode(prev.bonds, npcId, episodeId, choiceId);
      return next === prev.bonds ? prev : { ...prev, bonds: next };
    });
  }, [updateAndPersist]);

  const movePlayer = useCallback(
    (dx: number, dy: number) => {
      let moved = false;
      const persisted = updateAndPersist((prev) => {
        const targetX = prev.playerPos.x + dx;
        const targetY = prev.playerPos.y + dy;
        if (
          targetX < 0 ||
          targetX >= VILLAGE_GRID_SIZE ||
          targetY < 0 ||
          targetY >= VILLAGE_GRID_SIZE
        ) {
          return prev;
        }
        moved = true;
        return {
          ...prev,
          playerPos: { x: targetX, y: targetY },
        };
      });
      return persisted && moved;
    },
    [updateAndPersist],
  );

  const doMorningGym = useCallback(() => {
    updateAndPersist((prev) => {
      if (prev.stats.dailyMorningGymDone) return prev;
      const nextStats: RpgCharacterStats = {
        ...prev.stats,
        vitality: Math.min(prev.stats.maxVitality, prev.stats.vitality + 20),
        wisdomExp: prev.stats.wisdomExp + 50,
        dailyMorningGymDone: true,
      };
      return {
        ...prev,
        stats: nextStats,
        quests: updateWellnessQuest(prev.quests, nextStats),
      };
    });
  }, [updateAndPersist]);

  const takeMedication = useCallback(() => {
    updateAndPersist((prev) => {
      if (prev.stats.dailyMedicationTaken) return prev;
      const nextStats: RpgCharacterStats = {
        ...prev.stats,
        vitality: prev.stats.maxVitality,
        reputation: prev.stats.reputation + 5,
        dailyMedicationTaken: true,
      };
      return {
        ...prev,
        stats: nextStats,
        quests: updateWellnessQuest(prev.quests, nextStats),
      };
    });
  }, [updateAndPersist]);

  const completeQuestStep = useCallback(
    (targetType: RpgQuest['targetType']) => {
      updateAndPersist((prev) => {
        const nextQuests = prev.quests.map((q) => {
          if (q.targetType === targetType && !q.completed) {
            const count = q.currentCount + 1;
            return {
              ...q,
              currentCount: count,
              completed: count >= q.requiredCount,
            };
          }
          return q;
        });
        return {
          ...prev,
          quests: nextQuests,
        };
      });
    },
    [updateAndPersist],
  );

  const claimQuestReward = useCallback(
    (questId: string) => {
      let claimed = false;
      const persisted = updateAndPersist((prev) => {
        const quest = prev.quests.find((q) => q.id === questId);
        if (!quest || !quest.completed || quest.claimed) return prev;
        claimed = true;
        const nextQuests = prev.quests.map((q) =>
          q.id === questId ? { ...q, claimed: true } : q,
        );
        const nextStats: RpgCharacterStats = {
          ...prev.stats,
          wisdomExp: prev.stats.wisdomExp + quest.rewardExp,
          acorns: prev.stats.acorns + quest.rewardAcorns,
          reputation: prev.stats.reputation + 10,
        };
        return {
          ...prev,
          stats: nextStats,
          quests: nextQuests,
        };
      });
      return persisted && claimed;
    },
    [updateAndPersist],
  );

  const startCompanion = useCallback(
    (npcId: NpcId) => {
      updateAndPersist((prev) => ({ ...prev, companionId: npcId }));
    },
    [updateAndPersist],
  );

  const stopCompanion = useCallback(() => {
    updateAndPersist((prev) => ({ ...prev, companionId: null }));
  }, [updateAndPersist]);

  const claimDailyWalk = useCallback(() => {
    let claimed = false;
    const persisted = updateAndPersist((prev) => {
      if (!prev.companionId) return prev;
      const bond = getBond(prev.bonds, prev.companionId);
      if (!canClaimDailyWalk(bond, todayKey())) return prev;
      claimed = true;
      return {
        ...prev,
        bonds: claimDailyWalkBond(prev.bonds, prev.companionId, todayKey()),
        heartWarmth: clampWarmth(prev.heartWarmth + 5),
      };
    });
    return persisted && claimed;
  }, [updateAndPersist]);

  const recordGameWithNpc = useCallback(
    (npcId: NpcId) => {
      updateAndPersist((prev) => ({
        ...prev,
        bonds: addBond(prev.bonds, npcId, BOND_REWARDS.gameTogether),
        heartWarmth: clampWarmth(prev.heartWarmth + 3),
      }));
    },
    [updateAndPersist],
  );

  const advanceOnboarding = useCallback(
    (event: OnboardingEvent) => {
      updateAndPersist((prev) => {
        const next = advanceOnboardingState(prev.onboarding, event);
        if (next.step === prev.onboarding.step && next.prologueSeen === prev.onboarding.prologueSeen) {
          return prev;
        }
        return { ...prev, onboarding: next };
      });
    },
    [updateAndPersist],
  );

  const useInventoryItem = useCallback(
    (itemId: string) => {
      let used = false;
      const persisted = updateAndPersist((prev) => {
        const item = prev.inventory.find((i) => i.id === itemId);
        if (!item || item.count <= 0) return prev;
        used = true;
        const nextInv = prev.inventory.map((i) =>
          i.id === itemId ? { ...i, count: i.count - 1 } : i,
        );
        const nextVitality = Math.min(prev.stats.maxVitality, prev.stats.vitality + 20);
        return {
          ...prev,
          inventory: nextInv,
          stats: { ...prev.stats, vitality: nextVitality },
        };
      });
      return persisted && used;
    },
    [updateAndPersist],
  );

  const value = useMemo(
    () => ({
      state,
      saveProtection,
      retrySaveProtection,
      resolveLegacyStory,
      bonds: state.bonds,
      companionId: state.companionId,
      heartWarmth: state.heartWarmth,
      productionRates,
      currentChapter,
      pendingOfflineReward,
      claimOfflineReward,
      upgradeFacility,
      assignPartnerToFacility,
      recruitPartner,
      advanceChapter,
      recordStoryResult,
      continueStoryAfterFailures: continueStory,
      performStoryAction: applyStoryAction,
      chooseBondEpisode: selectBondEpisode,
      movePlayer,
      doMorningGym,
      takeMedication,
      completeQuestStep,
      claimQuestReward,
      useInventoryItem,
      advanceOnboarding,
      startCompanion,
      stopCompanion,
      claimDailyWalk,
      recordGameWithNpc,
    }),
    [
      state,
      saveProtection,
      retrySaveProtection,
      resolveLegacyStory,
      productionRates,
      currentChapter,
      pendingOfflineReward,
      claimOfflineReward,
      upgradeFacility,
      assignPartnerToFacility,
      recruitPartner,
      advanceChapter,
      recordStoryResult,
      continueStory,
      applyStoryAction,
      selectBondEpisode,
      movePlayer,
      doMorningGym,
      takeMedication,
      completeQuestStep,
      claimQuestReward,
      useInventoryItem,
      advanceOnboarding,
      startCompanion,
      stopCompanion,
      claimDailyWalk,
      recordGameWithNpc,
    ],
  );

  return <RpgContext.Provider value={value}>{children}</RpgContext.Provider>;
}

export function useRpg() {
  const ctx = useContext(RpgContext);
  if (!ctx) {
    throw new Error('useRpg must be used inside RpgProvider');
  }
  return ctx;
}
