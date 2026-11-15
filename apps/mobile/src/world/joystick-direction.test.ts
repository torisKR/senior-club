import { describe, expect, it } from 'vitest';

import { joystickVector, JOYSTICK_DEAD_ZONE } from './joystick-direction';

describe('joystickVector', () => {
  it('stays still inside the dead zone so a resting thumb does not walk', () => {
    expect(joystickVector(0, 0, 38)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(JOYSTICK_DEAD_ZONE - 1, 0, 38)).toEqual({ x: 0, y: 0 });
  });

  it('starts at a gentle walk and reaches full speed at the rim, in any direction', () => {
    const gentle = joystickVector(JOYSTICK_DEAD_ZONE + 1, 0, 38);
    expect(gentle.x).toBeGreaterThan(0);
    expect(gentle.x).toBeLessThan(0.3);
    const full = joystickVector(0, -38, 38);
    expect(full.y).toBeCloseTo(-1);
    const diagonal = joystickVector(30, 30, 38);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(1);
    expect(diagonal.x).toBeCloseTo(diagonal.y);
  });

  it('has no speed jump at the dead-zone boundary', () => {
    expect(joystickVector(JOYSTICK_DEAD_ZONE, 0, 38)).toEqual({ x: 0, y: 0 });
    expect(joystickVector(JOYSTICK_DEAD_ZONE + 0.001, 0, 38).x).toBeLessThan(0.01);
  });
});
