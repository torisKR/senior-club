/** Product IDs are immutable once registered in Google Play. */
export const COSMETIC_PRODUCTS = [
  {
    id: 'seniorclub.cosmetic.nacre_putter',
    slot: 'putter',
    skin: 'nacre',
    name: '매화 나전 퍼터',
    subtitle: '파크골프 퍼터 꾸미기',
    description: '매화빛 자개 장식으로 퍼터를 꾸밉니다.',
    story: '마을 공방에서 새벽 연습을 응원하며 만든 퍼터예요.',
    accent: '#C35358',
  },
  {
    id: 'seniorclub.cosmetic.celadon_stones',
    slot: 'stone',
    skin: 'celadon',
    name: '청자 은별 바둑알',
    subtitle: '알까기 내 바둑알 꾸미기',
    description: '흑석에 청자빛 테두리와 은별 장식을 더합니다.',
    story: '최 사범이 오래 아껴 온 청자빛 장식입니다.',
    accent: '#176C62',
  },
  {
    id: 'seniorclub.cosmetic.plum_tiles',
    slot: 'tile',
    skin: 'plum',
    name: '매화 자개 패두리',
    subtitle: '사천성 패 테두리 꾸미기',
    description: '전통 문양 패에 붉은 매화색 테두리를 더합니다.',
    story: '이 명인의 다실에 피어난 매화를 담았어요.',
    accent: '#9B3450',
  },
] as const;

export type CosmeticProduct = (typeof COSMETIC_PRODUCTS)[number];
export type CosmeticProductId = CosmeticProduct['id'];

export function isCosmeticProductId(id: string): id is CosmeticProductId {
  return COSMETIC_PRODUCTS.some((product) => product.id === id);
}
