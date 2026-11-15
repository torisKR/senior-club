import { describe, expect, it } from 'vitest';

import { alkkagiStars, parkGolfStars, sacheonseongStars } from './round-stars';

describe('round stars', () => {
  it('rewards park golf by strokes against par', () => {
    expect(parkGolfStars({ strokes: 1, par: 3 })).toBe(3);
    expect(parkGolfStars({ strokes: 2, par: 3 })).toBe(3);
    expect(parkGolfStars({ strokes: 3, par: 3 })).toBe(2);
    expect(parkGolfStars({ strokes: 5, par: 3 })).toBe(1);
  });

  it('rewards alkkagi by how many of my stones are still on the board', () => {
    expect(alkkagiStars(5)).toBe(3);
    expect(alkkagiStars(4)).toBe(3);
    expect(alkkagiStars(2)).toBe(2);
    expect(alkkagiStars(1)).toBe(1);
  });

  it('rewards sacheonseong by its best combo', () => {
    expect(sacheonseongStars(6)).toBe(3);
    expect(sacheonseongStars(3)).toBe(2);
    expect(sacheonseongStars(1)).toBe(1);
  });
});
