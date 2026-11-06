import { Image } from 'expo-image';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { useCosmeticBilling } from '@/billing/CosmeticBillingProvider';
import { COSMETIC_PRODUCTS, type CosmeticProduct } from '@/billing/cosmetic-products';
import { describeFailure } from '@/billing/purchase-copy';
import { AppText, Card, SectionHeader, SeniorButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';

import { useArcade } from './arcade-store';

const PREVIEWS = {
  putter: require('../../assets/game/rpg/pixel/arcade/equip_putter.png'),
  stone: require('../../assets/game/rpg/pixel/arcade/stone_black.png'),
  tile: require('../../assets/game/rpg/pixel/tileset/tile_plum.png'),
};

export function CosmeticShop() {
  const billing = useCosmeticBilling();
  const { appearance, equipSkin } = useArcade();
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (Platform.OS !== 'android') return null;

  function equip(product: CosmeticProduct) {
    if (product.slot === 'putter') equipSkin('putter', product.skin);
    else if (product.slot === 'stone') equipSkin('stone', product.skin);
    else equipSkin('tile', product.skin);
    setStatus(`${product.name}을 장착했어요.`);
  }

  function equipDefault(product: CosmeticProduct) {
    if (product.slot === 'putter') equipSkin('putter', 'persimmon');
    else if (product.slot === 'stone') equipSkin('stone', 'classic');
    else equipSkin('tile', 'ivory_wood');
    setStatus('기본 외형으로 바꿨어요. 구매한 꾸미기는 언제든 다시 장착할 수 있어요.');
  }

  async function purchase(product: CosmeticProduct) {
    if (busy) return;
    setBusy(product.id);
    setStatus(null);
    try {
      const outcome = await billing.buy(product.id);
      if (outcome.status === 'owned') setStatus(`${product.name}을 구매했어요. 장착 버튼을 눌러 주세요.`);
      else if (outcome.status === 'cancelled') setStatus('구매를 취소했어요.');
      else if (outcome.status === 'pending') setStatus('결제 확인을 기다리고 있어요. 완료되면 장착할 수 있어요.');
      else setStatus(describeFailure('구매를 완료하지 못했어요.', outcome.retryable, outcome.code));
    } finally {
      setBusy(null);
    }
  }

  async function restore() {
    if (busy) return;
    setBusy('restore');
    setStatus(null);
    try {
      const result = await billing.restore();
      if (result.failed) setStatus('일부 구매를 확인하지 못했어요. 인터넷 연결을 확인하고 다시 복원해 주세요.');
      else if (result.restored) setStatus(`꾸미기 아이템 ${result.restored}개를 복원했어요.`);
      else setStatus('복원할 꾸미기 아이템이 없어요.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card testID="cosmetic-shop" style={styles.shop}>
      <SectionHeader title="청솔 공방 꾸미기" description="한 번 구매해 계속 사용해요. 승패와 점수에는 영향을 주지 않습니다." />
      {COSMETIC_PRODUCTS.map((product) => {
        const item = billing.items[product.id];
        const equipped = appearance[product.slot] === product.skin;
        return (
          <View key={product.id} style={styles.product} testID={`cosmetic-${product.slot}`}>
            <View style={styles.productIntro}>
              <View style={[styles.preview, { borderColor: product.accent }]} accessible={false}>
                <Image source={PREVIEWS[product.slot]} style={styles.previewImage} contentFit="contain" />
                <View style={[styles.previewMark, { backgroundColor: product.accent }]} />
              </View>
              <View style={styles.copy}>
                <AppText variant="bodyStrong">{product.name}</AppText>
                <AppText variant="caption" color="textSecondary">{product.subtitle} · 외형 전용</AppText>
                <AppText variant="caption" color="textSecondary">{product.story}</AppText>
              </View>
            </View>
            <AppText color="textSecondary">{product.description}</AppText>
            {item.owned ? (
              <SeniorButton
                label={equipped ? '기본 외형으로 바꾸기' : '장착하기'}
                variant={equipped ? 'secondary' : 'primary'}
                disabled={!!busy}
                onPress={() => equipped ? equipDefault(product) : equip(product)}
              />
            ) : (
              <SeniorButton
                label={busy === product.id ? '진행 중…' : item.price ? `구매하기 · ${item.price}` : item.priceLoaded ? '상품을 불러올 수 없어요' : '가격 확인 중…'}
                disabled={!!busy || !item.ready || !item.price}
                onPress={() => void purchase(product)}
                accessibilityHint={`${product.name}을 Google Play에서 한 번 구매합니다`}
              />
            )}
            {!item.owned && item.priceLoaded && !item.price ? (
              <SeniorButton label="가격 다시 확인하기" variant="ghost" disabled={!!busy} onPress={() => billing.retryPrice(product.id)} />
            ) : null}
          </View>
        );
      })}
      <SeniorButton label="꾸미기 구매 복원하기" variant="ghost" disabled={!!busy} onPress={() => void restore()} />
      {status ? <AppText accessibilityRole="alert" color="textSecondary">{status}</AppText> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  shop: { gap: Spacing.md, borderColor: '#BE9A67', borderWidth: 2, backgroundColor: '#FCF9F2' },
  product: { gap: Spacing.sm, padding: Spacing.md, backgroundColor: '#FFFFFF', borderColor: '#D8B384', borderWidth: 1, borderRadius: Radius.md },
  productIntro: { flexDirection: 'row', gap: Spacing.md, alignItems: 'center' },
  preview: { width: 80, height: 80, borderWidth: 3, borderRadius: Radius.md, backgroundColor: '#F3EAD7', alignItems: 'center', justifyContent: 'center' },
  previewImage: { width: 60, height: 60 },
  previewMark: { position: 'absolute', width: 12, height: 12, right: 5, bottom: 5, borderWidth: 2, borderColor: '#FCF9F2', transform: [{ rotate: '45deg' }] },
  copy: { flex: 1, gap: 4 },
});
