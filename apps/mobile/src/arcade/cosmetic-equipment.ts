import { COSMETIC_PRODUCTS, type CosmeticProductId } from '@/billing/cosmetic-products';

import { INITIAL_ARCADE_STATE, type EquippedSkinsState } from './arcade-defaults';

export function requiredCosmetic<K extends keyof EquippedSkinsState>(
  slot: K, skin: EquippedSkinsState[K],
): CosmeticProductId | null {
  return COSMETIC_PRODUCTS.find((product) => product.slot === slot && product.skin === skin)?.id ?? null;
}

/** Keep the saved selection, but display the free default if ownership is unavailable. */
export function availableEquipment(
  saved: EquippedSkinsState,
  owned: ReadonlySet<CosmeticProductId>,
): EquippedSkinsState {
  const has = <K extends keyof EquippedSkinsState>(slot: K): boolean => {
    const product = requiredCosmetic(slot, saved[slot]);
    return product === null || owned.has(product);
  };
  return {
    ...saved,
    putter: has('putter') ? saved.putter : INITIAL_ARCADE_STATE.equippedSkins.putter,
    stone: has('stone') ? saved.stone : INITIAL_ARCADE_STATE.equippedSkins.stone,
    tile: has('tile') ? saved.tile : INITIAL_ARCADE_STATE.equippedSkins.tile,
  };
}
