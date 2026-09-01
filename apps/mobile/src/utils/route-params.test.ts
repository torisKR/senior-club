import { describe, expect, it } from 'vitest';

import { strictSingleRouteParam } from './route-params';

describe('strictSingleRouteParam', () => {
  it('accepts one route value and rejects missing or duplicate values', () => {
    expect(strictSingleRouteParam('forest-walkers')).toBe('forest-walkers');
    expect(strictSingleRouteParam(undefined)).toBeUndefined();
    expect(strictSingleRouteParam(['forest-walkers'])).toBeUndefined();
    expect(strictSingleRouteParam(['forest-walkers', 'other-club'])).toBeUndefined();
  });
});
