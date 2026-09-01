import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, View, type ListRenderItemInfo } from 'react-native';

import { apiErrorMessage } from '@/api/error-message';
import {
  notificationsApi,
  type ApiNotification,
  type ApiNotificationType,
} from '@/api/notifications-api';
import { AppText, EmptyState, SeniorButton } from '@/components/ui';
import { Layout, Radius, Shadows, Spacing, TouchTarget } from '@/constants/theme';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';
import { sanitizeNotificationRoute } from '@/notifications/notification-route';

type NotificationFilter = 'all' | 'unread';
type NotificationKind = 'event' | 'approval' | 'schedule' | 'review' | 'comment' | 'reply';

type NotificationItem = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  destination: Href;
};

const KIND_LABELS: Record<NotificationKind, { emoji: string; label: string }> = {
  event: { emoji: '📅', label: '모임' },
  approval: { emoji: '✅', label: '신청 결과' },
  schedule: { emoji: '⏰', label: '일정' },
  review: { emoji: '✍️', label: '후기' },
  comment: { emoji: '💬', label: '댓글' },
  reply: { emoji: '↩️', label: '답글' },
};

function notificationKind(type: ApiNotificationType): NotificationKind {
  if (type === 'APPLICATION_APPROVED' || type === 'APPLICATION_REJECTED') return 'approval';
  if (type === 'EVENT_REMINDER') return 'schedule';
  if (type === 'REVIEW_REQUEST') return 'review';
  if (type === 'COMMENT') return 'comment';
  if (type === 'REPLY') return 'reply';
  return 'event';
}

function fallbackRoute(type: ApiNotificationType) {
  if (type === 'REVIEW_REQUEST') return '/reviews/new';
  if (type === 'COMMENT' || type === 'REPLY') return '/clubs';
  return '/events';
}

function toNotificationItem(notification: ApiNotification): NotificationItem {
  const safeFallback = sanitizeNotificationRoute(fallbackRoute(notification.type));
  return {
    id: notification.id,
    kind: notificationKind(notification.type),
    title: notification.title,
    body: notification.body,
    createdAt: notification.createdAt,
    read: notification.readAt !== null,
    destination: sanitizeNotificationRoute(notification.link, safeFallback) as Href,
  };
}

function mergeItems(current: NotificationItem[], incoming: NotificationItem[]) {
  const byId = new Map(current.map((item) => [item.id, item]));
  incoming.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function formatNotificationTime(value: string) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return '시간 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

export function NotificationsScreen() {
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const requestVersion = useRef(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const replaceNotifications = useCallback(async (signal?: AbortSignal, refresh = false) => {
    const version = requestVersion.current + 1;
    requestVersion.current = version;
    if (refresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const response = await notificationsApi.list(undefined, signal);
      if (signal?.aborted || requestVersion.current !== version) return;
      setItems(response.data.map(toNotificationItem));
      setNextCursor(response.page.nextCursor);
      setHasNextPage(response.page.hasNextPage);
    } catch (requestError) {
      if (signal?.aborted || requestVersion.current !== version) return;
      setError(apiErrorMessage(requestError, '알림을 불러오지 못했습니다.'));
    } finally {
      if (!signal?.aborted && requestVersion.current === version) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const task = setTimeout(() => void replaceNotifications(controller.signal), 0);
    return () => {
      clearTimeout(task);
      controller.abort();
    };
  }, [replaceNotifications]);

  const loadMore = useCallback(async () => {
    if (!hasNextPage || !nextCursor || loadingMore) return;
    const version = requestVersion.current;
    setLoadingMore(true);
    setError(null);
    try {
      const response = await notificationsApi.list(nextCursor);
      if (requestVersion.current !== version) return;
      setItems((current) => mergeItems(current, response.data.map(toNotificationItem)));
      setNextCursor(response.page.nextCursor);
      setHasNextPage(response.page.hasNextPage);
    } catch (requestError) {
      if (requestVersion.current === version) {
        setError(apiErrorMessage(requestError, '이전 알림을 불러오지 못했습니다.'));
      }
    } finally {
      if (requestVersion.current === version) setLoadingMore(false);
    }
  }, [hasNextPage, loadingMore, nextCursor]);

  const unreadCount = items.filter((item) => !item.read).length;
  const visibleItems = useMemo(
    () => (filter === 'unread' ? items.filter((item) => !item.read) : items),
    [filter, items],
  );

  const markRead = useCallback(async (item: NotificationItem) => {
    if (item.read || pendingIds.includes(item.id)) return true;
    setPendingIds((current) => [...current, item.id]);
    setError(null);
    try {
      await notificationsApi.markRead(item.id);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, read: true } : entry)),
      );
      return true;
    } catch (requestError) {
      setError(apiErrorMessage(requestError, '알림을 읽음 처리하지 못했습니다.'));
      return false;
    } finally {
      setPendingIds((current) => current.filter((id) => id !== item.id));
    }
  }, [pendingIds]);

  const openNotification = useCallback(async (item: NotificationItem) => {
    await markRead(item);
    router.push(item.destination);
  }, [markRead]);

  const markEverythingRead = useCallback(async () => {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    setError(null);
    try {
      await notificationsApi.markAllRead();
      setItems((current) => current.map((item) => ({ ...item, read: true })));
    } catch (requestError) {
      setError(apiErrorMessage(requestError, '모든 알림을 읽음 처리하지 못했습니다.'));
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, unreadCount]);

  return (
    <FlatList
      data={visibleItems}
      keyExtractor={(item) => item.id}
      contentInsetAdjustmentBehavior="never"
      refreshing={refreshing}
      onRefresh={() => void replaceNotifications(undefined, true)}
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{
        width: '100%',
        maxWidth: Layout.maxContentWidth,
        alignSelf: 'center',
        paddingHorizontal: Spacing.xl,
        paddingTop: insets.top + Spacing.lg,
        paddingBottom: Math.max(Spacing.xxxl, insets.bottom + Spacing.xl),
        gap: Spacing.md,
        flexGrow: visibleItems.length === 0 ? 1 : undefined,
      }}
      ListHeaderComponent={
        <View style={{ gap: Spacing.xl, paddingBottom: Spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing.md }}>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <AppText variant="title">알림</AppText>
              <AppText color="textSecondary">현재 목록의 읽지 않은 새 소식 {unreadCount}개</AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="모든 알림 읽음 처리"
              accessibilityState={{ disabled: unreadCount === 0 || markingAll, busy: markingAll }}
              disabled={unreadCount === 0 || markingAll}
              onPress={() => void markEverythingRead()}
              style={({ pressed }) => ({
                minHeight: TouchTarget.minimum,
                paddingHorizontal: Spacing.md,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radius.md,
                backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
                opacity: unreadCount === 0 || markingAll ? 0.55 : 1,
              })}>
              {markingAll ? (
                <ActivityIndicator accessibilityLabel="읽음 처리 중" color={theme.primary} />
              ) : (
                <AppText variant="bodyStrong" color="primary" selectable={false}>
                  모두 읽음
                </AppText>
              )}
            </Pressable>
          </View>

          <View accessibilityRole="tablist" style={{ flexDirection: 'row', gap: Spacing.sm }}>
            {(
              [
                { id: 'all', label: `전체 ${items.length}` },
                { id: 'unread', label: `안 읽음 ${unreadCount}` },
              ] as const
            ).map((option) => {
              const selected = filter === option.id;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(option.id)}
                  style={({ pressed }) => ({
                    minHeight: TouchTarget.minimum,
                    flex: 1,
                    paddingHorizontal: Spacing.lg,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: selected ? 2 : 1,
                    borderColor: selected ? theme.primary : theme.border,
                    borderRadius: Radius.pill,
                    backgroundColor: selected
                      ? theme.backgroundSelected
                      : pressed
                        ? theme.backgroundElement
                        : theme.surface,
                  })}>
                  <AppText variant="bodyStrong" color={selected ? 'primary' : 'text'} selectable={false}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          {error ? (
            <View
              accessibilityRole="alert"
              style={{ padding: Spacing.md, borderRadius: Radius.md, backgroundColor: theme.dangerSurface }}>
              <AppText color="danger">{error}</AppText>
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        loading ? (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="알림을 불러오는 중"
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
            <ActivityIndicator color={theme.primary} size="large" />
            <AppText variant="bodyStrong">알림을 불러오고 있어요</AppText>
          </View>
        ) : error && items.length === 0 ? (
          <EmptyState
            emoji="🔄"
            title="알림을 불러오지 못했어요"
            description="인터넷 연결을 확인한 뒤 다시 시도해 주세요."
            actionLabel="다시 시도"
            onActionPress={() => void replaceNotifications()}
          />
        ) : (
          <EmptyState
            emoji="🔔"
            title={filter === 'unread' ? '새 알림을 모두 확인했어요' : '아직 알림이 없어요'}
            description={
              filter === 'unread'
                ? '새로운 모임과 승인 소식이 오면 이곳에서 알려드릴게요.'
                : '참여한 모임에 새 소식이 생기면 바로 알려드릴게요.'
            }
          />
        )
      }
      ListFooterComponent={
        hasNextPage ? (
          <SeniorButton
            label="이전 알림 더 보기"
            variant="outline"
            loading={loadingMore}
            onPress={() => void loadMore()}
            style={{ marginTop: Spacing.sm }}
          />
        ) : null
      }
      renderItem={({ item }: ListRenderItemInfo<NotificationItem>) => {
        const kind = KIND_LABELS[item.kind];
        const pending = pendingIds.includes(item.id);
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.read ? '읽은 알림' : '새 알림'}, ${kind.label}, ${item.title}, ${item.body}`}
            accessibilityHint={`${kind.label} 화면으로 이동합니다`}
            accessibilityState={{ busy: pending }}
            disabled={pending}
            onPress={() => void openNotification(item)}
            style={({ pressed }) => ({
              minHeight: TouchTarget.minimum,
              padding: Spacing.xl,
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: Spacing.md,
              borderWidth: item.read ? 1 : 2,
              borderColor: item.read ? theme.divider : theme.primary,
              borderRadius: Radius.lg,
              borderCurve: 'continuous',
              backgroundColor: item.read
                ? pressed
                  ? theme.backgroundElement
                  : theme.surface
                : pressed
                  ? theme.backgroundSelected
                  : theme.infoSurface,
              boxShadow: Shadows.card,
              opacity: pending ? 0.65 : 1,
            })}>
            <View
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={{
                width: TouchTarget.minimum,
                height: TouchTarget.minimum,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: Radius.md,
                backgroundColor: item.read ? theme.backgroundElement : theme.surface,
              }}>
              <AppText variant="key" selectable={false}>
                {kind.emoji}
              </AppText>
            </View>
            <View style={{ flex: 1, gap: Spacing.xs }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: Spacing.sm }}>
                <AppText variant="caption" color={item.read ? 'textMuted' : 'primary'} selectable={false}>
                  {kind.label}{item.read ? '' : ' · 새 소식'}
                </AppText>
                <AppText variant="caption" color="textMuted" selectable={false}>
                  {formatNotificationTime(item.createdAt)}
                </AppText>
              </View>
              <AppText variant="bodyStrong" selectable={false}>{item.title}</AppText>
              <AppText color="textSecondary" selectable={false}>{item.body}</AppText>
              <AppText variant="caption" color="primary" selectable={false}>
                {pending ? '읽음 처리 중…' : `${kind.label} 화면 열기 ›`}
              </AppText>
            </View>
          </Pressable>
        );
      }}
    />
  );
}
