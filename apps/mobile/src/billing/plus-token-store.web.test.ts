// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';

import { COSMETIC_PRODUCTS } from './cosmetic-products';
import { createCosmeticTokenStore, createPlusTokenStore } from './plus-token-store.web';

beforeEach(() => localStorage.clear());

describe('web purchase token stores', () => {
  it('exports independent cosmetic stores without touching ad removal or other products', async () => {
    const first = createCosmeticTokenStore(COSMETIC_PRODUCTS[0].id);
    const second = createCosmeticTokenStore(COSMETIC_PRODUCTS[1].id);
    const plus = createPlusTokenStore();
    await first.set('first');
    await second.set('second');
    await plus.set('plus');
    await first.clear();
    expect(await first.get()).toBeNull();
    expect(await second.get()).toBe('second');
    expect(await plus.get()).toBe('plus');
  });
});
