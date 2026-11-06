import { describe, expect, it } from 'vitest';

import {
  advanceOnboarding,
  DEFAULT_ONBOARDING,
  LEGACY_ONBOARDING,
  restoreOnboarding,
  tutorialCopy,
  tutorialProgress,
  type OnboardingState,
} from './onboarding';

const at = (step: OnboardingState['step']): OnboardingState => ({
  step,
  prologueSeen: step !== 'prologue',
});

describe('advanceOnboarding', () => {
  it('프롤로그를 닫으면 이동 단계로 넘어간다', () => {
    const next = advanceOnboarding(DEFAULT_ONBOARDING, 'closePrologue');
    expect(next).toEqual({ step: 'move', prologueSeen: true });
  });

  it('이동 → 체조 → 파크골프 → 완료 순서로만 진행한다', () => {
    let state: OnboardingState = at('move');
    state = advanceOnboarding(state, 'moved');
    expect(state.step).toBe('gym');
    state = advanceOnboarding(state, 'gymDone');
    expect(state.step).toBe('parkgolf');
    state = advanceOnboarding(state, 'openedParkGolf');
    expect(state.step).toBe('done');
  });

  it('순서를 건너뛴 이벤트는 무시한다', () => {
    expect(advanceOnboarding(at('move'), 'gymDone').step).toBe('move');
    expect(advanceOnboarding(at('gym'), 'openedParkGolf').step).toBe('gym');
    expect(advanceOnboarding(at('prologue'), 'moved').step).toBe('prologue');
  });

  it('이미 지난 단계의 이벤트로 되돌아가지 않는다', () => {
    expect(advanceOnboarding(at('done'), 'moved').step).toBe('done');
    expect(advanceOnboarding(at('parkgolf'), 'moved').step).toBe('parkgolf');
  });

  it('건너뛰면 프롤로그를 본 것으로 처리하고 끝낸다', () => {
    expect(advanceOnboarding(at('prologue'), 'skip')).toEqual({
      step: 'done',
      prologueSeen: true,
    });
    expect(advanceOnboarding(at('gym'), 'skip').step).toBe('done');
  });
});

describe('tutorialProgress', () => {
  it('튜토리얼 단계에서만 1/3~3/3을 돌려준다', () => {
    expect(tutorialProgress(at('move'))).toEqual({ index: 1, total: 3 });
    expect(tutorialProgress(at('gym'))).toEqual({ index: 2, total: 3 });
    expect(tutorialProgress(at('parkgolf'))).toEqual({ index: 3, total: 3 });
    expect(tutorialProgress(at('prologue'))).toBeNull();
    expect(tutorialProgress(at('done'))).toBeNull();
  });
});

describe('tutorialCopy', () => {
  it('단계별 안내 문구가 있고, 프롤로그·완료는 없다', () => {
    expect(tutorialCopy('move')?.title).toBe('마을을 한 걸음');
    expect(tutorialCopy('gym')?.body).toContain('활력');
    expect(tutorialCopy('parkgolf')?.hint).toContain('입장');
    expect(tutorialCopy('prologue')).toBeNull();
    expect(tutorialCopy('done')).toBeNull();
  });
});

describe('restoreOnboarding', () => {
  it('저장된 단계를 그대로 복원한다', () => {
    expect(restoreOnboarding({ step: 'gym', prologueSeen: true }, true).step).toBe('gym');
  });

  it('알 수 없는 값은 기본값으로 보정한다', () => {
    const restored = restoreOnboarding(
      { step: 'unknown' as unknown as OnboardingState['step'] },
      false,
    );
    expect(restored).toEqual(DEFAULT_ONBOARDING);
  });

  it('온보딩 필드가 없는 기존 세이브는 완료 처리한다', () => {
    expect(restoreOnboarding(undefined, true)).toEqual(LEGACY_ONBOARDING);
  });

  it('세이브가 없으면 프롤로그부터 시작한다', () => {
    expect(restoreOnboarding(undefined, false)).toEqual(DEFAULT_ONBOARDING);
  });

  it('프롤로그 단계인데 seen이 없으면 미시청으로 본다', () => {
    expect(restoreOnboarding({ step: 'prologue' }, false).prologueSeen).toBe(false);
  });
});
