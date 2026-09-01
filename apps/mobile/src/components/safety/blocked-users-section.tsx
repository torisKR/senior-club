import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';

import { apiErrorMessage } from '@/api/error-message';
import { safetyApi, type UserBlock } from '@/api/safety-api';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { replaceBlockedUserIds } from '@/safety/blocked-users-store';

import { Card } from '../ui/card';
import { EmptyState } from '../ui/empty-state';
import { SectionHeader } from '../ui/section-header';
import { SeniorButton } from '../ui/senior-button';
import { AppText } from '../ui/app-text';
import { SafetyTermsLink } from './content-safety-actions';

export interface BlockedUsersSectionProps {
  currentUserId: string | undefined;
}

export function BlockedUsersSection({ currentUserId }: BlockedUsersSectionProps) {
  if (!currentUserId) return null;
  return (
    <AuthenticatedBlockedUsersSection
      key={currentUserId}
      currentUserId={currentUserId}
    />
  );
}

function AuthenticatedBlockedUsersSection({ currentUserId }: { currentUserId: string }) {
  const theme = useTheme();
  const requestVersion = useRef(0);
  const unblockVersion = useRef(0);
  const unblockController = useRef<AbortController | null>(null);
  const [blocks, setBlocks] = useState<UserBlock[]>([]);
  const [loadedForUserId, setLoadedForUserId] = useState<string>();
  const [loading, setLoading] = useState(Boolean(currentUserId));
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [unblockingUserId, setUnblockingUserId] = useState<string>();

  useEffect(
    () => () => {
      unblockController.current?.abort();
    },
    [],
  );

  useEffect(() => {
    const expectedUserId = currentUserId;
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    const controller = new AbortController();
    const task = setTimeout(() => {
      setLoading(true);
      setError('');
      void safetyApi
        .blocks(controller.signal)
        .then((nextBlocks) => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          setBlocks(nextBlocks);
          setLoadedForUserId(expectedUserId);
          replaceBlockedUserIds(
            expectedUserId,
            nextBlocks.map((block) => block.blockedUser.id),
          );
        })
        .catch((loadError) => {
          if (controller.signal.aborted || requestVersion.current !== version) return;
          setBlocks([]);
          setLoadedForUserId(expectedUserId);
          setError(apiErrorMessage(loadError, '차단한 사용자 목록을 불러오지 못했습니다.'));
        })
        .finally(() => {
          if (!controller.signal.aborted && requestVersion.current === version) {
            setLoading(false);
          }
        });
    }, 0);

    return () => {
      clearTimeout(task);
      controller.abort();
      if (requestVersion.current === version) requestVersion.current += 1;
    };
  }, [currentUserId, retry]);

  async function unblock(block: UserBlock) {
    if (unblockingUserId) return;
    const expectedUserId = currentUserId;
    const version = unblockVersion.current + 1;
    unblockVersion.current = version;
    const controller = new AbortController();
    unblockController.current?.abort();
    unblockController.current = controller;
    setUnblockingUserId(block.blockedUser.id);
    setError('');
    let deleteAccepted = false;
    try {
      await safetyApi.unblock(block.blockedUser.id, controller.signal);
      deleteAccepted = true;
      if (controller.signal.aborted || unblockVersion.current !== version) return;
      const authoritativeBlocks = await safetyApi.blocks(controller.signal);
      if (controller.signal.aborted || unblockVersion.current !== version) return;
      setBlocks(authoritativeBlocks);
      replaceBlockedUserIds(
        expectedUserId,
        authoritativeBlocks.map((entry) => entry.blockedUser.id),
      );
      if (
        authoritativeBlocks.some(
          (entry) => entry.blockedUser.id === block.blockedUser.id,
        )
      ) {
        throw new Error('차단 해제가 서버 목록에 반영되지 않았습니다.');
      }
    } catch (unblockError) {
      if (!controller.signal.aborted && unblockVersion.current === version) {
        setError(
          deleteAccepted
            ? '차단 해제 요청은 전송했지만 서버의 최신 목록을 확인하지 못했습니다. 안전을 위해 해당 사용자의 콘텐츠는 계속 숨깁니다. 다시 시도해 주세요.'
            : apiErrorMessage(unblockError, '사용자 차단을 해제하지 못했습니다.'),
        );
      }
    } finally {
      if (unblockController.current === controller) {
        unblockController.current = null;
      }
      if (!controller.signal.aborted && unblockVersion.current === version) {
        setUnblockingUserId(undefined);
      }
    }
  }

  function confirmUnblock(block: UserBlock) {
    Alert.alert(
      '사용자 차단을 해제할까요?',
      `${block.blockedUser.name} 님의 콘텐츠가 다시 보일 수 있습니다.`,
      [
        { text: '계속 차단', style: 'cancel' },
        {
          text: '차단 해제',
          onPress: () => void unblock(block),
        },
      ],
      { cancelable: true },
    );
  }

  const visibleBlocks = loadedForUserId === currentUserId ? blocks : [];
  const isLoadingCurrentUser = loading || loadedForUserId !== currentUserId;

  return (
    <View style={{ gap: Spacing.md }}>
      <SectionHeader
        title="차단한 사용자"
        description="차단과 콘텐츠 신고는 별도이며 언제든 차단을 해제할 수 있습니다."
      />

      {isLoadingCurrentUser ? (
        <Card>
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="차단한 사용자 목록을 불러오고 있습니다"
            style={{ minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm }}>
            <ActivityIndicator size="large" color={theme.primary} />
            <AppText variant="bodyStrong">차단 목록을 확인하고 있어요</AppText>
          </View>
        </Card>
      ) : error && visibleBlocks.length === 0 ? (
        <EmptyState
          emoji="🛡️"
          title="차단 목록을 불러오지 못했어요"
          description={error}
          actionLabel="다시 시도"
          onActionPress={() => setRetry((current) => current + 1)}
        />
      ) : visibleBlocks.length === 0 ? (
        <Card>
          <View style={{ gap: Spacing.xs }}>
            <AppText variant="bodyStrong">차단한 사용자가 없습니다.</AppText>
            <AppText color="textSecondary">
              콘텐츠의 안전 메뉴에서 신고와 사용자 차단을 각각 선택할 수 있습니다.
            </AppText>
          </View>
        </Card>
      ) : (
        <View style={{ gap: Spacing.sm }}>
          {visibleBlocks.map((block) => (
            <Card key={block.id} style={{ gap: Spacing.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}>
                <View
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 52,
                    height: 52,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: Radius.pill,
                    backgroundColor: theme.backgroundSelected,
                  }}>
                  <AppText variant="key" color="primary" selectable={false}>
                    {block.blockedUser.name.slice(0, 1)}
                  </AppText>
                </View>
                <View style={{ flex: 1, gap: Spacing.xs }}>
                  <AppText variant="bodyStrong">{block.blockedUser.name}</AppText>
                  <AppText variant="caption" color="textSecondary">
                    차단됨
                  </AppText>
                </View>
              </View>
              <SeniorButton
                label="차단 해제"
                variant="outline"
                loading={unblockingUserId === block.blockedUser.id}
                disabled={Boolean(unblockingUserId)}
                onPress={() => confirmUnblock(block)}
                accessibilityHint={`${block.blockedUser.name} 님의 콘텐츠를 다시 표시하도록 확인 창을 엽니다`}
              />
            </Card>
          ))}
        </View>
      )}

      {error && visibleBlocks.length > 0 ? (
        <AppText
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          variant="bodyStrong"
          color="danger">
          {error}
        </AppText>
      ) : null}
      <SafetyTermsLink onOpenError={setError} />
    </View>
  );
}
