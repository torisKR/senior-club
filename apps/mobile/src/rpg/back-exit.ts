/**
 * 안드로이드 하드웨어 뒤로가기 → 앱 종료 확인 상태.
 *
 * 홈(탭 루트)에서 뒤로가기를 누르면 곧바로 앱을 닫지 않고 확인 다이얼로그를 띄웁니다.
 * 다이얼로그가 열린 상태에서 뒤로가기를 한 번 더 누르면 취소(닫기)로 처리합니다.
 * React/Expo에 의존하지 않는 순수 리듀서라 테스트로 고정합니다.
 */

export type BackExitAction = 'back' | 'cancel' | 'confirm';

export interface BackExitState {
  /** 종료 확인 다이얼로그가 열려 있는지 */
  confirming: boolean;
  /** 사용자가 종료를 확정했는지 (훅이 exitApp을 호출) */
  exitRequested: boolean;
}

export const INITIAL_BACK_EXIT: BackExitState = {
  confirming: false,
  exitRequested: false,
};

export function backExitReducer(state: BackExitState, action: BackExitAction): BackExitState {
  switch (action) {
    case 'back':
      // 열려 있으면 닫고, 닫혀 있으면 연다. 어느 경우든 이벤트는 소비된다.
      return state.confirming
        ? { confirming: false, exitRequested: false }
        : { confirming: true, exitRequested: false };
    case 'cancel':
      return { confirming: false, exitRequested: false };
    case 'confirm':
      return { confirming: false, exitRequested: true };
    default:
      return state;
  }
}
