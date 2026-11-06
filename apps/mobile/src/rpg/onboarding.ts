/**
 * 첫 실행 온보딩 상태 머신.
 *
 * 서사(프롤로그 3장) → 조작(이동) → 생활(체조) → 첫 종목(파크골프) 순서로
 * 한 번만 안내합니다. 강제 차단이 아니라 배너이며, 언제든 건너뛸 수 있습니다.
 *
 * 순수 함수만 두어 저장·복원·단계 전이를 테스트로 고정합니다.
 */

export type OnboardingStep = 'prologue' | 'move' | 'gym' | 'parkgolf' | 'done';

export interface OnboardingState {
  step: OnboardingStep;
  prologueSeen: boolean;
}

export type OnboardingEvent =
  | 'closePrologue'
  | 'moved'
  | 'gymDone'
  | 'openedParkGolf'
  | 'skip';

const STEP_ORDER: readonly OnboardingStep[] = ['prologue', 'move', 'gym', 'parkgolf', 'done'];

export const DEFAULT_ONBOARDING: OnboardingState = {
  step: 'prologue',
  prologueSeen: false,
};

/** 온보딩 필드가 없던 기존 세이브: 이미 게임을 아는 사용자로 간주합니다. */
export const LEGACY_ONBOARDING: OnboardingState = {
  step: 'done',
  prologueSeen: true,
};

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (STEP_ORDER as readonly string[]).includes(value);
}

/** 단계는 뒤로 가지 않습니다. 이미 지난 단계의 이벤트는 무시합니다. */
export function advanceOnboarding(
  state: OnboardingState,
  event: OnboardingEvent,
): OnboardingState {
  if (event === 'skip') {
    return { step: 'done', prologueSeen: true };
  }

  switch (event) {
    case 'closePrologue':
      return {
        step: state.step === 'prologue' ? 'move' : state.step,
        prologueSeen: true,
      };
    case 'moved':
      return state.step === 'move' ? { ...state, step: 'gym' } : state;
    case 'gymDone':
      return state.step === 'gym' ? { ...state, step: 'parkgolf' } : state;
    case 'openedParkGolf':
      return state.step === 'parkgolf' ? { ...state, step: 'done' } : state;
    default:
      return state;
  }
}

/** 배너에 표시할 진행도 (1/3 ~ 3/3). 프롤로그·완료 단계는 null. */
export function tutorialProgress(state: OnboardingState): { index: number; total: number } | null {
  switch (state.step) {
    case 'move':
      return { index: 1, total: 3 };
    case 'gym':
      return { index: 2, total: 3 };
    case 'parkgolf':
      return { index: 3, total: 3 };
    default:
      return null;
  }
}

export interface TutorialCopy {
  title: string;
  body: string;
  hint: string;
}

const COPY: Record<'move' | 'gym' | 'parkgolf', TutorialCopy> = {
  move: {
    title: '마을을 한 걸음',
    body: '아래 방향 버튼으로 마을을 걸어보세요.',
    hint: '가는 길에 이장님과 인사를 나눠도 좋습니다.',
  },
  gym: {
    title: '아침 체조',
    body: '체조를 하면 활력(HP)과 연륜(EXP)이 올라요.',
    hint: '매일 한 번, 약과 함께 챙기면 더 좋습니다.',
  },
  parkgolf: {
    title: '첫 번째 한 판',
    body: '파크골프장으로 가서 1홀을 함께 쳐보세요.',
    hint: '시설 앞에서 [입장] 버튼을 누르면 시작합니다.',
  },
};

export function tutorialCopy(step: OnboardingStep): TutorialCopy | null {
  if (step === 'move' || step === 'gym' || step === 'parkgolf') return COPY[step];
  return null;
}

/**
 * 저장된 값 복원.
 * - 온보딩 필드가 있으면 그대로 (알 수 없는 값은 기본값으로 보정)
 * - 온보딩 필드가 없지만 저장 데이터가 있으면 레거시 사용자 → 완료 처리
 * - 저장 데이터가 없으면 신규 설치 → 프롤로그부터
 */
export function restoreOnboarding(
  saved: Partial<OnboardingState> | null | undefined,
  hasExistingSave: boolean,
): OnboardingState {
  if (saved && isOnboardingStep(saved.step)) {
    return {
      step: saved.step,
      prologueSeen: saved.prologueSeen ?? saved.step !== 'prologue',
    };
  }
  if (hasExistingSave) return LEGACY_ONBOARDING;
  return DEFAULT_ONBOARDING;
}
