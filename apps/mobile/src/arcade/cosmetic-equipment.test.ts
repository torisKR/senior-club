import { describe, expect, it } from 'vitest';

import { COSMETIC_PRODUCTS } from '@/billing/cosmetic-products';

import { INITIAL_ARCADE_STATE } from './arcade-defaults';
import { availableEquipment, requiredCosmetic } from './cosmetic-equipment';

describe('cosmetic equipment', () => {
  it('keeps every existing free skin available without a purchase', () => {
    expect(requiredCosmetic('putter', 'master_gold')).toBeNull();
    expect(requiredCosmetic('tile', 'mother_of_pearl')).toBeNull();
    expect(availableEquipment({ ...INITIAL_ARCADE_STATE.equippedSkins, putter: 'master_gold' }, new Set()).putter)
      .toBe('master_gold');
  });

  it('displays only owned paid skins and never overwrites the saved selection', () => {
    const saved = { ...INITIAL_ARCADE_STATE.equippedSkins, putter: 'nacre', stone: 'celadon', tile: 'plum' } as const;
    const first = new Set([COSMETIC_PRODUCTS[0].id]);
    expect(availableEquipment(saved, first)).toEqual({
      ...saved, stone: 'classic', tile: 'ivory_wood',
    });
    expect(saved).toMatchObject({ putter: 'nacre', stone: 'celadon', tile: 'plum' });
    expect(availableEquipment(saved, new Set(COSMETIC_PRODUCTS.map(({ id }) => id)))).toEqual(saved);
  });
});
