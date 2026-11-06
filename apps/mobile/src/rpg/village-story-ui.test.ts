// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { act, createElement, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialBonds } from './bond-logic';
import { RpgProvider, useRpg } from './rpg-store';

const mocks = vi.hoisted(() => ({
  saves: new Map<string, string>(),
  cp: 2000,
  backupBlocked: false,
  push: vi.fn(),
  audio: { loop: false, volume: 0, play() {}, pause() {} },
}));
vi.mock('react-native', () => {
  const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    AppState: { addEventListener: () => ({ remove() {} }) },
    Platform: { select: (options: { default: unknown }) => options.default },
    Modal: ({ visible, children }: { visible: boolean; children?: ReactNode }) => visible ? box({ children }) : null,
    ScrollView: box, View: box,
    Pressable: ({ children, onPress, testID }: { children?: ReactNode; onPress?: () => void; testID?: string }) => createElement('button', { onClick: onPress, 'data-testid': testID }, children),
    StyleSheet: { create: (styles: unknown) => styles },
    useWindowDimensions: () => ({ width: 390, height: 800 }),
  };
});
vi.mock('./rpg-db', () => ({ getRpgStorage: () => ({
  supportsGuardedWrites: true,
  getString: (key: string) => mocks.saves.get(key) ?? null,
  readStringStrict: (key: string) => mocks.saves.get(key) ?? null,
  setString: (key: string, value: string) => mocks.saves.set(key, value),
  guardedWrite: (key: string, expected: string | null, value: string, backup?: { key: string; value: string }) => {
    if ((mocks.saves.get(key) ?? null) !== expected) return 'conflict';
    if (backup) {
      if (mocks.backupBlocked) return 'backup_failed';
      const old = mocks.saves.get(backup.key);
      if (old !== undefined && old !== backup.value) return 'backup_failed';
      mocks.saves.set(backup.key, backup.value);
      if (mocks.saves.get(backup.key) !== backup.value) return 'backup_failed';
    }
    mocks.saves.set(key, value);
    return 'written';
  },
}) }));
vi.mock('expo-audio', () => ({ useAudioPlayer: () => mocks.audio }));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: mocks.push }), useFocusEffect: () => undefined }));
vi.mock('@/ads/HomeBannerAd', () => ({ HomeBannerAd: () => null }));
vi.mock('@/arcade/arcade-store', () => ({ useArcade: () => ({
  state: { cp: mocks.cp, soundEnabled: false, dailyMissions: { parkGolfDone: false, alkkagiDone: false, sacheonseongDone: false, attendanceStampClaimed: false } },
  rankProgress: { current: { label: mocks.cp >= 3500 ? '클럽 명인(名人)' : '1급 클럽 고수' } },
  claimAttendanceStamp: () => false,
}) }));
vi.mock('@/audio/sound-manager', () => ({ playSfx() {} }));
vi.mock('@/fx/pixel-fx', () => ({ PixelFx: () => null }));
vi.mock('@/components/ui', () => {
  const box = ({ children }: { children?: ReactNode }) => createElement('div', null, children);
  return {
    AppText: box, Card: box, Screen: box, SectionHeader: ({ title }: { title: string }) => createElement('h2', null, title),
    SeniorButton: ({ label, disabled, onPress, testID }: { label: string; disabled?: boolean; onPress?: () => void; testID?: string }) =>
      createElement('button', { disabled, onClick: onPress, 'data-testid': testID }, label),
  };
});
vi.mock('./exit-confirm-dialog', () => ({ ExitConfirmDialog: () => null }));
vi.mock('./onboarding-overlay', () => ({ OnboardingOverlay: () => null }));
vi.mock('./pixel-village-map', () => ({ PixelVillageMap: () => null }));
vi.mock('./rpg-sprites', () => ({ portraitFor: () => 1 }));
vi.mock('./use-android-back-exit', () => ({ useAndroidBackExit: () => ({ confirming: false, cancel() {}, confirm() {} }) }));

const extensions = createRequire(import.meta.url).extensions;
const originalM4aLoader = extensions['.m4a'];
let container: HTMLDivElement;
let root: Root;
let current: ReturnType<typeof useRpg>;
let villageScreen: typeof import('./village-map-screen').VillageMapScreen;
function Probe() {
  const value = useRpg();
  useEffect(() => { current = value; }, [value]);
  return null;
}
async function clickTestId(id: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  expect(button, id).not.toBeNull();
  expect(button!.disabled, id).toBe(false);
  await act(async () => button!.click());
}
async function clickLabel(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(button, label).toBeDefined();
  expect(button!.disabled, label).toBe(false);
  await act(async () => button!.click());
}
async function mount() {
  villageScreen = (await import('./village-map-screen')).VillageMapScreen;
  root = createRoot(container);
  await rerender();
}
async function rerender() {
  await act(async () => root.render(createElement(RpgProvider, null, createElement(Probe), createElement(villageScreen))));
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  // Metro replaces these static asset requires on device; the DOM test does not load art.
  extensions['.m4a'] = (module) => { module.exports = 1; };
  mocks.saves.clear(); mocks.cp = 2000; mocks.backupBlocked = false; mocks.push.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  container.parentNode?.removeChild(container);
  if (originalM4aLoader) extensions['.m4a'] = originalM4aLoader;
  else delete extensions['.m4a'];
  vi.unstubAllGlobals();
});

describe('village story controls', () => {
  it.each([
    ['chapter_1', '/clubs'], ['chapter_2', '/events'], ['chapter_3', '/chat'],
    ['chapter_4', '/clubs'], ['chapter_5', '/events'], ['chapter_6', '/clubs'],
  ])('passes %s to the story trial route %s', async (chapterId, pathname) => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      storyVersion: 3, currentChapterId: chapterId, completedChapterIds: [], completedTrialIds: [], lastSavedTimestampMs: Date.now(),
    }));
    await mount();
    await clickTestId('btn-open-story-cutscene');
    await clickLabel('시련 도전하러 가기 ▶');
    expect(mocks.push).toHaveBeenCalledWith({ pathname, params: { storyChapter: chapterId } });
  });

  it('clears an earlier story parameter when entering a facility for ordinary play', async () => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      storyVersion: 3, currentChapterId: 'chapter_1', completedChapterIds: [], completedTrialIds: [],
      playerPos: { x: 2, y: 7 }, lastSavedTimestampMs: Date.now(),
    }));
    await mount();
    await clickTestId('btn-enter-facility');
    expect(mocks.push).toHaveBeenCalledWith({ pathname: '/clubs', params: { storyChapter: '' } });
  });

  it('passes the chapter again when retrying after a voluntary continuation', async () => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      storyVersion: 3, currentChapterId: 'chapter_1', completedChapterIds: [], completedTrialIds: [],
      storySkippedTrialIds: ['chapter_1'], lastSavedTimestampMs: Date.now(),
    }));
    await mount();
    await clickTestId('btn-open-story-cutscene');
    await clickLabel('시련에 다시 도전하기 ▶');
    expect(mocks.push).toHaveBeenCalledWith({ pathname: '/clubs', params: { storyChapter: 'chapter_1' } });
  });

  it.each(['keep', 'replay'] as const)('requires an explicit %s path and keeps the old history visible', async (choice) => {
    const previous = { currentChapterId: 'chapter_5', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4'], completedTrialIds: ['chapter_4'], lastSavedTimestampMs: Date.now() };
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify(previous));
    await mount();
    expect(container.textContent).toContain('이전 이야기 이어가기');
    expect(container.textContent).toContain('기존 기록 유지');
    expect(container.textContent).toContain('새 4막부터 보기');
    await clickTestId(`legacy-story-${choice}`);
    expect(current.state.storyLegacyChoice).toBe(choice);
    expect(current.state.currentChapterId).toBe(choice === 'keep' ? 'chapter_5' : 'chapter_4');
    expect(current.state.storyActionFlags).not.toHaveProperty('reopen_tea_room');
    await clickTestId('btn-open-story-cutscene');
    expect(container.textContent).toContain('이전 이야기 기록');
    expect(container.textContent).toContain('chapter_4');
  });

  it('blocks the choice and updates until an actual backup can be verified', async () => {
    const raw = JSON.stringify({ currentChapterId: 'chapter_4', completedChapterIds: ['chapter_1'] });
    mocks.saves.set('senior_club_rpg_state_v1', raw);
    mocks.backupBlocked = true;
    await mount();
    expect(container.textContent).toContain('저장 기록 보호 중');
    expect(container.querySelector('[data-testid="legacy-story-replay"]')).toBeNull();
    expect(mocks.saves.get('senior_club_rpg_state_v1')).toBe(raw);
    mocks.backupBlocked = false;
    await clickTestId('retry-save-protection');
    expect(mocks.saves.get('senior_club_rpg_state_before_story_v3')).toBe(raw);
    expect(container.textContent).toContain('이전 이야기 이어가기');
  });

  it('lets players perform exchange actions and choose an unlocked NPC episode', async () => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      currentChapterId: 'chapter_3', completedChapterIds: ['chapter_1', 'chapter_2'],
      completedTrialIds: ['chapter_1', 'chapter_2'], playerPos: { x: 7, y: 4 }, lastSavedTimestampMs: Date.now(),
      bonds: createInitialBonds().map((bond) => bond.npcId === 'chief' ? { ...bond, points: 50 } : bond),
    }));
    await mount();
    await clickTestId('story-action-invite_exchange');
    await clickTestId('bond-episode-chief_50');
    await clickTestId('bond-choice-chief_50-prepare');
    expect(container.textContent).toContain('올 사람의 자리를 먼저');
    await clickLabel('돌아가기');
    await act(async () => { current.movePlayer(-5, 8); });
    await clickTestId('story-action-welcome_exchange');
    await act(async () => current.recordStoryResult({ type: 'sacheonseong', maxCombo: 3, chapterId: 'chapter_3', attemptId: 'story-round' }));
    await clickTestId('btn-open-story-cutscene');
    expect(container.textContent).toContain('완료 · 김 이장');
    expect(container.textContent).toContain('완료 · 이 다도명인');
    expect(container.textContent).toContain('다음 막으로 넘어가기');
  });

  it('requires delivery and a resolved trial before reopening the tea room', async () => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      storyVersion: 3, currentChapterId: 'chapter_4', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3'],
      completedTrialIds: ['chapter_1', 'chapter_2', 'chapter_3'], playerPos: { x: 12, y: 12 }, lastSavedTimestampMs: Date.now(),
    }));
    await mount();
    await clickTestId('story-action-collect_supplies');
    await act(async () => { current.movePlayer(-10, 0); });
    expect(container.textContent).toContain('차와 약재 꾸러미를 가지고 있습니다');
    expect(container.textContent).toContain('사천성 연습하기');
    await clickTestId('story-action-deliver_supplies');
    expect(container.querySelector('[data-testid="story-action-reopen_tea_room"]')).toBeNull();
    await act(async () => current.recordStoryResult({ type: 'parkgolf', hole: 1, strokesFromPar: 0, chapterId: 'chapter_4', attemptId: 'story-round' }));
    await clickTestId('story-action-reopen_tea_room');
    expect(current.state.storyActionFlags).toMatchObject({ collect_supplies: 'performed', deliver_supplies: 'performed', reopen_tea_room: 'performed' });
    expect(container.textContent).toContain('다실이 다시 손님을 맞고 있습니다');
    await clickTestId('btn-open-story-cutscene');
    expect(container.textContent).toContain('다실이 다시 문을 열고');
    expect(container.textContent).toContain('다음 막으로 넘어가기');
  });

  it('does not turn an old final completion with unknown trial results into a win', async () => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      storyVersion: 3, currentChapterId: 'chapter_6', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5', 'chapter_6'],
      lastSavedTimestampMs: Date.now(),
    }));
    await mount();
    await clickTestId('btn-open-story-cutscene');
    expect(container.textContent).toContain('시련 결과는 별도로 기록되지 않았습니다');
    expect(container.textContent).toContain('이전 완료 기록 · 시련 결과 미상');
    expect(current.state.completedTrialIds).not.toContain('chapter_6');
  });

  it('offers continuation after three failures while retaining the CP gate and honest ending', async () => {
    mocks.saves.set('senior_club_rpg_state_v1', JSON.stringify({
      storyVersion: 3, currentChapterId: 'chapter_6', completedChapterIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5'],
      completedTrialIds: ['chapter_1', 'chapter_2', 'chapter_3', 'chapter_4', 'chapter_5'], lastSavedTimestampMs: Date.now(),
      bonds: createInitialBonds().map((bond) => bond.npcId === 'chief' ? { ...bond, points: 200 } : bond),
    }));
    await mount();
    await clickTestId('btn-open-story-cutscene');
    expect(container.querySelector('[data-testid="btn-continue-story-after-failures"]')).toBeNull();
    await act(async () => {
      for (const attemptId of ['1', '2', '3']) current.recordStoryResult({ type: 'parkgolf', hole: 3, outcome: 'failure', chapterId: 'chapter_6', attemptId });
    });
    await clickTestId('btn-continue-story-after-failures');
    expect(container.textContent).toContain('시련 미완수');
    expect(container.textContent).toContain('3500 CP (현재 2000)');
    expect(mocks.cp).toBe(2000);
    mocks.cp = 3500;
    await rerender();
    await clickLabel('여섯 막 이야기 마무리하기');
    await clickTestId('btn-open-story-cutscene');
    expect(container.textContent).toContain('여섯 막 이야기 완료');
    expect(container.textContent).toContain('현재 CP 등급: 클럽 명인(名人) (3500 CP)');
    expect(container.textContent).toContain('회관 문을 함께 열 사람');
    expect(current.state.completedTrialIds).not.toContain('chapter_6');
    expect(mocks.cp).toBe(3500);
  });
});
