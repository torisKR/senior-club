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
import { canMoveTo, INITIAL_QUESTS, INITIAL_STATS, updateWellnessQuest } from './rpg-logic';
import { getRpgStorage } from './rpg-db';
import type { QuestItem, RpgCharacterStats, RpgQuest } from './rpg-types';
import { STORY_CHAPTERS, type StoryChapter } from './story-data';
import { completeStoryChapter, continueStoryAfterFailures, performStoryAction, recordStoryTrial, resolveLegacyStoryChoice, type StoryActionId, type StoryActionSource, type StoryGameResult, type StoryLegacyArchive, type StoryLegacyChoice } from './story-progress';
import { migrateRpgStorySave, parseRpgSave, PREVIOUS_STORY_BACKUP_KEY, STORY_MIGRATION_BACKUP_KEY, STORY_SAVE_VERSION } from './story-migration';
import type { RpgGuardedWriteResult, RpgGuardedKeyValueStorage, RpgSaveBackup } from './rpg-storage';
import { createLife, normalizeLife, type LifeState } from '@/world/life';
import { accrueOfflineReward, restorePendingReward, type OfflineReward } from './offline-reward';
import { getMap, type MapId } from '@/world/maps';
import { FIELD_VILLAGE_OFFSET } from '@/world/maps/field';
import { restorePosition, WORLD_VERSION } from '@/world/maps/position';

/** 생활 활동 한 번의 결과: 새 생활 상태와 도토리·활력·마음 온도 증감 */
export interface LifeChange {
  life: LifeState;
  acorns?: number;
  vitality?: number;
  warmth?: number;
}

const STORAGE_KEY = 'senior_club_rpg_state_v1';

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
  /** 텃밭·낚시·내 집·쉬기·일기 */
  life: LifeState;
  /** 지금 있는 지도 */
  mapId: MapId;
  /** 좌표계 버전 (WORLD_VERSION) */
  worldVersion: number;
}

const DEFAULT_INVENTORY: QuestItem[] = [
  { id: 'water_bottle', name: '따뜻한 보온병', description: '생강차가 담긴 보온병. 활력을 20 회복합니다.', count: 3, icon: '🍵' },
  { id: 'magnifier', name: '황동 돋보기', description: '흐린 글씨와 사천성 짝을 한눈에 비춰줍니다.', count: 2, icon: '🔍' },
  { id: 'herbal_patch', name: '한방 파스', description: '알까기와 퍼팅 전 어깨 결림을 풀어줍니다.', count: 5, icon: '🩹' },
];

const DEFAULT_STATE: RpgPersistedState = {
  playerPos: { x: 3 + FIELD_VILLAGE_OFFSET.x, y: 3 + FIELD_VILLAGE_OFFSET.y },
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
  life: createLife(),
  mapId: 'field',
  worldVersion: WORLD_VERSION,
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
  advanceChapter: (cp: number) => boolean;
  recordStoryResult: (result: StoryGameResult) => boolean;
  continueStoryAfterFailures: () => void;
  performStoryAction: (actionId: StoryActionId) => boolean;
  chooseBondEpisode: (npcId: NpcId, episodeId: string, choiceId: string) => void;
  movePlayer: (dx: number, dy: number) => boolean;
  stepPlayer: (dx: number, dy: number) => 'moved' | 'blocked' | 'save_failed';
  /** 자유 이동 중 발밑 칸이 바뀔 때. 저장하지 않습니다(멈출 때 savePosition). */
  walkTo: (x: number, y: number, sourceMapId: MapId) => boolean;
  /** 지금 위치를 저장합니다. */
  savePosition: () => void;
  /** 버스로 다른 지도에 갑니다. */
  travelTo: (mapId: MapId) => boolean;
  doMorningGym: () => boolean;
  takeMedication: () => boolean;
  completeQuestStep: (targetType: RpgQuest['targetType']) => void;
  claimQuestReward: (questId: string) => boolean;
  useInventoryItem: (itemId: string) => boolean;
  /** 프롤로그 닫기·이동·체조·입장·건너뛰기 */
  advanceOnboarding: (event: OnboardingEvent) => void;
  /** 동행 산책 시작/종료 */
  startCompanion: (npcId: NpcId) => boolean;
  stopCompanion: () => boolean;
  /** 오늘의 산책 보상 (하루 1회) */
  claimDailyWalk: () => boolean;
  /** 미니게임을 함께 한 뒤 유대 적립 */
  recordGameWithNpc: (npcId: NpcId) => void;
  /** 생활 활동 적용. change 가 null 이면 아무 일도 없습니다. 저장까지 되면 true. */
  applyLife: (change: (current: { life: LifeState; acorns: number }) => LifeChange | null) => boolean;
}

const RpgContext = createContext<RpgContextValue | null>(null);

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
  if (!storage.supportsGuardedWrites) {
    return { state: fallback, storage, expectedRaw: null, backup: null, migrationRaw: null, protection: 'unavailable' };
  }
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
      life: normalizeLife(saved.life),
      ...restorePosition(saved, DEFAULT_STATE.playerPos),
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
  const positionDirty = useRef(false);
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
    const current = withDailyReset(prev, todayKey());
    const updated = updater(current);
    if (updated === prev) return false;
    const next = { ...updated, lastSavedTimestampMs: Date.now() };
    if (!persistGuarded(JSON.stringify(next))) return false;
    stateRef.current = next;
    positionDirty.current = false;
    setState(next);
    return updated !== current;
  }, [persistGuarded]);

  const retrySaveProtection = useCallback(() => {
    const current = guard.current;
    if (current.readFailed || !current.storage.supportsGuardedWrites) {
      // Reopen and load the original source before allowing any game updates.
      const recovered = loadRpgSave();
      guard.current = {
        storage: recovered.storage,
        expectedRaw: recovered.expectedRaw,
        backup: recovered.backup,
        migrationRaw: recovered.migrationRaw,
        readFailed: recovered.protection === 'read_failed',
      };
      stateRef.current = recovered.state;
      positionDirty.current = false;
      setState(recovered.state);
      if (recovered.migrationRaw !== null && recovered.protection === 'checking') {
        persistGuarded(recovered.migrationRaw);
      } else {
        setSaveProtection(recovered.protection);
      }
      return;
    }
    if (current.migrationRaw !== null) { persistGuarded(current.migrationRaw); return; }
    // 원본이 달라지지 않았는지 원자적으로 확인하고 실제 쓰기도 다시 시도합니다.
    // 이동 중 메모리에 남아 있던 위치 역시 같은 저장에 포함됩니다.
    updateAndPersist((prev) => ({ ...prev }));
  }, [persistGuarded, updateAndPersist]);

  // The exact old bytes, backup read-back, source check and replacement share one SQLite transaction.
  useEffect(() => {
    if (guard.current.migrationRaw !== null) retrySaveProtection();
  }, [retrySaveProtection]);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const handleAppState = (status: string) => {
      if (timer !== null) clearInterval(timer);
      timer = null;
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
        timer = setInterval(() => updateAndPersist((prev) => prev), 60_000);
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);
    if (AppState.currentState === 'background') handleAppState('background');
    else if (AppState.currentState == null || AppState.currentState === 'active') {
      timer = setInterval(() => updateAndPersist((prev) => prev), 60_000);
    }
    return () => {
      subscription.remove();
      if (timer !== null) clearInterval(timer);
    };
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
    return updateAndPersist((prev) => {
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
    return updateAndPersist((prev) => recordStoryTrial(prev, result));
  }, [updateAndPersist]);

  const resolveLegacyStory = useCallback((choice: 'keep' | 'replay') => {
    updateAndPersist((prev) => resolveLegacyStoryChoice(prev, choice));
  }, [updateAndPersist]);

  const continueStory = useCallback(() => {
    updateAndPersist((prev) => continueStoryAfterFailures(prev));
  }, [updateAndPersist]);

  const applyStoryAction = useCallback((actionId: StoryActionId) => {
    return updateAndPersist((prev) => performStoryAction(prev, actionId));
  }, [updateAndPersist]);

  const selectBondEpisode = useCallback((npcId: NpcId, episodeId: string, choiceId: string) => {
    updateAndPersist((prev) => {
      const next = chooseBondEpisode(prev.bonds, npcId, episodeId, choiceId);
      return next === prev.bonds ? prev : { ...prev, bonds: next };
    });
  }, [updateAndPersist]);

  const stepPlayer = useCallback(
    (dx: number, dy: number) => {
      let moved = false;
      const persisted = updateAndPersist((prev) => {
        const targetX = prev.playerPos.x + dx;
        const targetY = prev.playerPos.y + dy;
        // 가장 최근 위치 기준으로 판정해야 조이스틱 연속 걸음이 벽·물을 통과하지 않습니다.
        if (!canMoveTo(targetX, targetY, prev.mapId)) return prev;
        moved = true;
        return {
          ...prev,
          playerPos: { x: targetX, y: targetY },
        };
      });
      return persisted && moved ? 'moved' : moved ? 'save_failed' : 'blocked';
    },
    [updateAndPersist],
  );

  const movePlayer = useCallback((dx: number, dy: number) => stepPlayer(dx, dy) === 'moved', [stepPlayer]);

  const walkTo = useCallback((x: number, y: number, sourceMapId: MapId) => {
    const prev = stateRef.current;
    if (prev.mapId !== sourceMapId) return false;
    if (prev.playerPos.x === x && prev.playerPos.y === y) return true;
    if (!canMoveTo(x, y, prev.mapId)) return false;
    // ponytail: 걷는 동안은 메모리만 바꾸고, 다음 저장(멈춤·다른 행동·백그라운드)에 함께 기록됩니다.
    const next = { ...prev, playerPos: { x, y } };
    stateRef.current = next;
    positionDirty.current = true;
    setState(next);
    return true;
  }, []);

  const savePosition = useCallback(() => {
    if (positionDirty.current) updateAndPersist((prev) => ({ ...prev }));
  }, [updateAndPersist]);

  const travelTo = useCallback((mapId: MapId) => updateAndPersist((prev) => {
    if (prev.mapId === mapId) return prev;
    return { ...prev, mapId, playerPos: getMap(mapId).arrival };
  }), [updateAndPersist]);

  const doMorningGym = useCallback(() => {
    return updateAndPersist((prev) => {
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
    return updateAndPersist((prev) => {
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
        let changed = false;
        const nextQuests = prev.quests.map((q) => {
          if (q.targetType === targetType && !q.completed) {
            changed = true;
            const count = q.currentCount + 1;
            return {
              ...q,
              currentCount: count,
              completed: count >= q.requiredCount,
            };
          }
          return q;
        });
        if (!changed) return prev;
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
      return updateAndPersist((prev) => prev.companionId === npcId ? prev : { ...prev, companionId: npcId });
    },
    [updateAndPersist],
  );

  const stopCompanion = useCallback(() => {
    return updateAndPersist((prev) => prev.companionId === null ? prev : { ...prev, companionId: null });
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
        if (!item || item.count <= 0 || prev.stats.vitality >= prev.stats.maxVitality) return prev;
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

  const applyLife = useCallback(
    (change: (current: { life: LifeState; acorns: number }) => LifeChange | null) => {
      let applied = false;
      const persisted = updateAndPersist((prev) => {
        const next = change({ life: prev.life, acorns: prev.stats.acorns });
        if (!next) return prev;
        applied = true;
        return {
          ...prev,
          life: next.life,
          stats: {
            ...prev.stats,
            acorns: Math.max(0, prev.stats.acorns + (next.acorns ?? 0)),
            vitality: Math.min(prev.stats.maxVitality, prev.stats.vitality + (next.vitality ?? 0)),
          },
          heartWarmth: clampWarmth(prev.heartWarmth + (next.warmth ?? 0)),
        };
      });
      return persisted && applied;
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
      stepPlayer,
      walkTo,
      savePosition,
      travelTo,
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
      applyLife,
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
      stepPlayer,
      walkTo,
      savePosition,
      travelTo,
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
      applyLife,
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
