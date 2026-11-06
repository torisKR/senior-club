import { describe, expect, it } from 'vitest';

import { frameAt, frameCell, isFinished, totalDurationMs } from './fx-timing';

describe('frameAt', () => {
  it('경과 시간에 맞는 프레임을 돌려준다', () => {
    expect(frameAt(0, 10, 5, false)).toBe(0);
    expect(frameAt(99, 10, 5, false)).toBe(0);
    expect(frameAt(100, 10, 5, false)).toBe(1);
    expect(frameAt(250, 10, 5, false)).toBe(2);
  });

  it('일회 재생은 마지막 프레임에서 멈춘다', () => {
    expect(frameAt(10_000, 10, 5, false)).toBe(4);
  });

  it('루프 재생은 처음으로 돌아온다', () => {
    expect(frameAt(500, 10, 5, true)).toBe(0);
    expect(frameAt(600, 10, 5, true)).toBe(1);
  });

  it('잘못된 입력에서도 0 프레임을 보장한다', () => {
    expect(frameAt(-50, 10, 5, false)).toBe(0);
    expect(frameAt(100, 0, 5, false)).toBe(0);
    expect(frameAt(100, 10, 0, false)).toBe(0);
  });
});

describe('totalDurationMs', () => {
  it('프레임 수와 fps로 길이를 계산한다', () => {
    expect(totalDurationMs(12, 42)).toBe(3500);
    expect(totalDurationMs(14, 20)).toBe(1429);
  });
});

describe('frameCell', () => {
  it('시트 그리드 좌표로 변환한다', () => {
    expect(frameCell(0, 6)).toEqual({ column: 0, row: 0 });
    expect(frameCell(5, 6)).toEqual({ column: 5, row: 0 });
    expect(frameCell(6, 6)).toEqual({ column: 0, row: 1 });
    expect(frameCell(13, 6)).toEqual({ column: 1, row: 2 });
  });

  it('열 수가 0이어도 나눗셈 오류가 없다', () => {
    expect(frameCell(3, 0)).toEqual({ column: 0, row: 3 });
  });
});

describe('isFinished', () => {
  it('일회 재생은 길이를 넘기면 종료', () => {
    expect(isFinished(3499, 12, 42, false)).toBe(false);
    expect(isFinished(3500, 12, 42, false)).toBe(true);
  });

  it('루프는 종료되지 않는다', () => {
    expect(isFinished(99_999, 12, 42, true)).toBe(false);
  });
});
