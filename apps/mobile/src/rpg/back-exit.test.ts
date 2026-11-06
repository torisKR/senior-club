import { describe, expect, it } from 'vitest';

import { backExitReducer, INITIAL_BACK_EXIT, type BackExitState } from './back-exit';

const open: BackExitState = { confirming: true, exitRequested: false };

describe('backExitReducer', () => {
  it('홈에서 뒤로가기를 누르면 확인 다이얼로그를 연다', () => {
    expect(backExitReducer(INITIAL_BACK_EXIT, 'back')).toEqual({
      confirming: true,
      exitRequested: false,
    });
  });

  it('다이얼로그가 열린 상태에서 뒤로가기를 한 번 더 누르면 닫는다', () => {
    expect(backExitReducer(open, 'back')).toEqual({
      confirming: false,
      exitRequested: false,
    });
  });

  it('취소하면 종료하지 않고 닫는다', () => {
    expect(backExitReducer(open, 'cancel')).toEqual(INITIAL_BACK_EXIT);
  });

  it('확정해야만 종료를 요청한다', () => {
    expect(backExitReducer(open, 'confirm')).toEqual({
      confirming: false,
      exitRequested: true,
    });
  });

  it('확정 전에는 절대 exitRequested가 되지 않는다', () => {
    const afterBack = backExitReducer(INITIAL_BACK_EXIT, 'back');
    expect(afterBack.exitRequested).toBe(false);
    expect(backExitReducer(afterBack, 'cancel').exitRequested).toBe(false);
  });
});
