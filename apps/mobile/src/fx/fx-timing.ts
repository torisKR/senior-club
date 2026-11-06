/**
 * 스프라이트시트 재생 타이밍 계산.
 *
 * 화면 컴포넌트와 분리해 두어 프레임 계산을 순수 함수로 검증합니다.
 */

/** 주어진 경과 시간에서 보여줄 프레임 인덱스. 루프가 아니면 마지막 프레임에서 멈춥니다. */
export function frameAt(elapsedMs: number, fps: number, frameCount: number, loop: boolean): number {
  if (frameCount <= 1 || fps <= 0) return 0;
  const raw = Math.floor((Math.max(0, elapsedMs) / 1000) * fps);
  if (loop) return raw % frameCount;
  return Math.min(raw, frameCount - 1);
}

/** 전체 재생 길이(ms). 루프여도 한 바퀴 기준입니다. */
export function totalDurationMs(fps: number, frameCount: number): number {
  if (fps <= 0) return 0;
  return Math.round((frameCount / fps) * 1000);
}

/** 프레임 인덱스를 시트 그리드 좌표로 바꿉니다. */
export function frameCell(
  frame: number,
  columns: number,
): { column: number; row: number } {
  const safeColumns = Math.max(1, columns);
  const index = Math.max(0, frame);
  return { column: index % safeColumns, row: Math.floor(index / safeColumns) };
}

/** 재생이 끝났는지. 루프는 항상 false. */
export function isFinished(elapsedMs: number, fps: number, frameCount: number, loop: boolean): boolean {
  if (loop) return false;
  return elapsedMs >= totalDurationMs(fps, frameCount);
}
