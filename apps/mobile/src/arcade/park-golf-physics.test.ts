import { describe, expect, it } from 'vitest';

import { PARK_GOLF_BOUNDS, PARK_GOLF_HOLES, type ParkGolfHoleSpec } from './arcade-logic';
import {
  PARK_GOLF_BUTTON_ANGLES, PARK_GOLF_MAX_DRAG, PARK_GOLF_MAX_OVER_PAR, PARK_GOLF_MIN_DRAG, PARK_GOLF_STEP_SECONDS,
  buttonShot, isParkGolfStrokeLimit, launchParkGolfBall, previewParkGolfPath, rollParkGolfShot, shotFromDrag, stepParkGolfBall,
} from './park-golf-physics';

const flat = (hole: ParkGolfHoleSpec): ParkGolfHoleSpec => ({ ...hole, slope: { ...hole.slope, dx: 0, dy: 0 } });
const noBunker = (hole: ParkGolfHoleSpec): ParkGolfHoleSpec => ({ ...hole, bunker: { x: 500, y: 500, rx: 1, ry: 1 } });
const noCup = (hole: ParkGolfHoleSpec): ParkGolfHoleSpec => ({ ...hole, cup: { x: 500, y: 500, radius: 1 } });
const open = (hole: ParkGolfHoleSpec) => noCup(noBunker(flat({ ...hole, bumper: undefined })));
const HOLE_1 = PARK_GOLF_HOLES[0];

describe('park golf rolling physics', () => {
  it('turns a pull-back drag into a shot in the opposite direction with strength from its length', () => {
    expect(shotFromDrag({ x: 0, y: PARK_GOLF_MIN_DRAG / 2 })).toBeNull();
    const half = shotFromDrag({ x: 0, y: PARK_GOLF_MAX_DRAG / 2 })!;
    expect(half.angleDeg).toBeCloseTo(0);
    expect(half.power).toBeCloseTo(0.5);
    expect(shotFromDrag({ x: -PARK_GOLF_MAX_DRAG * 3, y: 0 })).toEqual({ angleDeg: 90, power: 1 });
    expect(shotFromDrag({ x: 10, y: 10 })!.angleDeg).toBeCloseTo(-45);
  });

  it('decelerates every frame until the ball rests, and rolls farther with more power', () => {
    const hole = open(HOLE_1);
    let ball = launchParkGolfBall(hole, { x: 50, y: 85 }, { angleDeg: 0, power: 0.5 });
    const speeds: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      speeds.push(Math.hypot(ball.vx, ball.vy));
      ball = stepParkGolfBall(hole, ball).ball;
    }
    expect(speeds.every((speed, i) => i === 0 || speed < speeds[i - 1])).toBe(true);
    const soft = rollParkGolfShot(hole, { x: 50, y: 85 }, { angleDeg: 0, power: 0.3 });
    const firm = rollParkGolfShot(hole, { x: 50, y: 85 }, { angleDeg: 0, power: 0.6 });
    expect(soft.finalPos.x).toBeCloseTo(50);
    expect(firm.finalPos.y).toBeLessThan(soft.finalPos.y);
    expect(firm.path.length * PARK_GOLF_STEP_SECONDS).toBeLessThan(4);
    expect(firm.holed).toBe(false);
  });

  it('bends the roll along the hole slope', () => {
    const base = noCup(noBunker({ ...HOLE_1, bumper: undefined }));
    const left = rollParkGolfShot({ ...base, slope: { ...base.slope, dx: -4, dy: 0 } }, { x: 50, y: 85 }, { angleDeg: 0, power: 0.6 });
    const right = rollParkGolfShot({ ...base, slope: { ...base.slope, dx: 4, dy: 0 } }, { x: 50, y: 85 }, { angleDeg: 0, power: 0.6 });
    expect(left.finalPos.x).toBeLessThan(47);
    expect(right.finalPos.x).toBeGreaterThan(53);
  });

  it('bounces off the course walls and stays inside the course', () => {
    const hole = open(HOLE_1);
    const shot = rollParkGolfShot(hole, { x: 50, y: 30 }, { angleDeg: 20, power: 1 });
    expect(shot.bouncedWall).toBe(true);
    expect(shot.path.every((p) => p.x >= PARK_GOLF_BOUNDS.left && p.x <= PARK_GOLF_BOUNDS.right
      && p.y >= PARK_GOLF_BOUNDS.top && p.y <= PARK_GOLF_BOUNDS.bottom)).toBe(true);
    expect(shot.finalPos.y).toBeGreaterThan(PARK_GOLF_BOUNDS.top + 3);
  });

  it('reflects only on the drawn bumper segment', () => {
    const hole = noCup(noBunker(flat(PARK_GOLF_HOLES[1])));
    const bumper = hole.bumper!;
    const hit = rollParkGolfShot(hole, { x: 28, y: 60 }, { angleDeg: 0, power: 0.7 });
    const pass = rollParkGolfShot(hole, { x: 70, y: 60 }, { angleDeg: 0, power: 0.7 });
    expect(hit.bouncedBumper).toBe(true);
    expect(hit.finalPos.y).toBeGreaterThan(bumper.y1);
    expect(pass.bouncedBumper).toBe(false);
    expect(pass.finalPos.y).toBeLessThan(bumper.y1);
  });

  it('brakes hard in the bunker', () => {
    const hole = noCup(flat(PARK_GOLF_HOLES[1]));
    const sand = rollParkGolfShot(hole, { x: 50, y: 70 }, { angleDeg: 0, power: 0.7 });
    const grass = rollParkGolfShot(noBunker(hole), { x: 50, y: 70 }, { angleDeg: 0, power: 0.7 });
    expect(sand.hitBunker).toBe(true);
    expect(grass.hitBunker).toBe(false);
    expect(sand.finalPos.y).toBeGreaterThan(grass.finalPos.y + 10);
  });

  it('drops only a slow ball into the cup; a hard one rattles the rim and runs past', () => {
    const hole = noBunker(flat(HOLE_1));
    const from = { x: hole.cup.x, y: hole.cup.y + 30 };
    const gentle = rollParkGolfShot(hole, from, { angleDeg: 0, power: 0.55 });
    expect(gentle.holed).toBe(true);
    expect(gentle.finalPos).toEqual({ x: hole.cup.x, y: hole.cup.y });
    const short = rollParkGolfShot(hole, from, { angleDeg: 0, power: 0.3 });
    expect(short.holed).toBe(false);
    const smash = rollParkGolfShot(hole, { x: hole.cup.x, y: hole.cup.y + 20 }, { angleDeg: 0, power: 1 });
    expect(smash.holed).toBe(false);
    expect(smash.lippedOut).toBe(true);
    expect(Math.hypot(smash.finalPos.x - hole.cup.x, smash.finalPos.y - hole.cup.y)).toBeGreaterThan(hole.cup.radius);
    expect(smash.distanceToCup).toBeGreaterThan(0);
  });

  it('gives the frame loop the same result as the instant roll, and a short matching preview', () => {
    const hole = PARK_GOLF_HOLES[2];
    const shot = { angleDeg: -8, power: 0.8 };
    const roll = rollParkGolfShot(hole, hole.tee, shot);
    let ball = launchParkGolfBall(hole, hole.tee, shot);
    let frames = 0;
    while (ball.moving) { ball = stepParkGolfBall(hole, ball).ball; frames += 1; }
    expect({ x: Number(ball.x.toFixed(1)), y: Number(ball.y.toFixed(1)) }).toEqual(roll.finalPos);
    expect(frames).toBe(roll.path.length - 1);
    const preview = previewParkGolfPath(hole, hole.tee, shot);
    expect(preview.length).toBeGreaterThan(2);
    expect(preview.length).toBeLessThanOrEqual(8);
    const last = preview[preview.length - 1];
    expect(Math.hypot(last.x - hole.tee.x, last.y - hole.tee.y)).toBeLessThan(Math.hypot(roll.finalPos.x - hole.tee.x, roll.finalPos.y - hole.tee.y));
  });

  it('holes a ball that already rests in the cup (older saved rounds)', () => {
    const roll = rollParkGolfShot(HOLE_1, { x: HOLE_1.cup.x + 1, y: HOLE_1.cup.y }, { angleDeg: 0, power: 0.7 });
    expect(roll.holed).toBe(true);
    expect(roll.finalPos).toEqual({ x: HOLE_1.cup.x, y: HOLE_1.cup.y });
  });

  it('lets the weakest button tap in from every close spot around each cup', () => {
    for (const hole of PARK_GOLF_HOLES) {
      for (const distance of [7, 9, 12, 15, 18]) {
        for (let deg = 0; deg < 360; deg += 30) {
          const from = { x: hole.cup.x + Math.cos((deg * Math.PI) / 180) * distance, y: hole.cup.y + Math.sin((deg * Math.PI) / 180) * distance };
          const offCourse = from.x < PARK_GOLF_BOUNDS.left || from.x > PARK_GOLF_BOUNDS.right || from.y < PARK_GOLF_BOUNDS.top || from.y > PARK_GOLF_BOUNDS.bottom;
          if (offCourse) continue;
          const roll = rollParkGolfShot(hole, from, buttonShot(hole, from, 0, 1));
          expect(roll.holed, `${hole.title} ${distance}m ${deg}deg`).toBe(true);
        }
      }
      // 멀리서는 1단이 그대로 약한 샷입니다.
      expect(buttonShot(hole, hole.tee, 0, 1).power).toBeCloseTo(0.4);
    }
  });

  it('ends a hole at par plus the stroke limit', () => {
    expect(isParkGolfStrokeLimit(3 + PARK_GOLF_MAX_OVER_PAR - 1, 3)).toBe(false);
    expect(isParkGolfStrokeLimit(3 + PARK_GOLF_MAX_OVER_PAR, 3)).toBe(true);
  });

  it('aims button shots at the cup so every hole can be finished within par using only the buttons', () => {
    const aimed = buttonShot(HOLE_1, { x: 20, y: HOLE_1.cup.y }, 0, 2);
    expect(aimed.angleDeg).toBeCloseTo(90);
    for (const hole of PARK_GOLF_HOLES) {
      let frontier = [hole.tee];
      let strokes = 0;
      let holed = false;
      while (!holed && strokes < hole.par) {
        strokes += 1;
        const next: { x: number; y: number }[] = [];
        for (const from of frontier) {
          for (const angle of PARK_GOLF_BUTTON_ANGLES) {
            for (const power of [1, 2, 3] as const) {
              const roll = rollParkGolfShot(hole, from, buttonShot(hole, from, angle, power));
              if (roll.holed) holed = true;
              else next.push(roll.finalPos);
            }
          }
        }
        frontier = next.sort((a, b) => Math.hypot(a.x - hole.cup.x, a.y - hole.cup.y) - Math.hypot(b.x - hole.cup.x, b.y - hole.cup.y)).slice(0, 12);
      }
      expect(holed, `${hole.title} within par ${hole.par}`).toBe(true);
    }
  });
});
