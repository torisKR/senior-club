"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleUserRound,
  Info,
  LoaderCircle,
  MapPin,
  MessageCircleMore,
  RefreshCw,
  RotateCcw,
  Send,
} from "lucide-react";

type ChatSender = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

type ChatAttachment = {
  id: string;
  type: "IMAGE" | "FILE" | string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type ChatMessageRecord = {
  id: string;
  roomId: string;
  userId: string;
  clientMessageId: string | null;
  replyToId: string | null;
  type: "TEXT" | "IMAGE" | "FILE" | "NOTICE" | string;
  message: string | null;
  createdAt: string;
  editedAt: string | null;
  sender: ChatSender;
  attachments: ChatAttachment[];
  delivery?: "pending" | "failed";
  deliveryError?: string;
};

export type ChatRoomRecord = {
  id: string;
  activityAt: string;
  joinedAt: string;
  mutedAt: string | null;
  lastReadAt: string | null;
  event: {
    id: string;
    title: string;
    startAt: string;
    locationName: string;
    club: { title: string; slug: string };
  };
  lastMessage: Pick<
    ChatMessageRecord,
    "id" | "message" | "type" | "createdAt" | "sender"
  > | null;
};

type ChatRoomPage = {
  data: ChatRoomRecord[];
  page: { hasNextPage: boolean; nextCursor: string | null };
};

type MessagePage = {
  data: ChatMessageRecord[];
  page: {
    hasNextPage: boolean;
    nextCursor: string | null;
    nextAfter: string | null;
  };
};

type RoomMessagesState = {
  error: string;
  hasNextPage: boolean;
  items: ChatMessageRecord[];
  loaded: boolean;
  nextCursor: string | null;
  nextAfter: string | null;
  status: "idle" | "loading" | "ready" | "forbidden";
};

type ChatApiErrorEnvelope = {
  error?: { code?: string; message?: string };
};

class ChatRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "ChatRequestError";
  }
}

const EMPTY_MESSAGES: RoomMessagesState = {
  error: "",
  hasNextPage: false,
  items: [],
  loaded: false,
  nextCursor: null,
  nextAfter: null,
  status: "idle",
};

const CHAT_POLL_INTERVAL_MS = 20_000;
const CHAT_FULL_RECONCILE_INTERVAL_MS = 5 * 60_000;
const CHAT_MAX_DELTA_PAGES = 3;

const ROOM_ACCENTS = [
  "bg-[var(--primary)]",
  "bg-[var(--sky)]",
  "bg-[var(--accent)]",
] as const;

function messageSort(left: ChatMessageRecord, right: ChatMessageRecord) {
  const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return timeDifference || left.id.localeCompare(right.id);
}

/** Merges cursor/poll pages and replaces an optimistic row by clientMessageId. */
export function mergeChatMessages(
  current: readonly ChatMessageRecord[],
  incoming: readonly ChatMessageRecord[],
) {
  const incomingClientKeys = new Set(
    incoming.flatMap(({ clientMessageId, userId }) =>
      clientMessageId ? [`${userId}\u0000${clientMessageId}`] : [],
    ),
  );
  const byId = new Map<string, ChatMessageRecord>();
  for (const message of current) {
    if (
      message.clientMessageId &&
      incomingClientKeys.has(`${message.userId}\u0000${message.clientMessageId}`)
    ) {
      continue;
    }
    byId.set(message.id, message);
  }
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(messageSort);
}

export function reconcileLatestChatMessages(
  current: readonly ChatMessageRecord[],
  incoming: readonly ChatMessageRecord[],
) {
  const localRows = current.filter(
    ({ delivery }) => delivery === "pending" || delivery === "failed",
  );
  return mergeChatMessages(localRows, incoming);
}

function newestMessage(messages: readonly ChatMessageRecord[]) {
  return [...messages].sort((left, right) => messageSort(right, left))[0];
}

export function isChatRoomUnread(room: ChatRoomRecord, currentUserId: string) {
  if (!room.lastMessage || room.lastMessage.sender.id === currentUserId) {
    return false;
  }
  if (!room.lastReadAt) return true;
  return Date.parse(room.lastMessage.createdAt) > Date.parse(room.lastReadAt);
}

function roomAccent(roomId: string) {
  let value = 0;
  for (const character of roomId) value = (value + character.charCodeAt(0)) % 997;
  return ROOM_ACCENTS[value % ROOM_ACCENTS.length];
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "시간 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "시간 확인 필요";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(date);
}

function messageSummary(message: ChatRoomRecord["lastMessage"]) {
  if (!message) return "아직 메시지가 없습니다.";
  if (message.message?.trim()) return message.message;
  if (message.type === "IMAGE") return "사진을 보냈습니다.";
  if (message.type === "FILE") return "파일을 보냈습니다.";
  return "새 메시지가 있습니다.";
}

function messageBody(message: ChatMessageRecord) {
  if (message.message?.trim()) return message.message;
  if (message.type === "IMAGE") return "사진";
  if (message.type === "FILE") return "파일";
  return "메시지 내용 없음";
}

function safeAttachmentUrl(value: string) {
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function apiError(response: Response) {
  try {
    const payload = (await response.json()) as ChatApiErrorEnvelope;
    return new ChatRequestError(
      payload.error?.message ?? "채팅 요청을 처리하지 못했습니다.",
      response.status,
      payload.error?.code,
    );
  } catch {
    return new ChatRequestError(
      "채팅 서버 응답을 확인하지 못했습니다.",
      response.status,
    );
  }
}

function loginAgain(router: ReturnType<typeof useRouter>) {
  router.replace("/login?returnTo=%2Fchat");
  router.refresh();
}

function stateForRoom(
  states: Record<string, RoomMessagesState>,
  roomId: string | null,
) {
  return roomId ? (states[roomId] ?? EMPTY_MESSAGES) : EMPTY_MESSAGES;
}

export function ChatRoom({
  currentUser,
}: {
  currentUser: { id: string; name: string };
}) {
  const router = useRouter();
  const [rooms, setRooms] = useState<ChatRoomRecord[]>([]);
  const [roomsStatus, setRoomsStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [roomsError, setRoomsError] = useState("");
  const [isRefreshingRooms, setIsRefreshingRooms] = useState(false);
  const [isLoadingMoreRooms, setIsLoadingMoreRooms] = useState(false);
  const [roomsHasNextPage, setRoomsHasNextPage] = useState(false);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<string, RoomMessagesState>
  >({});
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"rooms" | "messages">("rooms");
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const messageLogRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef(messagesByRoom);
  const roomsRef = useRef(rooms);
  const roomsNextCursorRef = useRef<string | null>(null);
  const selectedRoomIdRef = useRef(selectedRoomId);
  const roomRequestRef = useRef(false);
  const messageRequestRef = useRef(new Set<string>());
  const readRequestRef = useRef(new Set<string>());
  const sendRequestRef = useRef(new Set<string>());
  const submitLockRef = useRef(false);
  const lastMarkedMessageRef = useRef(new Map<string, string>());
  const lastFullSyncAtRef = useRef(new Map<string, number>());
  const olderScrollAnchorRef = useRef<{
    height: number;
    roomId: string;
  } | null>(null);
  const autoScrollRef = useRef(true);

  useEffect(() => {
    messagesRef.current = messagesByRoom;
  }, [messagesByRoom]);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    selectedRoomIdRef.current = selectedRoomId;
  }, [selectedRoomId]);

  const selectedRoom = useMemo(
    () => rooms.find(({ id }) => id === selectedRoomId) ?? null,
    [rooms, selectedRoomId],
  );
  const selectedState = stateForRoom(messagesByRoom, selectedRoomId);
  const unreadRoomCount = rooms.filter((room) =>
    isChatRoomUnread(room, currentUser.id),
  ).length;

  const loadRooms = useCallback(
    async (reason: "initial" | "focus" | "manual" | "more") => {
      if (roomRequestRef.current) return;
      const cursor = reason === "more" ? roomsNextCursorRef.current : null;
      if (reason === "more" && !cursor) return;
      roomRequestRef.current = true;
      if (reason === "manual") setIsRefreshingRooms(true);
      if (reason === "more") setIsLoadingMoreRooms(true);
      if (reason === "initial") setRoomsStatus("loading");

      try {
        const params = new URLSearchParams({ limit: "50" });
        if (cursor) params.set("cursor", cursor);
        const response = await fetch(`/api/chat/rooms?${params}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (response.status === 401) {
          loginAgain(router);
          return;
        }
        if (!response.ok) throw await apiError(response);
        const result = (await response.json()) as ChatRoomPage;
        if (
          !Array.isArray(result.data) ||
          !result.page ||
          typeof result.page.hasNextPage !== "boolean" ||
          !(result.page.nextCursor === null ||
            typeof result.page.nextCursor === "string") ||
          result.page.hasNextPage !== Boolean(result.page.nextCursor)
        ) {
          throw new Error("대화방 목록 형식이 올바르지 않습니다.");
        }
        const previousRooms = roomsRef.current;
        let nextRooms =
          reason === "more"
            ? [...previousRooms, ...result.data].filter(
                (room, index, all) =>
                  all.findIndex(({ id }) => id === room.id) === index,
              )
            : result.data;
        const selectedId = selectedRoomIdRef.current;
        const previousSelected = selectedId
          ? previousRooms.find(({ id }) => id === selectedId)
          : undefined;
        if (
          selectedId &&
          !nextRooms.some(({ id }) => id === selectedId) &&
          result.page.hasNextPage &&
          previousSelected
        ) {
          nextRooms = [...nextRooms, previousSelected];
        }
        roomsRef.current = nextRooms;
        roomsNextCursorRef.current = result.page.nextCursor;
        setRooms(nextRooms);
        setRoomsHasNextPage(result.page.hasNextPage);
        setRoomsError("");
        setRoomsStatus("ready");
      } catch (caught) {
        setRoomsError(
          caught instanceof Error
            ? caught.message
            : "대화방 목록을 불러오지 못했습니다.",
        );
        setRoomsStatus((current) => (current === "loading" ? "error" : current));
      } finally {
        roomRequestRef.current = false;
        setIsRefreshingRooms(false);
        setIsLoadingMoreRooms(false);
      }
    },
    [router],
  );

  useEffect(() => {
    void loadRooms("initial");
    const refreshOnFocus = () => void loadRooms("focus");
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [loadRooms]);

  useEffect(() => {
    if (
      selectedRoomId &&
      roomsStatus === "ready" &&
      !roomsHasNextPage &&
      !rooms.some(({ id }) => id === selectedRoomId)
    ) {
      setSelectedRoomId(null);
      setMobileView("rooms");
      setAnnouncement("더 이상 참여할 수 없는 대화방입니다.");
    }
  }, [rooms, roomsHasNextPage, roomsStatus, selectedRoomId]);

  const markRoomRead = useCallback(
    async (roomId: string, newestMessageId?: string) => {
      if (readRequestRef.current.has(roomId)) return;
      readRequestRef.current.add(roomId);
      try {
        const response = await fetch(
          `/api/chat/rooms/${encodeURIComponent(roomId)}/read`,
          {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          },
        );
        if (response.status === 401) {
          loginAgain(router);
          return;
        }
        if (!response.ok) throw await apiError(response);
        const result = (await response.json()) as { lastReadAt?: unknown };
        if (typeof result.lastReadAt === "string") {
          setRooms((current) =>
            current.map((room) =>
              room.id === roomId
                ? { ...room, lastReadAt: result.lastReadAt as string }
                : room,
            ),
          );
        }
        if (newestMessageId) {
          lastMarkedMessageRef.current.set(roomId, newestMessageId);
        }
      } catch (caught) {
        if (newestMessageId) lastMarkedMessageRef.current.delete(roomId);
        if (caught instanceof ChatRequestError && caught.status === 403) {
          setMessagesByRoom((current) => ({
            ...current,
            [roomId]: {
              ...(current[roomId] ?? EMPTY_MESSAGES),
              error: caught.message,
              status: "forbidden",
            },
          }));
          void loadRooms("focus");
        }
      } finally {
        readRequestRef.current.delete(roomId);
      }
    },
    [loadRooms, router],
  );

  const loadMessages = useCallback(
    async (
      roomId: string,
      mode: "initial" | "poll" | "manual" | "older",
    ) => {
      const requestKind = mode === "older" ? "older" : "latest";
      const requestKey = `${roomId}:${requestKind}`;
      if (messageRequestRef.current.has(requestKey)) return;

      const currentState = messagesRef.current[roomId] ?? EMPTY_MESSAGES;
      if (mode === "older" && !currentState.nextCursor) return;
      messageRequestRef.current.add(requestKey);

      if (mode === "older" && messageLogRef.current) {
        olderScrollAnchorRef.current = {
          height: messageLogRef.current.scrollHeight,
          roomId,
        };
      }
      if (mode === "initial" && !currentState.loaded) {
        setMessagesByRoom((current) => ({
          ...current,
          [roomId]: {
            ...(current[roomId] ?? EMPTY_MESSAGES),
            error: "",
            status: "loading",
          },
        }));
      }

      try {
        const fullReconcileDue =
          Date.now() - (lastFullSyncAtRef.current.get(roomId) ?? 0) >=
          CHAT_FULL_RECONCILE_INTERVAL_MS;
        const after =
          mode === "poll" && !fullReconcileDue
            ? currentState.nextAfter
            : null;
        const isDeltaRequest = mode === "poll" && Boolean(after);

        const fetchPage = async (params: URLSearchParams) => {
          const response = await fetch(
            `/api/chat/rooms/${encodeURIComponent(roomId)}/messages?${params}`,
            { credentials: "same-origin", cache: "no-store" },
          );
          if (response.status === 401) {
            loginAgain(router);
            throw new ChatRequestError("로그인이 필요합니다.", 401);
          }
          if (!response.ok) throw await apiError(response);
          const page = (await response.json()) as MessagePage;
          if (
            !Array.isArray(page.data) ||
            !page.page ||
            typeof page.page.hasNextPage !== "boolean" ||
            !(page.page.nextCursor === null ||
              typeof page.page.nextCursor === "string") ||
            !(page.page.nextAfter === null ||
              typeof page.page.nextAfter === "string")
          ) {
            throw new Error("메시지 목록 형식이 올바르지 않습니다.");
          }
          const requestedAfter = params.get("after");
          const requestedCursor = params.get("cursor");
          if (
            (requestedAfter &&
              (!page.page.nextAfter || page.page.nextCursor !== null)) ||
            (requestedAfter &&
              page.page.nextAfter === requestedAfter &&
              (page.data.length > 0 || page.page.hasNextPage)) ||
            (!requestedAfter &&
              page.page.hasNextPage &&
              !page.page.nextCursor) ||
            (!requestedAfter && !requestedCursor && !page.page.nextAfter)
          ) {
            throw new Error("메시지 목록 위치 형식이 올바르지 않습니다.");
          }
          return page;
        };

        const params = new URLSearchParams({ limit: "50" });
        if (mode === "older" && currentState.nextCursor) {
          params.set("cursor", currentState.nextCursor);
        } else if (after) {
          params.set("after", after);
        }
        let result = await fetchPage(params);
        let loadedMessages = result.data;

        if (isDeltaRequest) {
          const seenAfter = new Set([after!]);
          for (
            let pageCount = 1;
            result.page.hasNextPage && pageCount < CHAT_MAX_DELTA_PAGES;
            pageCount += 1
          ) {
            const nextAfter = result.page.nextAfter;
            if (!nextAfter || seenAfter.has(nextAfter)) {
              throw new Error("새 메시지 목록 위치가 갱신되지 않았습니다.");
            }
            seenAfter.add(nextAfter);
            result = await fetchPage(
              new URLSearchParams({ limit: "50", after: nextAfter }),
            );
            loadedMessages = mergeChatMessages(
              loadedMessages,
              result.data,
            );
          }
        }

        setMessagesByRoom((current) => {
          const previous = current[roomId] ?? EMPTY_MESSAGES;
          const shouldUsePageCursor = !isDeltaRequest;
          return {
            ...current,
            [roomId]: {
              error: "",
              hasNextPage: shouldUsePageCursor
                ? result.page.hasNextPage
                : previous.hasNextPage,
              items:
                mode === "older" || isDeltaRequest
                  ? mergeChatMessages(previous.items, loadedMessages)
                  : reconcileLatestChatMessages(
                      previous.items,
                      loadedMessages,
                    ),
              loaded: true,
              nextCursor: shouldUsePageCursor
                ? result.page.nextCursor
                : previous.nextCursor,
              nextAfter:
                mode === "older"
                  ? previous.nextAfter
                  : (result.page.nextAfter ?? previous.nextAfter),
              status: "ready",
            },
          };
        });

        if (!isDeltaRequest && mode !== "older") {
          lastFullSyncAtRef.current.set(roomId, Date.now());
        }

        const newest = newestMessage(loadedMessages);
        if (
          mode !== "older" &&
          newest &&
          selectedRoomIdRef.current === roomId &&
          document.visibilityState === "visible" &&
          lastMarkedMessageRef.current.get(roomId) !== newest.id
        ) {
          void markRoomRead(roomId, newest.id);
        }
      } catch (caught) {
        if (caught instanceof ChatRequestError && caught.status === 403) {
          setMessagesByRoom((current) => ({
            ...current,
            [roomId]: {
              ...(current[roomId] ?? EMPTY_MESSAGES),
              error: caught.message,
              hasNextPage: false,
              items: [],
              nextAfter: null,
              nextCursor: null,
              status: "forbidden",
            },
          }));
          lastFullSyncAtRef.current.delete(roomId);
          void loadRooms("focus");
          return;
        }
        setMessagesByRoom((current) => {
          const previous = current[roomId] ?? EMPTY_MESSAGES;
          return {
            ...current,
            [roomId]: {
              ...previous,
              error:
                caught instanceof Error
                  ? caught.message
                  : "메시지를 불러오지 못했습니다.",
              status: previous.loaded ? "ready" : "idle",
            },
          };
        });
      } finally {
        messageRequestRef.current.delete(requestKey);
      }
    },
    [loadRooms, markRoomRead, router],
  );

  useEffect(() => {
    if (!selectedRoomId) return;
    const state = messagesRef.current[selectedRoomId] ?? EMPTY_MESSAGES;
    if (!state.loaded && state.status !== "loading") {
      void loadMessages(selectedRoomId, "initial");
    }
  }, [loadMessages, selectedRoomId]);

  useEffect(() => {
    if (!selectedRoomId) return;
    const poll = () => {
      if (document.visibilityState === "visible") {
        void loadMessages(selectedRoomId, "poll");
      }
    };
    const interval = window.setInterval(poll, CHAT_POLL_INTERVAL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [loadMessages, selectedRoomId]);

  useEffect(() => {
    const messageLog = messageLogRef.current;
    if (!messageLog || !selectedRoomId) return;
    const anchor = olderScrollAnchorRef.current;
    if (anchor?.roomId === selectedRoomId) {
      messageLog.scrollTop += messageLog.scrollHeight - anchor.height;
      olderScrollAnchorRef.current = null;
      return;
    }
    if (autoScrollRef.current) messageLog.scrollTop = messageLog.scrollHeight;
  }, [selectedRoomId, selectedState.items.length]);

  function openRoom(room: ChatRoomRecord) {
    autoScrollRef.current = true;
    selectedRoomIdRef.current = room.id;
    setSelectedRoomId(room.id);
    setMobileView("messages");
    setDraft("");
    setDraftError("");
    const newestMessageId = room.lastMessage?.id;
    if (newestMessageId) {
      void markRoomRead(room.id, newestMessageId);
    } else {
      void markRoomRead(room.id);
    }
  }

  async function transmitMessage(message: ChatMessageRecord) {
    const clientMessageId = message.clientMessageId;
    if (!clientMessageId || sendRequestRef.current.has(clientMessageId)) return;
    sendRequestRef.current.add(clientMessageId);
    setMessagesByRoom((current) => {
      const previous = current[message.roomId] ?? EMPTY_MESSAGES;
      return {
        ...current,
        [message.roomId]: {
          ...previous,
          items: previous.items.map((item) =>
            item.clientMessageId === clientMessageId &&
            item.userId === message.userId
              ? { ...item, delivery: "pending", deliveryError: undefined }
              : item,
          ),
        },
      };
    });

    try {
      const response = await fetch(
        `/api/chat/rooms/${encodeURIComponent(message.roomId)}/messages`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMessageId,
            message: message.message,
          }),
        },
      );
      if (response.status === 401) {
        loginAgain(router);
        throw new ChatRequestError("로그인이 필요합니다.", 401);
      }
      if (!response.ok) throw await apiError(response);
      const delivered = (await response.json()) as ChatMessageRecord;
      setMessagesByRoom((current) => {
        const previous = current[message.roomId] ?? EMPTY_MESSAGES;
        return {
          ...current,
          [message.roomId]: {
            ...previous,
            items: mergeChatMessages(previous.items, [delivered]),
            loaded: true,
            status: "ready",
          },
        };
      });
      setRooms((current) =>
        current.map((room) =>
          room.id === message.roomId
            ? {
                ...room,
                activityAt: delivered.createdAt,
                lastMessage: {
                  id: delivered.id,
                  message: delivered.message,
                  type: delivered.type,
                  createdAt: delivered.createdAt,
                  sender: delivered.sender,
                },
                lastReadAt: delivered.createdAt,
              }
            : room,
        ).sort(
          (left, right) =>
            right.activityAt.localeCompare(left.activityAt) ||
            right.id.localeCompare(left.id),
        ),
      );
      lastMarkedMessageRef.current.set(message.roomId, delivered.id);
      setAnnouncement("메시지를 보냈습니다.");
    } catch (caught) {
      const errorMessage =
        caught instanceof Error
          ? caught.message
          : "메시지를 보내지 못했습니다.";
      setMessagesByRoom((current) => {
        const previous = current[message.roomId] ?? EMPTY_MESSAGES;
        return {
          ...current,
          [message.roomId]: {
            ...previous,
            items: previous.items.map((item) =>
              item.clientMessageId === clientMessageId &&
              item.userId === message.userId
                ? { ...item, delivery: "failed", deliveryError: errorMessage }
                : item,
            ),
            status:
              caught instanceof ChatRequestError && caught.status === 403
                ? "forbidden"
                : previous.status,
          },
        };
      });
      setAnnouncement(errorMessage);
      if (caught instanceof ChatRequestError && caught.status === 403) {
        void loadRooms("focus");
      }
    } finally {
      sendRequestRef.current.delete(clientMessageId);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitLockRef.current || !selectedRoom) return;
    const body = draft.trim();
    if (!body) {
      setDraftError("메시지를 입력해 주세요.");
      setAnnouncement("메시지를 입력해 주세요.");
      return;
    }
    if (body.length > 2_000) {
      setDraftError("메시지는 2,000자 이하로 입력해 주세요.");
      return;
    }

    let clientMessageId: string;
    try {
      clientMessageId = window.crypto.randomUUID();
    } catch {
      setDraftError("메시지 식별자를 만들지 못했습니다. 다시 시도해 주세요.");
      return;
    }

    const optimistic: ChatMessageRecord = {
      id: `optimistic:${clientMessageId}`,
      roomId: selectedRoom.id,
      userId: currentUser.id,
      clientMessageId,
      replyToId: null,
      type: "TEXT",
      message: body,
      createdAt: new Date().toISOString(),
      editedAt: null,
      sender: { id: currentUser.id, name: currentUser.name },
      attachments: [],
      delivery: "pending",
    };

    submitLockRef.current = true;
    autoScrollRef.current = true;
    setMessagesByRoom((current) => {
      const previous = current[selectedRoom.id] ?? EMPTY_MESSAGES;
      return {
        ...current,
        [selectedRoom.id]: {
          ...previous,
          items: mergeChatMessages(previous.items, [optimistic]),
          loaded: true,
          status: "ready",
        },
      };
    });
    setDraft("");
    setDraftError("");
    void transmitMessage(optimistic).finally(() => {
      submitLockRef.current = false;
    });
  }

  return (
    <section
      aria-label="모임 대화방"
      className="panel min-w-0 w-full overflow-hidden shadow-[var(--shadow)]"
    >
      <div className="grid min-h-[38rem] min-w-0 w-full lg:grid-cols-[21rem_minmax(0,1fr)]">
        <aside
          aria-label="참여 중인 대화방"
          className={`${mobileView === "messages" ? "hidden lg:flex" : "flex"} min-h-[38rem] min-w-0 w-full flex-col border-[var(--line)] lg:border-r`}
        >
          <div className="border-b border-[var(--line)] px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="m-0 text-base font-extrabold text-[var(--muted)]">
                  승인된 모임
                </p>
                <h2 className="mt-1 text-2xl font-black tracking-[-0.035em]">
                  내 대화방
                </h2>
              </div>
              <button
                aria-label="대화방 목록 새로고침"
                className="button-quiet size-12 shrink-0 p-0"
                disabled={isRefreshingRooms}
                onClick={() => void loadRooms("manual")}
                type="button"
              >
                {isRefreshingRooms ? (
                  <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                ) : (
                  <RefreshCw aria-hidden="true" className="size-5" />
                )}
              </button>
            </div>
            <p className="mt-3 text-sm font-bold text-[var(--muted)]" aria-live="polite">
              새 소식이 있는 대화방 {unreadRoomCount}개
            </p>
          </div>

          <div className="flex-1 divide-y divide-[var(--line)]">
            {roomsStatus === "ready" && roomsError ? (
              <div className="bg-red-50 p-4 text-center" role="alert">
                <p className="font-bold text-red-800">{roomsError}</p>
                <button className="mt-2 min-h-11 px-3 font-extrabold text-red-800 underline" onClick={() => void loadRooms("manual")} type="button">
                  다시 시도
                </button>
              </div>
            ) : null}

            {roomsStatus === "loading" ? (
              <div className="flex min-h-40 items-center justify-center gap-3 px-5" role="status">
                <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-[var(--primary)]" />
                <span className="font-bold text-[var(--muted)]">대화방을 불러오는 중</span>
              </div>
            ) : null}

            {roomsStatus === "error" ? (
              <div className="p-5 text-center">
                <CircleAlert aria-hidden="true" className="mx-auto size-7 text-[var(--danger)]" />
                <p className="mt-3 font-bold text-[var(--danger)]" role="alert">{roomsError}</p>
                <button className="button-secondary mt-4" onClick={() => void loadRooms("manual")} type="button">
                  다시 불러오기
                </button>
              </div>
            ) : null}

            {roomsStatus === "ready" && rooms.length === 0 ? (
              <div className="p-6 text-center">
                <MessageCircleMore aria-hidden="true" className="mx-auto size-9 text-[var(--muted)]" />
                <p className="mt-4 text-lg font-black">열린 대화방이 없습니다.</p>
                <p className="mt-2 leading-7 text-[var(--muted)]">
                  참가 승인이 완료되고 대화방 멤버로 등록되면 여기에 표시됩니다.
                </p>
              </div>
            ) : null}

            {rooms.map((room) => {
              const isSelected = room.id === selectedRoomId;
              const unread = isChatRoomUnread(room, currentUser.id);
              return (
                <button
                  aria-current={isSelected ? "true" : undefined}
                  className={`group flex min-w-0 w-full items-start gap-3 px-4 py-5 text-left transition-colors hover:bg-[var(--canvas)] ${
                    isSelected ? "bg-[var(--sky-soft)]" : "bg-transparent"
                  }`}
                  key={room.id}
                  onClick={() => openRoom(room)}
                  type="button"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 flex size-12 shrink-0 items-center justify-center rounded-2xl text-lg font-black text-white ${roomAccent(room.id)}`}
                  >
                    {room.event.club.title.slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start justify-between gap-2">
                      <span className="truncate font-black text-[var(--ink)]">
                        {room.event.club.title}
                      </span>
                      <span className="shrink-0 text-[0.82rem] font-bold text-[var(--muted)]">
                        {room.lastMessage
                          ? formatMessageTime(room.lastMessage.createdAt)
                          : ""}
                      </span>
                    </span>
                    <span className="mt-1 block truncate text-base font-bold text-[var(--muted)]">
                      {room.event.title}
                    </span>
                    <span className="mt-2 flex items-center justify-between gap-2">
                      <span className="truncate text-base text-[var(--muted)]">
                        {messageSummary(room.lastMessage)}
                      </span>
                      {unread ? (
                        <span className="size-3 shrink-0 rounded-full bg-[var(--accent)]">
                          <span className="screen-reader-only">새 메시지 있음</span>
                        </span>
                      ) : (
                        <ChevronRight aria-hidden="true" className="size-5 shrink-0 text-[var(--muted)]" />
                      )}
                    </span>
                  </span>
                </button>
              );
            })}

            {rooms.length > 0 && roomsHasNextPage ? (
              <div className="p-4 text-center">
                <button
                  className="button-secondary w-full"
                  disabled={isLoadingMoreRooms}
                  onClick={() => void loadRooms("more")}
                  type="button"
                >
                  {isLoadingMoreRooms ? (
                    <>
                      <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />
                      대화방 불러오는 중
                    </>
                  ) : (
                    "대화방 더 보기"
                  )}
                </button>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[var(--line)] bg-[var(--canvas)] px-5 py-4 text-base font-bold text-[var(--muted)]">
            <Info aria-hidden="true" className="mr-2 inline size-5 align-[-0.25rem]" />
            서버에서 참여 권한이 확인된 대화방만 표시됩니다.
          </div>
        </aside>

        <div
          className={`${mobileView === "rooms" ? "hidden lg:grid" : "grid"} min-h-[38rem] min-w-0 w-full grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--surface)]`}
        >
          {!selectedRoom ? (
            <div className="col-span-full row-span-full hidden min-h-[38rem] place-items-center px-6 text-center lg:grid">
              <div>
                <MessageCircleMore aria-hidden="true" className="mx-auto size-12 text-[var(--primary)]" />
                <h2 className="mt-5 text-2xl font-black">대화방을 선택해 주세요.</h2>
                <p className="mt-3 text-[17px] leading-7 text-[var(--muted)]">
                  방을 열 때만 메시지를 불러와 데이터 사용량을 줄입니다.
                </p>
              </div>
            </div>
          ) : (
            <>
              <header className="border-b border-[var(--line)] px-4 py-4 sm:px-6">
                <div className="flex items-start gap-3">
                  <button
                    aria-label="대화방 목록으로 돌아가기"
                    className="button-quiet -ml-1 size-13 shrink-0 p-0 lg:hidden"
                    onClick={() => setMobileView("rooms")}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" className="size-6" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="m-0 truncate text-base font-extrabold text-[var(--primary)]">
                      {selectedRoom.event.club.title}
                    </p>
                    <h2 className="mt-0.5 text-xl font-black leading-snug tracking-[-0.025em] sm:text-2xl">
                      {selectedRoom.event.title}
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base font-bold text-[var(--muted)]">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarDays aria-hidden="true" className="size-4" />
                        {formatDateTime(selectedRoom.event.startAt)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-4" />
                        {selectedRoom.event.locationName}
                      </span>
                    </div>
                  </div>
                  <button
                    aria-label="현재 대화방 새로고침"
                    className="button-quiet size-12 shrink-0 p-0"
                    onClick={() => void loadMessages(selectedRoom.id, "manual")}
                    type="button"
                  >
                    <RefreshCw aria-hidden="true" className="size-5" />
                  </button>
                </div>
              </header>

              <div
                aria-label={`${selectedRoom.event.title} 메시지`}
                aria-live="polite"
                aria-relevant="additions"
                className="max-h-[34rem] min-h-[24rem] min-w-0 w-full overflow-y-auto bg-[color-mix(in_srgb,var(--canvas)_46%,white)] px-4 py-6 sm:px-6"
                onScroll={(event) => {
                  const target = event.currentTarget;
                  autoScrollRef.current =
                    target.scrollHeight - target.scrollTop - target.clientHeight < 80;
                }}
                ref={messageLogRef}
                role="log"
              >
                <div className="mx-auto max-w-2xl">
                  {selectedState.hasNextPage ? (
                    <div className="mb-5 text-center">
                      <button
                        className="button-secondary"
                        onClick={() => void loadMessages(selectedRoom.id, "older")}
                        type="button"
                      >
                        이전 메시지 더 보기
                      </button>
                    </div>
                  ) : null}

                  {selectedState.status === "loading" ? (
                    <div className="flex min-h-40 items-center justify-center gap-3" role="status">
                      <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-[var(--primary)]" />
                      <span className="font-bold text-[var(--muted)]">메시지를 불러오는 중</span>
                    </div>
                  ) : null}

                  {selectedState.status === "forbidden" ? (
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center" role="alert">
                      <CircleAlert aria-hidden="true" className="mx-auto size-7 text-red-700" />
                      <p className="mt-3 font-bold text-red-800">
                        {selectedState.error || "이 대화방에 참여할 권한이 없습니다."}
                      </p>
                      <button className="button-secondary mt-4" onClick={() => setMobileView("rooms")} type="button">
                        대화방 목록으로 돌아가기
                      </button>
                    </div>
                  ) : null}

                  {selectedState.error && selectedState.status !== "forbidden" ? (
                    <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-center" role="alert">
                      <p className="font-bold text-red-800">{selectedState.error}</p>
                      <button className="button-secondary mt-3" onClick={() => void loadMessages(selectedRoom.id, "manual")} type="button">
                        다시 불러오기
                      </button>
                    </div>
                  ) : null}

                  {selectedState.loaded && selectedState.items.length === 0 ? (
                    <div className="py-14 text-center">
                      <MessageCircleMore aria-hidden="true" className="mx-auto size-9 text-[var(--muted)]" />
                      <p className="mt-4 text-lg font-black">아직 나눈 메시지가 없습니다.</p>
                      <p className="mt-2 text-[var(--muted)]">첫 인사를 건네 보세요.</p>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-5">
                    {selectedState.items.map((message) => {
                      const mine = message.userId === currentUser.id;
                      if (message.type === "NOTICE") {
                        return (
                          <div className="mx-auto max-w-xl rounded-2xl bg-[var(--canvas-deep)] px-4 py-3 text-center text-base font-bold text-[var(--muted)]" key={message.id}>
                            <MessageCircleMore aria-hidden="true" className="mr-1.5 inline size-4 align-[-0.2rem]" />
                            {messageBody(message)}
                          </div>
                        );
                      }
                      return (
                        <article className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`} key={message.id}>
                          {!mine ? (
                            <CircleUserRound aria-hidden="true" className="mb-1 size-9 shrink-0 text-[var(--primary)]" />
                          ) : null}
                          <div className={`max-w-[82%] ${mine ? "text-right" : "text-left"}`}>
                            <p className="mb-1 text-base font-extrabold text-[var(--muted)]">
                              {mine ? "나" : message.sender.name}
                            </p>
                            <div className={`rounded-2xl px-4 py-3 text-left font-semibold leading-relaxed ${
                              message.delivery === "failed"
                                ? "rounded-br-sm border-2 border-red-400 bg-red-50 text-[var(--ink)]"
                                : mine
                                  ? "rounded-br-sm bg-[var(--primary)] text-white"
                                  : "rounded-bl-sm border border-[var(--line)] bg-white text-[var(--ink)]"
                            } ${message.delivery === "pending" ? "opacity-70" : ""}`}>
                              {messageBody(message)}
                              {message.attachments.length > 0 ? (
                                <ul className="mt-3 grid list-none gap-2 p-0">
                                  {message.attachments.map((attachment) => (
                                    <li key={attachment.id}>
                                      {safeAttachmentUrl(attachment.url) ? (
                                        <a className="underline underline-offset-4" href={safeAttachmentUrl(attachment.url) ?? undefined} rel="noopener noreferrer" target="_blank">
                                          {attachment.fileName ?? (attachment.type === "IMAGE" ? "사진 열기" : "파일 열기")}
                                        </a>
                                      ) : (
                                        <span>{attachment.fileName ?? "첨부 파일"}</span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            <p className="mt-1 inline-flex items-center gap-1 text-[0.9rem] font-bold text-[var(--muted)]">
                              {message.delivery === "pending" ? (
                                <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                              ) : mine && message.delivery !== "failed" ? (
                                <CheckCheck aria-hidden="true" className="size-4" />
                              ) : null}
                              {formatMessageTime(message.createdAt)}
                            </p>
                            {message.delivery === "failed" ? (
                              <div className="mt-2 text-right">
                                <p className="text-sm font-bold text-red-700" role="alert">
                                  {message.deliveryError ?? "전송하지 못했습니다."}
                                </p>
                                <button className="mt-1 inline-flex min-h-11 items-center gap-1 rounded-lg px-2 font-extrabold text-red-700 underline" onClick={() => void transmitMessage(message)} type="button">
                                  <RotateCcw aria-hidden="true" className="size-4" />
                                  같은 메시지 다시 보내기
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>

              <form aria-label="메시지 보내기" className="border-t border-[var(--line)] bg-white p-3 sm:p-4" onSubmit={handleSubmit}>
                <label className="screen-reader-only" htmlFor="chat-message">보낼 메시지</label>
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <input
                      aria-describedby={draftError ? "chat-message-hint chat-message-error" : "chat-message-hint"}
                      aria-invalid={draftError ? "true" : undefined}
                      className="form-input min-h-14"
                      disabled={selectedState.status === "forbidden"}
                      id="chat-message"
                      maxLength={2_000}
                      onChange={(event) => {
                        const nextDraft = event.target.value;
                        setDraft(nextDraft);
                        if (nextDraft.trim()) {
                          setDraftError("");
                          setAnnouncement("");
                        }
                      }}
                      placeholder="메시지를 입력하세요"
                      value={draft}
                    />
                    <p className="screen-reader-only" id="chat-message-hint">
                      엔터를 누르거나 보내기 버튼을 누르면 전송됩니다. 최대 2,000자입니다.
                    </p>
                    {draftError ? (
                      <p className="mt-2 text-base font-extrabold text-[var(--danger)]" id="chat-message-error" role="alert">
                        {draftError}
                      </p>
                    ) : null}
                  </div>
                  <button className="button-primary shrink-0 px-4 sm:px-5" disabled={selectedState.status === "forbidden"} type="submit">
                    <Send aria-hidden="true" className="size-5" />
                    <span className="hidden sm:inline">보내기</span>
                    <span className="screen-reader-only sm:hidden">메시지 보내기</span>
                  </button>
                </div>
                <p aria-live="polite" className="screen-reader-only" role="status">
                  {announcement}
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
