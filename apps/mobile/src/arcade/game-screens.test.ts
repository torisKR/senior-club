// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PARK_GOLF_HOLES, createInitialAlkkagiStones, simulateParkGolfShot } from './arcade-logic';

const mocks = vi.hoisted(() => {
  const values = new Map<string, string>();
  let nextAttempt = 0;
  const storage = {
    getString: (key: string) => values.get(key) ?? null,
    setString: (key: string, value: string) => { values.set(key, value); },
  };
  const rpg = {
    completeQuestStep: vi.fn(), recordGameWithNpc: vi.fn(), recordStoryResult: vi.fn(), advanceOnboarding: vi.fn(),
  };
  const arcade = {
    state: { soundEnabled: false, parkGolfClears: 0, parkGolfBestUnderPar: 0 },
    appearance: { putter: 'persimmon', stone: 'black', tile: 'ivory_wood' },
    recordParkGolfClear: vi.fn(), recordAlkkagiWin: vi.fn(), recordSacheonseongClear: vi.fn(), triggerHaptic: vi.fn(),
  };
  const textLayout = { width: 393, fontScale: 1, large: false };
  return { values, storage, rpg, arcade, textLayout, makeAttemptId: () => `attempt-${++nextAttempt}` };
});

vi.mock('react-native', () => ({
  StyleSheet: { create: <T,>(styles: T) => styles },
  useWindowDimensions: () => mocks.textLayout,
  View: ({ children, testID, style }: { children?: ReactNode; testID?: string; style?: unknown }) =>
    createElement('div', { 'data-testid': testID, 'data-style': JSON.stringify(style) }, children),
  ScrollView: ({ children }: { children?: ReactNode }) => createElement('div', null, children),
  Pressable: ({ children, testID, onPress, accessibilityLabel, accessibilityState, style }: {
    children?: ReactNode; testID?: string; onPress?: () => void; accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean }; style?: unknown;
  }) => createElement('button', {
    'data-testid': testID, 'data-style': JSON.stringify(style), 'aria-label': accessibilityLabel,
    'aria-pressed': accessibilityState?.selected, onClick: onPress,
  }, children),
}));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('expo-crypto', () => ({ randomUUID: () => mocks.makeAttemptId() }));
vi.mock('@/components/ui', () => ({
  Screen: ({ children }: { children?: ReactNode }) => createElement('main', null, children),
  Card: ({ children }: { children?: ReactNode }) => createElement('section', null, children),
  AppText: ({ children, style, variant }: { children?: ReactNode; style?: unknown; variant?: string }) =>
    createElement('span', { 'data-style': JSON.stringify(style), 'data-variant': variant }, children),
  SeniorButton: ({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) =>
    createElement('button', { 'data-testid': testID, onClick: onPress }, label),
}));
vi.mock('@/constants/theme', () => ({
  FontWeights: { strong: 'bold', emphasis: 'bold' }, Layout: { screenPadding: 16 },
  Radius: { sm: 4, md: 8, lg: 12, pill: 999 }, Spacing: { xs: 4, sm: 8, md: 16, xxxl: 48 },
}));
vi.mock('@/audio/sound-manager', () => ({ playSfx: vi.fn() }));
vi.mock('@/hooks/use-app-state', () => ({ useAppState: () => ({ largeTextEnabled: mocks.textLayout.large }) }));
vi.mock('@/fx/pixel-fx', () => ({ PixelFx: () => null }));
vi.mock('@/fx/fx-manifest', () => ({ FX_MANIFEST: { impact: { frameWidth: 10, frameHeight: 10 } } }));
vi.mock('@/rpg/companion-coach', () => ({ CompanionCoach: () => null }));
vi.mock('@/rpg/companion-lines', () => ({ GAME_COACH: { parkgolf: 'captain', alkkagi: 'choi', sacheonseong: 'tea' } }));
vi.mock('@/rpg/rpg-store', () => ({ useRpg: () => mocks.rpg }));
vi.mock('@/rpg/rpg-db', () => ({ getRpgStorage: () => mocks.storage }));
vi.mock('./arcade-store', () => ({ useArcade: () => mocks.arcade }));

let root: Root;
let container: HTMLDivElement;
let screens: typeof import('./park-golf-screen') & typeof import('./alkkagi-screen') & typeof import('./sacheonseong-screen');

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('require', () => 1);
  mocks.values.clear();
  Object.assign(mocks.textLayout, { width: 393, fontScale: 1, large: false });
  vi.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  screens = {
    ...await import('./park-golf-screen'),
    ...await import('./alkkagi-screen'),
    ...await import('./sacheonseong-screen'),
  };
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.parentNode?.removeChild(container);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(component: () => ReactNode) {
  await act(async () => root.render(createElement(component)));
}
async function press(id: string) {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`);
  expect(button, `missing ${id}`).not.toBeNull();
  await act(async () => button!.click());
}
async function pressLabel(label: string) {
  const button = [...container.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(button, `missing ${label}`).toBeDefined();
  await act(async () => button!.click());
}
const saved = (key: string) => JSON.parse(mocks.values.get(key) ?? 'null');

function contrastRatio(a: string, b: string) {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((offset) => {
      const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('arcade screens', () => {
  it.each([
    ['golf', 'ParkGolfArcadeScreen', 'parkgolf-power-2', '가까운 그린 정밀 퍼팅', '현재 홀'],
    ['alkkagi', 'AlkkagiBoardScreen', 'alkkagi-power-double', '2개 동시 격파', '나 (흑석 ★)'],
  ] as const)('keeps %s power descriptions readable and stacks controls for larger text', async (_, screen, selectedId, description, scoreLabel) => {
    Object.assign(mocks.textLayout, { width: 320, fontScale: 2, large: true });
    await render(screens[screen]);
    const selected = container.querySelector<HTMLElement>(`[data-testid="${selectedId}"]`)!;
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    const buttonStyles = JSON.parse(selected.getAttribute('data-style')!);
    expect(buttonStyles[0].minHeight).toBeGreaterThanOrEqual(48);
    expect(buttonStyles[0].height).toBeUndefined();
    expect(buttonStyles[1]).toMatchObject({ flexGrow: 0, flexShrink: 0, flexBasis: 'auto', alignSelf: 'stretch' });
    expect(JSON.parse(selected.parentElement!.getAttribute('data-style')!)[1]).toMatchObject({ flexDirection: 'column' });

    const caption = selected.querySelector<HTMLElement>('[data-variant="caption"]')!;
    const captionStyle = JSON.parse(caption.getAttribute('data-style')!);
    expect(captionStyle).toMatchObject({ color: '#FFFFFF', textAlign: 'center' });
    expect(captionStyle.fontSize).toBeUndefined();
    expect(contrastRatio(captionStyle.color, buttonStyles[2].backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(container.textContent).toContain(description);
    const score = [...container.querySelectorAll('span')].find((text) => text.textContent === scoreLabel)!;
    expect(JSON.parse(score.parentElement!.getAttribute('data-style')!)[1]).toMatchObject({
      flexGrow: 0, flexShrink: 0, flexBasis: 'auto',
    });
  });

  it('stacks controls for the in-app large-text setting even at the default system scale', async () => {
    mocks.textLayout.large = true;
    await render(screens.AlkkagiBoardScreen);
    const button = container.querySelector<HTMLElement>('[data-testid="alkkagi-opponent-18k"]')!;
    expect(JSON.parse(button.parentElement!.getAttribute('data-style')!)[1]).toMatchObject({ flexDirection: 'column' });
  });

  it('preserves a golf round on reselect, confirms switching, and plays the displayed preview', async () => {
    await render(screens.ParkGolfArcadeScreen);
    const preview = simulateParkGolfShot(PARK_GOLF_HOLES[0], PARK_GOLF_HOLES[0].tee, 0, 2);
    expect(container.textContent).toContain(`점선 예상: 홀컵까지 ${preview.distanceToCup}m`);
    const bunkerStyle = JSON.parse(container.querySelector('[data-testid="parkgolf-bunker"]')!.getAttribute('data-style')!);
    const cupStyle = JSON.parse(container.querySelector('[data-testid="parkgolf-cup"]')!.getAttribute('data-style')!);
    expect(bunkerStyle[1]).toEqual({ left: '56%', top: '33%', width: '24%', height: '30%' });
    expect(cupStyle[1]).toEqual({ left: '43.5%', top: '11.5%', width: '13%', height: '13%' });
    await press('btn-parkgolf-shoot');
    expect(saved('senior_club_golf_round_v1').ballPos).toEqual(preview.finalPos);
    expect(saved('senior_club_golf_round_v1').strokes).toBe(1);
    await press('parkgolf-hole-1');
    expect(saved('senior_club_golf_round_v1').strokes).toBe(1);
    expect(container.querySelector('[data-testid="arcade-change-confirmation"]')).toBeNull();
    await press('parkgolf-hole-2');
    expect(container.textContent).toContain('현재 홀의 진행이 사라집니다');
    await pressLabel('계속하기');
    expect(saved('senior_club_golf_round_v1').strokes).toBe(1);
    await press('parkgolf-hole-2');
    await pressLabel('바꾸기');
    expect(saved('senior_club_golf_round_v1')).toMatchObject({ holeIndex: 1, strokes: 0, ballPos: PARK_GOLF_HOLES[1].tee });
    const bumperStyle = JSON.parse(container.querySelector('[data-testid="parkgolf-bumper"]')!.getAttribute('data-style')!);
    expect(bumperStyle[1]).toEqual({ left: '20%', top: '42%', width: '16%' });
  });

  it('preserves an alkkagi match on reselect and only changes an active match after confirmation', async () => {
    await render(screens.AlkkagiBoardScreen);
    expect(container.querySelectorAll('[data-testid^="alkkagi-stone-"]')).toHaveLength(10);
    const opponentStyle = JSON.parse(container.querySelector('[data-testid="alkkagi-opponent-18k"]')!.getAttribute('data-style')!);
    expect(opponentStyle[0].minHeight).toBeGreaterThanOrEqual(48);
    expect(opponentStyle[0].minWidth).toBeGreaterThanOrEqual(48);
    const stoneStyle = JSON.parse(container.querySelector('[data-testid="alkkagi-stone-p1"]')!.getAttribute('data-style')!);
    expect(stoneStyle[0]).toMatchObject({ width: 48, height: 48 });
    await press('btn-alkkagi-flick');
    const before = saved('senior_club_alkkagi_round_v1');
    await press('alkkagi-opponent-18k');
    expect(saved('senior_club_alkkagi_round_v1')).toEqual(before);
    await press('alkkagi-opponent-9k');
    expect(container.textContent).toContain('현재 대국의 진행이 사라집니다');
    await pressLabel('계속하기');
    expect(saved('senior_club_alkkagi_round_v1')).toEqual(before);
    await press('alkkagi-opponent-9k');
    await pressLabel('바꾸기');
    expect(saved('senior_club_alkkagi_round_v1').opponentIdx).toBe(1);
    expect(container.querySelectorAll('[data-testid^="alkkagi-stone-"]')).toHaveLength(10);
    await press('btn-alkkagi-switch-target');
    expect(container.textContent).toContain('목표 돌 ◎3 선택 중');
  });

  it('clears stale selection for hints and draws the actual path while preserving selectable states', async () => {
    await render(screens.SacheonseongTileScreen);
    const tileStyle = JSON.parse(container.querySelector('[data-testid="sacheonseong-tile-0-0"]')!.getAttribute('data-style')!);
    expect(tileStyle[0].width).toBeGreaterThanOrEqual(48);
    expect(tileStyle[0].height).toBeGreaterThanOrEqual(48);
    await press('sacheonseong-tile-0-2');
    expect(container.querySelector('[data-testid="sacheonseong-tile-0-2"]')?.getAttribute('aria-pressed')).toBe('true');
    await press('btn-sacheonseong-hint');
    expect(container.querySelector('[data-testid="sacheonseong-tile-0-2"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(container.querySelector('[data-testid="sacheonseong-tile-0-0"]')?.getAttribute('aria-label')).toContain('힌트');
    expect(container.querySelector('[data-testid="sacheonseong-path-segment-0"]')).not.toBeNull();
    await press('sacheonseong-tile-0-0');
    expect(container.querySelector('[data-testid="sacheonseong-tile-0-0"]')?.getAttribute('aria-pressed')).toBe('true');
    await press('sacheonseong-tile-0-1');
    expect(container.querySelector('[data-testid="sacheonseong-tile-0-0"]')).toBeNull();
    expect(container.querySelector('[data-testid="sacheonseong-path-segment-0"]')).not.toBeNull();
    expect(saved('senior_club_tile_round_v1').board[0][0].motifId).toBeNull();
  });

  it('shows a save failure and retries without pretending the round was stored', async () => {
    const droppedWrites = vi.spyOn(mocks.storage, 'setString').mockImplementation(() => {});
    await render(screens.ParkGolfArcadeScreen);
    await press('btn-parkgolf-shoot');
    expect(mocks.values.has('senior_club_golf_round_v1')).toBe(false);
    expect(container.textContent).toContain('라운드를 저장하지 못했습니다');
    droppedWrites.mockRestore();
    await pressLabel('다시 저장');
    expect(saved('senior_club_golf_round_v1').strokes).toBe(1);
    expect(container.querySelector('[data-testid="round-save-warning"]')).toBeNull();
  });

  it('protects an unreadable existing round from automatic overwrite', async () => {
    mocks.values.set('senior_club_golf_round_v1', '{broken');
    await render(screens.ParkGolfArcadeScreen);
    expect(container.textContent).toContain('기존 라운드 기록을 읽을 수 없어 덮어쓰지 않았습니다');
    await press('btn-parkgolf-shoot');
    expect(mocks.values.get('senior_club_golf_round_v1')).toBe('{broken');
  });

  it('does not turn a nearby but missing shot into an invisible automatic hole-in', async () => {
    const round = { holeIndex: 0, ballPos: { x: 75, y: 45 }, strokes: 1, aimAngle: 0, powerStep: 2, holedBanner: null, lastShotNote: '계속' };
    mocks.values.set('senior_club_golf_round_v1', JSON.stringify(round));
    const preview = simulateParkGolfShot(PARK_GOLF_HOLES[0], round.ballPos, 0, 2);
    expect(preview.holed).toBe(false);
    await render(screens.ParkGolfArcadeScreen);
    await press('btn-parkgolf-shoot');
    expect(saved('senior_club_golf_round_v1')).toMatchObject({ ballPos: preview.finalPos, holedBanner: null, strokes: 2 });
    expect(mocks.arcade.recordParkGolfClear).not.toHaveBeenCalled();
  });

  it('lets a player replay the completed golf hole without selecting a different hole', async () => {
    const hole = PARK_GOLF_HOLES[0];
    mocks.values.set('senior_club_golf_round_v1', JSON.stringify({
      holeIndex: 0, ballPos: { x: hole.cup.x, y: hole.cup.y }, strokes: 2,
      aimAngle: 0, powerStep: 2, holedBanner: null, lastShotNote: '계속',
    }));
    await render(screens.ParkGolfArcadeScreen);
    await press('btn-parkgolf-shoot');
    expect(mocks.arcade.recordParkGolfClear).toHaveBeenCalledOnce();
    expect(mocks.rpg.recordStoryResult).not.toHaveBeenCalled();
    await press('btn-parkgolf-replay-hole');
    expect(saved('senior_club_golf_round_v1')).toMatchObject({
      holeIndex: 0, ballPos: hole.tee, strokes: 0, holedBanner: null,
    });
  });

  it('keeps a story golf attempt separate, restores it and counts only confirmed distinct attempts', async () => {
    const free = { holeIndex: 0, ballPos: { x: 50, y: 80 }, strokes: 2, aimAngle: 0, powerStep: 2, holedBanner: null, lastShotNote: '일반 대국' };
    mocks.values.set('senior_club_golf_round_v1', JSON.stringify(free));
    const game = () => createElement<{ storyChapter?: string }>(screens.ParkGolfArcadeScreen, { storyChapter: 'chapter_1' });
    await render(game);
    expect(container.textContent).toContain('이야기 도전 · 박 캡틴');
    await press('btn-parkgolf-shoot');
    const key = 'senior_club_golf_round_v1_story_chapter_1';
    const first = saved(key).storyAttemptId;
    expect(first).toMatch(/^attempt-/);
    expect(saved('senior_club_golf_round_v1')).toEqual(free);
    await render(() => createElement('div'));
    await render(game);
    expect(saved(key).storyAttemptId).toBe(first);
    await pressLabel('이번 시도 그만두기');
    await pressLabel('도전 계속하기');
    expect(mocks.rpg.recordStoryResult).not.toHaveBeenCalled();
    await pressLabel('이번 시도 그만두기');
    await pressLabel('시도 그만두기');
    expect(mocks.rpg.recordStoryResult).toHaveBeenCalledWith({
      type: 'parkgolf', hole: 1, outcome: 'failure', chapterId: 'chapter_1', attemptId: first,
    });
    expect(saved(key).storyAttemptId).not.toBe(first);
    expect(saved('senior_club_golf_round_v1')).toEqual(free);
  });

  it('records the final story golf hole with its restored attempt identity', async () => {
    const hole = PARK_GOLF_HOLES[2];
    mocks.values.set('senior_club_golf_round_v1_story_chapter_6', JSON.stringify({
      holeIndex: 2, ballPos: { x: hole.cup.x, y: hole.cup.y }, strokes: 2,
      aimAngle: 0, powerStep: 2, holedBanner: null, lastShotNote: '계속', storyAttemptId: 'restored-attempt',
    }));
    await render(() => createElement<{ storyChapter?: string }>(screens.ParkGolfArcadeScreen, { storyChapter: 'chapter_6' }));
    await press('btn-parkgolf-shoot');
    expect(mocks.rpg.recordStoryResult).toHaveBeenCalledWith(expect.objectContaining({
      type: 'parkgolf', hole: 3, chapterId: 'chapter_6', attemptId: 'restored-attempt',
    }));
    expect(mocks.rpg.recordGameWithNpc).toHaveBeenCalledWith('chief');
    expect(container.querySelector('[data-testid="btn-parkgolf-next-hole"]')).toBeNull();
  });

  it('breaks a tile streak when the selected tiles cannot be connected', async () => {
    await render(screens.SacheonseongTileScreen);
    await press('sacheonseong-tile-0-0');
    await press('sacheonseong-tile-0-1');
    expect(saved('senior_club_tile_round_v1').combo).toBe(1);
    await press('sacheonseong-tile-0-2');
    await press('sacheonseong-tile-0-4');
    expect(saved('senior_club_tile_round_v1').combo).toBe(0);
    expect(saved('senior_club_tile_round_v1').maxCombo).toBe(1);
  });

  it.each([
    ['alkkagi', 'chapter_2', 'AlkkagiBoardScreen'],
    ['sacheonseong', 'chapter_3', 'SacheonseongTileScreen'],
  ] as const)('records an explicitly abandoned %s story attempt without a win', async (type, chapterId, screen) => {
    await render(() => createElement<{ storyChapter?: string }>(screens[screen], { storyChapter: chapterId }));
    await pressLabel('이번 시도 그만두기');
    await pressLabel('시도 그만두기');
    expect(mocks.rpg.recordStoryResult).toHaveBeenCalledWith(expect.objectContaining({ type, outcome: 'failure', chapterId, attemptId: expect.any(String) }));
    expect(mocks.arcade.recordAlkkagiWin).not.toHaveBeenCalled();
    expect(mocks.arcade.recordSacheonseongClear).not.toHaveBeenCalled();
  });

  it('lets a player replay the same opponent after a completed alkkagi match', async () => {
    const stones = createInitialAlkkagiStones().map((stone) =>
      stone.owner === 'ai' && stone.id !== 'a1' ? { ...stone, alive: false } : stone,
    );
    mocks.values.set('senior_club_alkkagi_round_v1', JSON.stringify({
      opponentIdx: 0, stones, selectedPlayerId: 'p1', selectedTargetId: 'a1',
      powerMode: 'double', matchDoubleKnockouts: 0, bannerText: '계속',
    }));
    await render(screens.AlkkagiBoardScreen);
    await press('btn-alkkagi-flick');
    expect(mocks.arcade.recordAlkkagiWin).toHaveBeenCalledOnce();
    await press('btn-alkkagi-same-opponent');
    expect(saved('senior_club_alkkagi_round_v1')).toMatchObject({ opponentIdx: 0, matchDoubleKnockouts: 0 });
    expect(container.querySelectorAll('[data-testid^="alkkagi-stone-"]')).toHaveLength(10);
  });
});
