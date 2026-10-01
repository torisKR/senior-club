import { describe, expect, it } from 'vitest';

import { bottomNavigationLayout } from './bottom-navigation-layout';

describe('Android bottom navigation geometry', () => {
  it.each([360, 393, 430])('keeps a 60dp row and applies the actual system inset once at %sdp', (width) => {
    for (const bottomInset of [0, 24, 48]) {
      const layout = bottomNavigationLayout({ width, fontScale: 1, largeTextEnabled: false, bottomInset });
      expect(layout.rowHeight).toBe(60);
      expect(layout.height - layout.rowHeight).toBe(bottomInset);
      expect(width / 5).toBeGreaterThanOrEqual(48);
    }
  });

  it.each([360, 393, 430])('reserves wrapped labels at font scale 2 without shrinking text at %sdp', (width) => {
    for (const largeTextEnabled of [false, true]) {
      const layout = bottomNavigationLayout({ width, fontScale: 2, largeTextEnabled, bottomInset: 24 });
      expect(layout.labelSize).toBe(largeTextEnabled ? 13 : 12);
      expect(layout.rowHeight).toBeGreaterThanOrEqual(28 + 4 + 12 + layout.labelLineHeight * 2 * 2);
      expect(layout.height).toBe(layout.rowHeight + 24);
    }
  });

  it('grows at the intermediate system scale and preserves the user large-text setting', () => {
    const normal = bottomNavigationLayout({ width: 393, fontScale: 1.3, largeTextEnabled: false, bottomInset: 0 });
    const large = bottomNavigationLayout({ width: 393, fontScale: 1.3, largeTextEnabled: true, bottomInset: 0 });
    expect(normal.rowHeight).toBeGreaterThan(60);
    expect(large.rowHeight).toBeGreaterThan(normal.rowHeight);
    expect(large.labelSize).toBeGreaterThan(normal.labelSize);
  });
});
