/** 손가락이 이만큼(dp) 움직이기 전에는 걷지 않습니다 — 떨림으로 새지 않게. */
export const JOYSTICK_DEAD_ZONE = 14;

/**
 * 끌어당긴 거리(dp)를 걷는 방향 벡터로: 무시 구간을 넘은 만큼 0~1로 빨라지고,
 * 끝까지 당기면(maxTravel) 최고 속도입니다.
 */
export function joystickVector(dx: number, dy: number, maxTravel: number): { x: number; y: number } {
  const length = Math.hypot(dx, dy);
  if (length <= JOYSTICK_DEAD_ZONE) return { x: 0, y: 0 };
  const strength = Math.min(1, (length - JOYSTICK_DEAD_ZONE) / Math.max(1, maxTravel - JOYSTICK_DEAD_ZONE));
  // 무시 구간에서 속도가 튀지 않으면서 작은 움직임에도 반응합니다.
  const speed = Math.sqrt(strength);
  return { x: (dx / length) * speed, y: (dy / length) * speed };
}
