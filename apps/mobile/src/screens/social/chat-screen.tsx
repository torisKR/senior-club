import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  TextInput,
  View,
  type ListRenderItemInfo,
} from 'react-native';

import { ApiError } from '@/api/api-error';
import {
  CHAT_FULL_RECONCILE_INTERVAL_MS,
  CHAT_POLL_INTERVAL_MS,
  chatApi,
  drainChatMessageDelta,
  isChatRoomUnread,
  mergeChatMessages,
  reconcileLatestChatMessages,
  type ApiChatMessage,
  type ApiChatRoom,
} from '@/api/chat-api';
import { apiErrorMessage } from '@/api/error-message';
import { createNativeIdempotencyKey } from '@/api/idempotency-key';
import { safetyApi } from '@/api/safety-api';
import { ContentSafetyActions } from '@/components/safety';
import { AppText, EmptyState, SeniorButton } from '@/components/ui';
import { Layout, Radius, Shadows, Spacing, TouchTarget } from '@/constants/theme';
import { useAppState } from '@/hooks/use-app-state';
import { useEffectiveSafeAreaInsets } from '@/hooks/use-effective-safe-area-insets';
import { useTheme } from '@/hooks/use-theme';
import {
  filterBlockedChatMessages,
  hasPendingClientMessage,
  isReportableChatMessage,
  releaseBooleanLock,
  tryAcquireBooleanLock,
} from '@/screens/social/chat-state';
import {
  addBlockedUserId,
  replaceBlockedUserIds,
  useBlockedUserIds,
} from '@/safety/blocked-users-store';

type RoomsStatus = 'loading' | 'ready' | 'error';
type MessagesStatus = 'idle' | 'loading' | 'ready' | 'error' | 'forbidden';
type MessageLoadMode = 'initial' | 'manual' | 'poll' | 'older';

type MessageFeed = {
  roomId: string | null;
  items: ApiChatMessage[];
  status: MessagesStatus;
  error: string;
  refreshing: boolean;
  loadingOlder: boolean;
  hasNextPage: boolean;
  nextCursor: string | null;
  nextAfter: string | null;
};

const EMPTY_MESSAGE_FEED: MessageFeed = {
  roomId: null,
  items: [],
  status: 'idle',
  error: '',
  refreshing: false,
  loadingOlder: false,
  hasNextPage: false,
  nextCursor: null,
  nextAfter: null,
};

function formatChatTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '시간 확인 필요';
  return new Intl.DateTimeFormat('ko-KR', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function messageBody(message: Pick<ApiChatMessage, 'message' | 'type'>) {
  if (message.message?.trim()) return message.message;
  if (message.type === 'IMAGE') return '사진 메시지';
  if (message.type === 'FILE') return '파일 메시지';
  return '메시지 내용 없음';
}

function roomActivityAt(room: ApiChatRoom) {
  return room.activityAt;
}

function newestMessage(messages: readonly ApiChatMessage[]) {
  return [...messages].sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id),
  )[0];
}

function roomLastMessage(message: ApiChatMessage): ApiChatRoom['lastMessage'] {
  return {
    id: message.id,
    message: message.message,
    type: message.type,
    createdAt: message.createdAt,
    sender: message.sender,
  };
}

function updateRoomLastMessage(
  rooms: readonly ApiChatRoom[],
  roomId: string,
  message: ApiChatMessage,
) {
  return rooms
    .map((room) =>
      room.id === roomId
        ? {
            ...room,
            activityAt: message.createdAt,
            lastMessage: roomLastMessage(message),
          }
        : room,
    )
    .sort((left, right) =>
      roomActivityAt(right).localeCompare(roomActivityAt(left)),
    );
}

export function ChatScreen() {
  const theme = useTheme();
  const insets = useEffectiveSafeAreaInsets();
  const params = useLocalSearchParams<{
    roomId?: string | string[];
    eventId?: string | string[];
  }>();
  const { profile, session, largeTextEnabled } = useAppState();
  const currentUserId = session?.userId ?? profile.id;
  const blockedUserIds = useBlockedUserIds(currentUserId);
  const listRef = useRef<FlatList<ApiChatMessage>>(null);
  const roomsRef = useRef<ApiChatRoom[]>([]);
  const roomsControllerRef = useRef<AbortController | null>(null);
  const roomsRequestVersionRef = useRef(0);
  const roomsLoadedRef = useRef(false);
  const roomsNextCursorRef = useRef<string | null>(null);
  const messageControllerRef = useRef<AbortController | null>(null);
  const messageRequestVersionRef = useRef(0);
  const feedRef = useRef<MessageFeed>(EMPTY_MESSAGE_FEED);
  const selectedRoomIdRef = useRef<string | null>(null);
  const sendingClientIdsRef = useRef(new Set<string>());
  const composerSendingRef = useRef(false);
  const lastReadMessageRef = useRef(new Map<string, string>());
  const lastFullSyncAtRef = useRef(new Map<string, number>());

  const [rooms, setRooms] = useState<ApiChatRoom[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<RoomsStatus>('loading');
  const [roomsError, setRoomsError] = useState('');
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [loadingMoreRooms, setLoadingMoreRooms] = useState(false);
  const [roomsHasNextPage, setRoomsHasNextPage] = useState(false);
  const [feed, setFeed] = useState<MessageFeed>(EMPTY_MESSAGE_FEED);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState('');
  const [isSendingDraft, setIsSendingDraft] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    feedRef.current = feed;
  }, [feed]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  const updateFeed = useCallback((updater: (current: MessageFeed) => MessageFeed) => {
    setFeed((current) => {
      const next = updater(current);
      feedRef.current = next;
      return next;
    });
  }, []);

  const requestedRoomId = firstParam(params.roomId);
  const requestedEventId = firstParam(params.eventId);
  const deepLinkedRoom = useMemo(
    () =>
      rooms.find(
        (room) =>
          (requestedRoomId && room.id === requestedRoomId) ||
          (!requestedRoomId && requestedEventId && room.event.id === requestedEventId),
      ),
    [requestedEventId, requestedRoomId, rooms],
  );
  const activeRoomId = deepLinkedRoom?.id;
  const selectedRoom = rooms.find((room) => room.id === activeRoomId);
  const selectedFeed = feed.roomId === activeRoomId ? feed : EMPTY_MESSAGE_FEED;
  const visibleFeed = useMemo(
    () => ({
      ...selectedFeed,
      items: filterBlockedChatMessages(selectedFeed.items, blockedUserIds),
    }),
    [blockedUserIds, selectedFeed],
  );
  const requestedRoomUnavailable = Boolean(
    roomsStatus === 'ready' &&
      (requestedRoomId || requestedEventId) &&
      !deepLinkedRoom &&
      !roomsHasNextPage,
  );

  useEffect(() => {
    selectedRoomIdRef.current = activeRoomId ?? null;
  }, [activeRoomId]);

  const loadRooms = useCallback(async (reason: 'focus' | 'manual' | 'more') => {
    if (reason === 'focus' && roomsControllerRef.current) return;
    const cursor =
      reason === 'more'
        ? (roomsNextCursorRef.current ?? undefined)
        : undefined;
    if (reason === 'more' && (!cursor || roomsControllerRef.current)) return;
    roomsControllerRef.current?.abort();
    const controller = new AbortController();
    const version = roomsRequestVersionRef.current + 1;
    roomsRequestVersionRef.current = version;
    roomsControllerRef.current = controller;

    if (reason === 'manual') setRefreshingRooms(true);
    if (reason === 'more') setLoadingMoreRooms(true);
    if (!roomsLoadedRef.current) setRoomsStatus('loading');
    setRoomsError('');

    try {
      const page = await chatApi.rooms({ cursor, signal: controller.signal });
      if (controller.signal.aborted || roomsRequestVersionRef.current !== version) return;
      const previousRooms = roomsRef.current;
      let nextRooms =
        reason === 'more'
          ? [...previousRooms, ...page.data].filter(
              (room, index, all) =>
                all.findIndex(({ id }) => id === room.id) === index,
            )
          : page.data;

      const selectedId = selectedRoomIdRef.current;
      const previousSelected = selectedId
        ? previousRooms.find(({ id }) => id === selectedId)
        : undefined;
      if (
        selectedId &&
        !nextRooms.some(({ id }) => id === selectedId) &&
        page.page.hasNextPage &&
        previousSelected
      ) {
        nextRooms = [...nextRooms, previousSelected];
      }

      roomsRef.current = nextRooms;
      setRooms(nextRooms);
      roomsNextCursorRef.current = page.page.nextCursor;
      setRoomsHasNextPage(page.page.hasNextPage);
      setRoomsStatus('ready');
      roomsLoadedRef.current = true;

      if (selectedId && !nextRooms.some((room) => room.id === selectedId)) {
        selectedRoomIdRef.current = null;
        router.setParams({ roomId: '', eventId: '' });
        setAnnouncement('더 이상 이용할 수 없는 대화방이라 목록으로 돌아왔습니다.');
      }
    } catch (error) {
      if (controller.signal.aborted || roomsRequestVersionRef.current !== version) return;
      const authenticationLost = error instanceof ApiError && error.status === 401;
      setRoomsError(apiErrorMessage(error, '대화방 목록을 불러오지 못했습니다.'));
      if (authenticationLost) {
        setRooms([]);
        roomsRef.current = [];
        roomsNextCursorRef.current = null;
        setRoomsHasNextPage(false);
        setRoomsStatus('error');
        roomsLoadedRef.current = false;
      } else if (!roomsLoadedRef.current) {
        setRoomsStatus('error');
      }
    } finally {
      if (roomsRequestVersionRef.current === version) {
        if (roomsControllerRef.current === controller) roomsControllerRef.current = null;
        setRefreshingRooms(false);
        setLoadingMoreRooms(false);
      }
    }
  }, []);

  useEffect(() => {
    if (
      roomsStatus === 'ready' &&
      (requestedRoomId || requestedEventId) &&
      !deepLinkedRoom &&
      roomsHasNextPage &&
      !loadingMoreRooms
    ) {
      void loadRooms('more');
    }
  }, [
    deepLinkedRoom,
    loadRooms,
    loadingMoreRooms,
    requestedEventId,
    requestedRoomId,
    roomsHasNextPage,
    roomsStatus,
  ]);

  const markReadBestEffort = useCallback((roomId: string, messageId: string) => {
    if (lastReadMessageRef.current.get(roomId) === messageId) return;
    lastReadMessageRef.current.set(roomId, messageId);
    void chatApi
      .markRead(roomId)
      .then(({ lastReadAt }) => {
        setRooms((current) =>
          current.map((room) =>
            room.id === roomId ? { ...room, lastReadAt } : room,
          ),
        );
      })
      .catch(() => {
        if (lastReadMessageRef.current.get(roomId) === messageId) {
          lastReadMessageRef.current.delete(roomId);
        }
      });
  }, []);

  const loadMessages = useCallback(
    async (
      roomId: string,
      mode: MessageLoadMode,
      cursor?: string,
    ): Promise<boolean> => {
      if (
        messageControllerRef.current &&
        (mode === 'poll' || mode === 'older')
      ) {
        return false;
      }
      if (
        mode === 'poll' &&
        feedRef.current.roomId === roomId &&
        feedRef.current.status === 'forbidden'
      ) {
        return false;
      }
      messageControllerRef.current?.abort();
      const controller = new AbortController();
      const version = messageRequestVersionRef.current + 1;
      messageRequestVersionRef.current = version;
      messageControllerRef.current = controller;
      const snapshot = feedRef.current;
      const newRoom = snapshot.roomId !== roomId;
      const fullReconcileDue =
        Date.now() - (lastFullSyncAtRef.current.get(roomId) ?? 0) >=
        CHAT_FULL_RECONCILE_INTERVAL_MS;
      const after =
        mode === 'poll' &&
        !newRoom &&
        !fullReconcileDue &&
        snapshot.nextAfter
          ? snapshot.nextAfter
          : undefined;
      const isDeltaRequest = mode === 'poll' && Boolean(after);
      const scrollAfterInitialLoad =
        mode === 'initial' &&
        (newRoom || snapshot.items.length === 0);

      updateFeed((current) => {
        const sameRoom = current.roomId === roomId;
        const base = sameRoom
          ? current
          : { ...EMPTY_MESSAGE_FEED, roomId, status: 'loading' as const };
        return {
          ...base,
          status:
            mode === 'initial' && (!sameRoom || base.items.length === 0)
              ? 'loading'
              : base.status,
          error: mode === 'poll' ? base.error : '',
          refreshing: mode === 'manual',
          loadingOlder: mode === 'older',
        };
      });

      try {
        const page = isDeltaRequest
          ? await drainChatMessageDelta(roomId, after!, controller.signal)
          : await chatApi.messages(roomId, {
              ...(mode === 'older' && cursor ? { cursor } : {}),
              signal: controller.signal,
            });
        const loadedMessages = page.data;

        if (
          controller.signal.aborted ||
          messageRequestVersionRef.current !== version ||
          selectedRoomIdRef.current !== roomId
        ) {
          return false;
        }

        updateFeed((current) => {
          const currentItems = current.roomId === roomId ? current.items : [];
          const replacePagination = !isDeltaRequest;
          return {
            roomId,
            items:
              mode === 'older'
                ? mergeChatMessages(currentItems, loadedMessages)
                : isDeltaRequest
                  ? mergeChatMessages(currentItems, loadedMessages)
                  : reconcileLatestChatMessages(currentItems, loadedMessages, {
                    hasNextPage: page.page.hasNextPage,
                    replace: true,
                  }),
            status: 'ready',
            error: '',
            refreshing: false,
            loadingOlder: false,
            hasNextPage: replacePagination
              ? page.page.hasNextPage
              : current.hasNextPage,
            nextCursor: replacePagination
              ? page.page.nextCursor
              : current.nextCursor,
            nextAfter:
              mode === 'older'
                ? current.nextAfter
                : (page.page.nextAfter ?? current.nextAfter),
          };
        });

        if (!isDeltaRequest && mode !== 'older') {
          lastFullSyncAtRef.current.set(roomId, Date.now());
        }

        if (scrollAfterInitialLoad) {
          requestAnimationFrame(() => {
            if (selectedRoomIdRef.current === roomId) {
              listRef.current?.scrollToEnd({ animated: false });
            }
          });
        }

        const newest = newestMessage(loadedMessages);
        if (newest && mode !== 'older') {
          setRooms((current) =>
            updateRoomLastMessage(current, roomId, newest),
          );
          markReadBestEffort(roomId, newest.id);
        }
        return true;
      } catch (error) {
        if (controller.signal.aborted || messageRequestVersionRef.current !== version) {
          return false;
        }
        const forbidden = error instanceof ApiError && error.status === 403;
        const authenticationLost = error instanceof ApiError && error.status === 401;
        const accessLost = forbidden || authenticationLost;
        updateFeed((current) =>
          current.roomId === roomId
            ? {
                ...current,
                status: forbidden ? 'forbidden' : 'error',
                ...(accessLost
                  ? {
                      items: [],
                      hasNextPage: false,
                      nextCursor: null,
                      nextAfter: null,
                    }
                  : {}),
                error: apiErrorMessage(
                  error,
                  forbidden
                    ? '이 대화방을 이용할 수 없습니다.'
                    : authenticationLost
                      ? '로그인 상태를 다시 확인해 주세요.'
                    : '대화 내용을 불러오지 못했습니다.',
                ),
                refreshing: false,
                loadingOlder: false,
              }
            : current,
        );
        if (accessLost) lastFullSyncAtRef.current.delete(roomId);
        return false;
      } finally {
        if (
          messageRequestVersionRef.current === version &&
          messageControllerRef.current === controller
        ) {
          messageControllerRef.current = null;
        }
      }
    },
    [markReadBestEffort, updateFeed],
  );

  const handleChatAuthorBlocked = useCallback(
    async (blockedUserId: string, roomId: string) => {
      addBlockedUserId(currentUserId, blockedUserId);
      updateFeed((current) =>
        current.roomId === roomId
          ? {
              ...current,
              items: current.items.filter(
                (message) => message.userId !== blockedUserId,
              ),
            }
          : current,
      );
      setRooms((current) =>
        current.map((room) =>
          room.lastMessage?.sender.id === blockedUserId
            ? { ...room, lastMessage: null }
            : room,
        ),
      );

      const blocks = await safetyApi.blocks();
      const authoritativeBlockedUserIds = new Set(
        blocks.map((block) => block.blockedUser.id),
      );
      if (!authoritativeBlockedUserIds.has(blockedUserId)) {
        throw new Error('차단 상태가 서버 목록에 반영되지 않았습니다.');
      }
      replaceBlockedUserIds(currentUserId, authoritativeBlockedUserIds);

      if (selectedRoomIdRef.current !== roomId) {
        await loadRooms('manual');
        return;
      }
      const refreshed = await loadMessages(roomId, 'manual');
      await loadRooms('manual');
      if (!refreshed) {
        throw new Error(
          '차단은 완료됐지만 최신 채팅 목록을 확인하지 못했습니다.',
        );
      }
    },
    [currentUserId, loadMessages, loadRooms, updateFeed],
  );

  useFocusEffect(
    useCallback(() => {
      let task: ReturnType<typeof setTimeout> | undefined;
      const refreshWhenActive = () => {
        if (AppState.currentState !== 'active' || task !== undefined) return;
        task = setTimeout(() => {
          task = undefined;
          void loadRooms('focus');
        }, 0);
      };
      refreshWhenActive();
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') {
          refreshWhenActive();
        } else {
          if (task !== undefined) clearTimeout(task);
          task = undefined;
          roomsRequestVersionRef.current += 1;
          roomsControllerRef.current?.abort();
          roomsControllerRef.current = null;
        }
      });
      return () => {
        if (task !== undefined) clearTimeout(task);
        subscription.remove();
        roomsRequestVersionRef.current += 1;
        roomsControllerRef.current?.abort();
        roomsControllerRef.current = null;
      };
    }, [loadRooms]),
  );

  useFocusEffect(
    useCallback(() => {
      if (!activeRoomId) return undefined;
      let task: ReturnType<typeof setTimeout> | undefined;
      let interval: ReturnType<typeof setInterval> | undefined;

      const stop = () => {
        if (task !== undefined) clearTimeout(task);
        if (interval !== undefined) clearInterval(interval);
        task = undefined;
        interval = undefined;
        messageRequestVersionRef.current += 1;
        messageControllerRef.current?.abort();
        messageControllerRef.current = null;
      };
      const start = () => {
        if (
          AppState.currentState !== 'active' ||
          task !== undefined ||
          interval !== undefined
        ) {
          return;
        }
        task = setTimeout(() => {
          task = undefined;
          void loadMessages(activeRoomId, 'initial');
        }, 0);
        interval = setInterval(
          () => void loadMessages(activeRoomId, 'poll'),
          CHAT_POLL_INTERVAL_MS,
        );
      };

      start();
      const subscription = AppState.addEventListener('change', (state) => {
        stop();
        if (state === 'active') start();
      });
      return () => {
        subscription.remove();
        stop();
      };
    }, [activeRoomId, loadMessages]),
  );

  function openRoom(room: ApiChatRoom) {
    selectedRoomIdRef.current = room.id;
    router.setParams({ roomId: room.id, eventId: '' });
    setDraft('');
    setSendError('');
    setAnnouncement(`${room.event.title} 대화방을 열었습니다.`);
  }

  function closeRoom() {
    selectedRoomIdRef.current = null;
    router.setParams({ roomId: '', eventId: '' });
    setDraft('');
    setSendError('');
    setAnnouncement('대화방 목록으로 돌아왔습니다.');
  }

  const deliverMessage = useCallback(
    async (optimistic: ApiChatMessage, fromComposer = false) => {
      const clientMessageId = optimistic.clientMessageId;
      if (!clientMessageId || sendingClientIdsRef.current.has(clientMessageId)) {
        if (fromComposer) {
          releaseBooleanLock(composerSendingRef);
          setIsSendingDraft(false);
        }
        return;
      }
      sendingClientIdsRef.current.add(clientMessageId);
      if (fromComposer) setIsSendingDraft(true);
      setSendError('');
      updateFeed((current) =>
        current.roomId === optimistic.roomId
          ? {
              ...current,
              items: current.items.map((message) =>
                message.clientMessageId === clientMessageId &&
                message.userId === optimistic.userId
                  ? { ...message, delivery: 'pending', deliveryError: undefined }
                  : message,
              ),
            }
          : current,
      );

      try {
        const confirmed = await chatApi.send(optimistic.roomId, {
          clientMessageId,
          message: optimistic.message ?? '',
        });
        updateFeed((current) =>
          current.roomId === optimistic.roomId
            ? {
                ...current,
                items: mergeChatMessages(current.items, [confirmed]),
                status: 'ready',
                error: '',
              }
            : current,
        );
        setRooms((current) =>
          updateRoomLastMessage(current, optimistic.roomId, confirmed),
        );
        setAnnouncement('메시지를 보냈습니다.');
      } catch (error) {
        const currentItems =
          feedRef.current.roomId === optimistic.roomId
            ? feedRef.current.items
            : [];
        const alreadyConfirmed = currentItems.some(
          (item) =>
            item.clientMessageId === clientMessageId &&
            item.userId === optimistic.userId &&
            item.delivery !== 'pending' &&
            item.delivery !== 'failed',
        );
        if (alreadyConfirmed) {
          setSendError('');
          setAnnouncement('메시지를 보냈습니다.');
          return;
        }

        const message = apiErrorMessage(error, '메시지를 보내지 못했습니다.');
        const permissionLost = error instanceof ApiError && error.status === 403;
        const authenticationLost = error instanceof ApiError && error.status === 401;

        if (permissionLost || authenticationLost) {
          updateFeed((current) =>
            current.roomId === optimistic.roomId
              ? {
                  ...current,
                  items: [],
                  status: permissionLost ? 'forbidden' : 'error',
                  error: message,
                  refreshing: false,
                  loadingOlder: false,
                  hasNextPage: false,
                  nextCursor: null,
                }
              : current,
          );
          setSendError(message);
          setAnnouncement(
            permissionLost
              ? '대화방 이용 권한을 다시 확인해 주세요.'
              : '로그인 상태를 다시 확인해 주세요.',
          );
          if (permissionLost) void loadRooms('manual');
          return;
        }

        const stillPending = hasPendingClientMessage(
          currentItems,
          clientMessageId,
          optimistic.userId,
        );
        updateFeed((current) =>
          current.roomId === optimistic.roomId
            ? {
                ...current,
                items: current.items.map((item) =>
                  item.clientMessageId === clientMessageId &&
                  item.userId === optimistic.userId &&
                  item.delivery === 'pending'
                    ? { ...item, delivery: 'failed', deliveryError: message }
                    : item,
                ),
              }
            : current,
        );
        setSendError(message);
        setAnnouncement(
          stillPending
            ? '메시지 전송에 실패했습니다. 같은 메시지를 다시 보낼 수 있습니다.'
            : '메시지 전송 결과를 확인하지 못했습니다. 대화를 새로고침해 주세요.',
        );
      } finally {
        sendingClientIdsRef.current.delete(clientMessageId);
        if (fromComposer) {
          releaseBooleanLock(composerSendingRef);
          setIsSendingDraft(false);
        }
      }
    },
    [loadRooms, updateFeed],
  );

  function submitMessage() {
    if (!tryAcquireBooleanLock(composerSendingRef)) return;
    const content = draft.trim();
    if (!selectedRoom || visibleFeed.status !== 'ready') {
      setSendError('대화방 연결을 확인한 뒤 다시 시도해 주세요.');
      releaseBooleanLock(composerSendingRef);
      return;
    }
    if (!content) {
      setSendError('보낼 메시지를 입력해 주세요.');
      setAnnouncement('보낼 메시지를 입력해 주세요.');
      releaseBooleanLock(composerSendingRef);
      return;
    }

    let clientMessageId: string;
    try {
      clientMessageId = createNativeIdempotencyKey();
    } catch {
      setSendError('안전한 메시지 요청 식별자를 만들지 못했습니다.');
      releaseBooleanLock(composerSendingRef);
      return;
    }

    const optimistic: ApiChatMessage = {
      id: `optimistic:${clientMessageId}`,
      roomId: selectedRoom.id,
      userId: currentUserId,
      clientMessageId,
      replyToId: null,
      type: 'TEXT',
      message: content,
      createdAt: new Date().toISOString(),
      editedAt: null,
      sender: { id: currentUserId, name: profile.name, avatarUrl: null },
      attachments: [],
      delivery: 'pending',
    };
    updateFeed((current) => ({
      ...current,
      items: mergeChatMessages(current.items, [optimistic]),
    }));
    setDraft('');
    setSendError('');
    setAnnouncement('메시지를 전송하고 있습니다.');
    void deliverMessage(optimistic, true);
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }

  if (!selectedRoom) {
    const showInitialError = roomsStatus === 'error' && rooms.length === 0;
    const showInitialLoading = roomsStatus === 'loading' && rooms.length === 0;
    return (
      <FlatList
        data={rooms}
        keyExtractor={(room) => room.id}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        refreshing={refreshingRooms}
        onRefresh={() => void loadRooms('manual')}
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: Layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: Spacing.xl,
          paddingTop: insets.top + Spacing.lg,
          paddingBottom: Math.max(Spacing.xxxl, insets.bottom + Spacing.xl),
          gap: Spacing.md,
          flexGrow: rooms.length === 0 ? 1 : undefined,
        }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md, paddingBottom: Spacing.sm }}>
            <View style={{ gap: Spacing.xs }}>
              <AppText variant="title">모임 채팅</AppText>
              <AppText color="textSecondary">
                참가 승인이 유지되는 모임만 서버에서 확인해 보여드려요.
              </AppText>
            </View>
            <SeniorButton
              label="대화방 새로고침"
              variant="outline"
              loading={refreshingRooms}
              onPress={() => void loadRooms('manual')}
            />
            {roomsError && !showInitialError ? (
              <AppText accessibilityRole="alert" color="danger" variant="bodyStrong">
                {roomsError}
              </AppText>
            ) : null}
            {requestedRoomUnavailable ? (
              <AppText accessibilityRole="alert" color="warning" variant="bodyStrong">
                요청한 대화방을 찾지 못했습니다. 참가 승인이 유지되는지 확인해 주세요.
              </AppText>
            ) : null}
            <AppText accessibilityLiveRegion="polite" color="textSecondary" variant="caption">
              {announcement}
            </AppText>
          </View>
        }
        ListEmptyComponent={
          showInitialLoading ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="대화방 목록을 불러오는 중"
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
              <ActivityIndicator color={theme.primary} size="large" />
              <AppText variant="bodyStrong">대화방을 확인하고 있어요</AppText>
            </View>
          ) : showInitialError ? (
            <EmptyState
              emoji="⚠️"
              title="대화방을 불러오지 못했어요"
              description={roomsError}
              actionLabel="다시 시도"
              onActionPress={() => void loadRooms('manual')}
            />
          ) : (
            <EmptyState
              emoji="💬"
              title="열린 대화방이 없어요"
              description="모임 참가가 승인되면 이곳에서 실제 대화방을 확인할 수 있어요."
            />
          )
        }
        ListFooterComponent={
          rooms.length > 0 && roomsHasNextPage ? (
            <View style={{ paddingTop: Spacing.md }}>
              <SeniorButton
                label="대화방 더 보기"
                variant="outline"
                loading={loadingMoreRooms}
                disabled={loadingMoreRooms}
                onPress={() => void loadRooms('more')}
              />
            </View>
          ) : null
        }
        renderItem={({ item }: ListRenderItemInfo<ApiChatRoom>) => {
          const unread = isChatRoomUnread(item, currentUserId);
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.event.title}${unread ? ', 새 메시지 있음' : ''}`}
              accessibilityHint="두 번 탭하면 대화 내용을 엽니다"
              onPress={() => openRoom(item)}
              style={({ pressed }) => ({
                minHeight: TouchTarget.minimum,
                padding: Spacing.xl,
                gap: Spacing.md,
                borderWidth: 1,
                borderColor: unread ? theme.primary : theme.divider,
                borderRadius: Radius.lg,
                borderCurve: 'continuous',
                backgroundColor: pressed ? theme.backgroundSelected : theme.surface,
                boxShadow: Shadows.card,
              })}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md }}>
                <View style={{ flex: 1, gap: Spacing.xs }}>
                  <AppText variant="sectionTitle" selectable={false}>
                    {item.event.title}
                  </AppText>
                  <AppText variant="bodyStrong" color="primary" selectable={false}>
                    {item.event.club.title}
                  </AppText>
                </View>
                {unread ? (
                  <View
                    accessibilityLabel="새 메시지 있음"
                    style={{
                      minWidth: 36,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: Radius.pill,
                      backgroundColor: theme.accent,
                    }}>
                    <AppText variant="caption" color="#FFFFFF" selectable={false}>
                      새 글
                    </AppText>
                  </View>
                ) : null}
              </View>
              <AppText color="textSecondary" numberOfLines={2} selectable={false}>
                {item.lastMessage ? messageBody(item.lastMessage) : '아직 메시지가 없습니다.'}
              </AppText>
              <AppText variant="caption" color="textMuted" selectable={false}>
                {item.lastMessage
                  ? formatChatTime(item.lastMessage.createdAt)
                  : `${formatChatTime(item.joinedAt)} 참여`}
              </AppText>
            </Pressable>
          );
        }}
      />
    );
  }

  const canSend = visibleFeed.status === 'ready';
  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={process.env.EXPO_OS === 'ios' ? 8 : 0}
      style={{ flex: 1, backgroundColor: theme.background }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          paddingTop: insets.top + Spacing.sm,
          borderBottomWidth: 1,
          borderBottomColor: theme.divider,
          backgroundColor: theme.surface,
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대화방 목록으로 돌아가기"
          onPress={closeRoom}
          style={({ pressed }) => ({
            width: TouchTarget.minimum,
            height: TouchTarget.minimum,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: Radius.md,
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
          })}>
          <AppText variant="key" selectable={false}>‹</AppText>
        </Pressable>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText variant="sectionTitle" numberOfLines={2} selectable={false}>
            {selectedRoom.event.title}
          </AppText>
          <AppText variant="caption" color="textSecondary" numberOfLines={1} selectable={false}>
            {selectedRoom.event.club.title}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="대화 내용 새로고침"
          accessibilityState={{ busy: visibleFeed.refreshing }}
          disabled={visibleFeed.refreshing}
          onPress={() => void loadMessages(selectedRoom.id, 'manual')}
          style={({ pressed }) => ({
            minHeight: TouchTarget.minimum,
            paddingHorizontal: Spacing.md,
            justifyContent: 'center',
            borderRadius: Radius.md,
            backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
            opacity: visibleFeed.refreshing ? 0.55 : 1,
          })}>
          {visibleFeed.refreshing ? (
            <ActivityIndicator accessibilityLabel="새로고침 중" color={theme.primary} />
          ) : (
            <AppText variant="bodyStrong" color="primary" selectable={false}>새로고침</AppText>
          )}
        </Pressable>
      </View>

      <FlatList
        ref={listRef}
        data={visibleFeed.items}
        extraData={visibleFeed}
        keyExtractor={(message) => message.id}
        contentInsetAdjustmentBehavior="never"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        refreshing={visibleFeed.refreshing}
        onRefresh={() => void loadMessages(selectedRoom.id, 'manual')}
        maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        style={{ flex: 1 }}
        contentContainerStyle={{
          width: '100%',
          maxWidth: Layout.maxContentWidth,
          alignSelf: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.xl,
          gap: Spacing.lg,
          flexGrow: visibleFeed.items.length === 0 ? 1 : undefined,
        }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.md }}>
            <View
              style={{
                padding: Spacing.lg,
                gap: Spacing.xs,
                borderRadius: Radius.lg,
                borderCurve: 'continuous',
                backgroundColor: theme.infoSurface,
              }}>
              <AppText variant="bodyStrong" color="info">만나는 곳</AppText>
              <AppText>{selectedRoom.event.locationName}</AppText>
              <AppText variant="caption" color="textSecondary">
                {formatChatTime(selectedRoom.event.startAt)}
              </AppText>
            </View>
            {visibleFeed.hasNextPage && visibleFeed.nextCursor ? (
              <SeniorButton
                label="이전 대화 불러오기"
                variant="outline"
                loading={visibleFeed.loadingOlder}
                onPress={() =>
                  void loadMessages(selectedRoom.id, 'older', visibleFeed.nextCursor ?? undefined)
                }
              />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          visibleFeed.status === 'loading' || visibleFeed.status === 'idle' ? (
            <View
              accessibilityRole="progressbar"
              accessibilityLabel="대화 내용을 불러오는 중"
              style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md }}>
              <ActivityIndicator color={theme.primary} size="large" />
              <AppText variant="bodyStrong">대화를 확인하고 있어요</AppText>
            </View>
          ) : visibleFeed.status === 'forbidden' ? (
            <EmptyState
              emoji="🔒"
              title="이 대화방을 이용할 수 없어요"
              description={visibleFeed.error || '참가 승인 상태를 다시 확인해 주세요.'}
              actionLabel="대화방 목록으로"
              onActionPress={closeRoom}
            />
          ) : visibleFeed.status === 'error' ? (
            <EmptyState
              emoji="⚠️"
              title="대화를 불러오지 못했어요"
              description={visibleFeed.error}
              actionLabel="다시 시도"
              onActionPress={() => void loadMessages(selectedRoom.id, 'manual')}
            />
          ) : (
            <EmptyState
              emoji="👋"
              title="첫 인사를 건네보세요"
              description="모임 준비와 만나는 장소에 관해 자유롭게 이야기할 수 있어요."
            />
          )
        }
        renderItem={({ item }: ListRenderItemInfo<ApiChatMessage>) => {
          const isMine = item.userId === currentUserId;
          const body = messageBody(item);
          if (item.type === 'NOTICE') {
            return (
              <View
                accessibilityLabel={`공지, ${body}`}
                style={{
                  alignSelf: 'stretch',
                  padding: Spacing.lg,
                  gap: Spacing.xs,
                  borderRadius: Radius.md,
                  backgroundColor: theme.warningSurface,
                }}>
                <AppText variant="bodyStrong" color="warning">모임 공지</AppText>
                <AppText>{body}</AppText>
              </View>
            );
          }

          const deliveryLabel =
            item.delivery === 'pending'
              ? '전송 중'
              : item.delivery === 'failed'
                ? '전송 실패'
                : isMine
                  ? '전송됨'
                  : '';
          return (
            <View
              accessibilityLabel={`${item.sender.name}, ${body}, ${formatChatTime(item.createdAt)}${
                deliveryLabel ? `, ${deliveryLabel}` : ''
              }`}
              style={{ alignSelf: isMine ? 'flex-end' : 'flex-start', maxWidth: '86%', gap: Spacing.xs }}>
              <AppText variant="caption" color="textSecondary" align={isMine ? 'right' : 'left'} selectable={false}>
                {item.sender.name}
              </AppText>
              <View
                style={{
                  paddingHorizontal: Spacing.lg,
                  paddingVertical: Spacing.md,
                  borderRadius: Radius.lg,
                  borderCurve: 'continuous',
                  borderBottomRightRadius: isMine ? Radius.sm : Radius.lg,
                  borderBottomLeftRadius: isMine ? Radius.lg : Radius.sm,
                  borderWidth: isMine ? 0 : 1,
                  borderColor: theme.divider,
                  backgroundColor: isMine ? theme.primary : theme.surface,
                  opacity: item.delivery === 'pending' ? 0.72 : 1,
                }}>
                <AppText color={isMine ? 'inverseText' : 'text'}>{body}</AppText>
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: isMine ? 'flex-end' : 'flex-start', gap: Spacing.sm }}>
                {deliveryLabel ? (
                  <AppText
                    variant="caption"
                    color={item.delivery === 'failed' ? 'danger' : 'success'}
                    selectable={false}>
                    {deliveryLabel}
                  </AppText>
                ) : null}
                <AppText variant="caption" color="textMuted" selectable={false}>
                  {formatChatTime(item.createdAt)}
                </AppText>
              </View>
              {item.delivery === 'failed' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="같은 메시지 다시 보내기"
                  accessibilityHint={item.deliveryError}
                  onPress={() => void deliverMessage(item)}
                  style={({ pressed }) => ({
                    minHeight: TouchTarget.minimum,
                    paddingHorizontal: Spacing.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.danger,
                    borderRadius: Radius.md,
                    backgroundColor: pressed ? theme.dangerSurface : theme.surface,
                  })}>
                  <AppText variant="bodyStrong" color="danger" selectable={false}>다시 보내기</AppText>
                </Pressable>
              ) : null}
              {isReportableChatMessage(item, currentUserId) ? (
                <ContentSafetyActions
                  targetType="CHAT_MESSAGE"
                  targetId={item.id}
                  targetLabel="채팅 메시지"
                  authorUserId={item.userId}
                  authorName={item.sender.name}
                  currentUserId={currentUserId}
                  onBlocked={(blockedUserId) =>
                    handleChatAuthorBlocked(blockedUserId, item.roomId)
                  }
                />
              ) : null}
            </View>
          );
        }}
      />

      <View
        style={{
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.md,
          paddingBottom: Math.max(Spacing.md, insets.bottom),
          borderTopWidth: 1,
          borderTopColor: theme.divider,
          backgroundColor: theme.surface,
          gap: Spacing.sm,
        }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.sm }}>
          <TextInput
            accessibilityLabel="보낼 메시지"
            accessibilityHint="메시지를 입력한 다음 보내기 버튼을 누르세요"
            accessibilityState={{ disabled: !canSend }}
            allowFontScaling
            editable={canSend && !isSendingDraft}
            multiline
            maxLength={500}
            onChangeText={(value) => {
              setDraft(value);
              if (value.trim()) {
                setSendError('');
                setAnnouncement('');
              }
            }}
            placeholder={canSend ? '메시지를 입력하세요' : '대화방 연결을 확인하고 있어요'}
            placeholderTextColor={theme.textMuted}
            value={draft}
            style={{
              flex: 1,
              minHeight: TouchTarget.minimum,
              maxHeight: 132,
              paddingHorizontal: Spacing.lg,
              paddingVertical: Spacing.md,
              borderWidth: 2,
              borderColor: sendError ? theme.danger : theme.border,
              borderRadius: Radius.lg,
              borderCurve: 'continuous',
              color: theme.text,
              backgroundColor: theme.background,
              fontSize: largeTextEnabled ? 20 : 18,
              lineHeight: largeTextEnabled ? 31 : 28,
              textAlignVertical: 'center',
              opacity: canSend ? 1 : 0.62,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="메시지 보내기"
            accessibilityState={{ disabled: !canSend || isSendingDraft, busy: isSendingDraft }}
            disabled={!canSend || isSendingDraft}
            onPress={submitMessage}
            style={({ pressed }) => ({
              minWidth: 78,
              minHeight: largeTextEnabled ? 60 : TouchTarget.minimum,
              paddingHorizontal: Spacing.md,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: Radius.md,
              borderCurve: 'continuous',
              backgroundColor: pressed ? theme.primaryPressed : theme.primary,
              opacity: !canSend || isSendingDraft ? 0.55 : 1,
            })}>
            {isSendingDraft ? (
              <ActivityIndicator accessibilityLabel="메시지 전송 중" color={theme.inverseText} />
            ) : (
              <AppText variant="button" color="inverseText" selectable={false}>보내기</AppText>
            )}
          </Pressable>
        </View>
        {visibleFeed.error && visibleFeed.items.length > 0 ? (
          <AppText accessibilityRole="alert" variant="bodyStrong" color="danger">
            {visibleFeed.error}
          </AppText>
        ) : null}
        {sendError ? (
          <AppText accessibilityRole="alert" accessibilityLiveRegion="assertive" variant="bodyStrong" color="danger">
            {sendError}
          </AppText>
        ) : null}
        <AppText accessibilityLiveRegion="polite" variant="caption" color="textSecondary">
          {announcement}
        </AppText>
      </View>
    </KeyboardAvoidingView>
  );
}
