import { useState } from 'react';
import { Platform, View } from 'react-native';

import { useBilling } from '@/billing/BillingProvider';
import type { PurchaseOutcome, RestoreOutcome } from '@/billing/remove-ads';
import { describeFailure } from '@/billing/purchase-copy';
import { AppText, Card, SeniorButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';

function describePurchase(outcome: PurchaseOutcome): string {
  switch (outcome.status) {
    case 'owned':
      return '광고가 사라졌어요. 고맙습니다.';
    case 'cancelled':
      return '결제를 취소했어요. 언제든 다시 열 수 있어요.';
    case 'pending':
      return '결제 확인을 기다리고 있어요. 완료되면 광고가 사라져요.';
    case 'failed':
      return describeFailure('구매를 완료하지 못했어요.', outcome.retryable, outcome.code);
  }
}

function describeRestore(outcome: RestoreOutcome): string {
  switch (outcome.status) {
    case 'owned':
      return '구매를 되찾았어요. 광고가 사라졌어요.';
    case 'none':
      return '되찾을 구매가 없었어요.';
    case 'failed':
      return describeFailure('복원을 완료하지 못했어요.', outcome.retryable, outcome.code);
  }
}

export function PlusCard() {
  const billing = useBilling();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (Platform.OS !== 'android') {
    return null;
  }

  async function runPurchase() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    const outcome = await billing.buy();
    setStatus(describePurchase(outcome));
    setBusy(false);
  }

  async function runRestore() {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    const outcome = await billing.restore();
    setStatus(describeRestore(outcome));
    setBusy(false);
  }

  return (
    <Card testID="plus-card">
      <View style={{ gap: Spacing.lg }}>
        <View style={{ gap: Spacing.xs }}>
          <AppText variant="sectionTitle">시니어클럽 플러스</AppText>
          <AppText color="textSecondary">
            한 번 결제하면 배너 광고가 사라집니다. 모임 찾기·신청·채팅은 그대로 무료입니다.
          </AppText>
        </View>

        {billing.owned ? (
          <View
            testID="plus-owned"
            style={{
              minHeight: 56,
              justifyContent: 'center',
            }}>
            <AppText variant="bodyStrong">광고 없는 이용을 사용 중이에요.</AppText>
          </View>
        ) : (
          <SeniorButton
            testID="plus-buy"
            label={busy ? '진행 중…' : '광고 없이 보기 · 4,900원'}
            variant="primary"
            disabled={!billing.ready || busy}
            onPress={() => void runPurchase()}
            accessibilityHint="Google Play에서 한 번 결제하면 배너 광고가 사라집니다"
          />
        )}

        <SeniorButton
          testID="plus-restore"
          label="이전에 구매했다면 복원하기"
          variant="ghost"
          disabled={busy}
          onPress={() => void runRestore()}
          accessibilityHint="같은 Google 계정으로 산 플러스를 이 기기에 다시 적용합니다"
        />

        {status ? (
          <AppText testID="plus-status" color="textSecondary">
            {status}
          </AppText>
        ) : null}
      </View>
    </Card>
  );
}
