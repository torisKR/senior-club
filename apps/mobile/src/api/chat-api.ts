import { ApiError } from '@/api/api-error';
import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';

export const CHAT_MESSAGE_PAGE_SIZE = 50;
export const CHAT_ROOM_PAGE_SIZE = 50;
export const CHAT_MESSAGE_MAX_LENGTH = 2_000;
export const CHAT_POLL_INTERVAL_MS = 20_000;
export const CHAT_FULL_RECONCILE_INTERVAL_MS = 5 * 60_000;
export const CHAT_MAX_DELTA_PAGES = 3;

export interface ApiChatSender {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface ApiChatAttachment {
  id: string;
  type: string;
  url: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface ApiChatMessage {
  id: string;
  roomId: string;
  userId: string;
  clientMessageId: string | null;
  replyToId: string | null;
  type: string;
  message: string | null;
  createdAt: string;
  editedAt: string | null;
  sender: ApiChatSender;
  attachments: ApiChatAttachment[];
  delivery?: 'pending' | 'failed';
  deliveryError?: string;
}

export interface ApiChatRoom {
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
    ApiChatMessage,
    'id' | 'message' | 'type' | 'createdAt' | 'sender'
  > | null;
}

export interface ApiChatRoomPage {
  data: ApiChatRoom[];
  page: { hasNextPage: boolean; nextCursor: string | null };
}

export interface ApiChatMessagePage {
  data: ApiChatMessage[];
  page: {
    hasNextPage: boolean;
    nextCursor: string | null;
    nextAfter: string | null;
  };
}

export interface SendChatMessageInput {
  clientMessageId: string;
  message: string;
}

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/;
const SAFE_CURSOR = /^[A-Za-z0-9_-]{8,500}$/;
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function invalidResponse(): never {
  throw new ApiError({
    status: 0,
    code: 'INVALID_RESPONSE',
    message: '채팅 서버 응답 형식이 올바르지 않습니다.',
  });
}

function parseSender(value: unknown): ApiChatSender {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'name', 'avatarUrl']) ||
    typeof value.id !== 'string' ||
    !SAFE_ID.test(value.id) ||
    typeof value.name !== 'string' ||
    !(
      value.avatarUrl === undefined ||
      value.avatarUrl === null ||
      typeof value.avatarUrl === 'string'
    )
  ) {
    invalidResponse();
  }
  return {
    id: value.id,
    name: value.name,
    ...(value.avatarUrl === undefined ? {} : { avatarUrl: value.avatarUrl }),
  };
}

function parseMessage(value: unknown, expectedRoomId?: string): ApiChatMessage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'roomId',
      'userId',
      'clientMessageId',
      'replyToId',
      'type',
      'message',
      'createdAt',
      'editedAt',
      'sender',
      'attachments',
    ]) ||
    typeof value.id !== 'string' ||
    !SAFE_ID.test(value.id) ||
    typeof value.roomId !== 'string' ||
    !SAFE_ID.test(value.roomId) ||
    (expectedRoomId !== undefined && value.roomId !== expectedRoomId) ||
    typeof value.userId !== 'string' ||
    !SAFE_ID.test(value.userId) ||
    !(
      value.clientMessageId === null ||
      (typeof value.clientMessageId === 'string' &&
        value.clientMessageId.length <= 100 &&
        SAFE_ID.test(value.clientMessageId))
    ) ||
    !(
      value.replyToId === null ||
      (typeof value.replyToId === 'string' && SAFE_ID.test(value.replyToId))
    ) ||
    typeof value.type !== 'string' ||
    !value.type ||
    value.type.length > 32 ||
    !(
      value.message === null ||
      (typeof value.message === 'string' &&
        value.message.length <= CHAT_MESSAGE_MAX_LENGTH)
    ) ||
    !isDateString(value.createdAt) ||
    !(value.editedAt === null || isDateString(value.editedAt)) ||
    !Array.isArray(value.attachments)
  ) {
    invalidResponse();
  }
  const attachments = value.attachments.map((attachment) => {
    if (
      !isRecord(attachment) ||
      !hasOnlyKeys(attachment, [
        'id',
        'type',
        'url',
        'fileName',
        'mimeType',
        'sizeBytes',
      ]) ||
      typeof attachment.id !== 'string' ||
      !SAFE_ID.test(attachment.id) ||
      typeof attachment.type !== 'string' ||
      typeof attachment.url !== 'string' ||
      !(attachment.fileName === null || typeof attachment.fileName === 'string') ||
      !(attachment.mimeType === null || typeof attachment.mimeType === 'string') ||
      !(
        attachment.sizeBytes === null ||
        (typeof attachment.sizeBytes === 'number' &&
          Number.isSafeInteger(attachment.sizeBytes) &&
          attachment.sizeBytes >= 0)
      )
    ) {
      invalidResponse();
    }
    return attachment as unknown as ApiChatAttachment;
  });
  return {
    id: value.id,
    roomId: value.roomId,
    userId: value.userId,
    clientMessageId: value.clientMessageId,
    replyToId: value.replyToId,
    type: value.type,
    message: value.message,
    createdAt: value.createdAt,
    editedAt: value.editedAt,
    sender: parseSender(value.sender),
    attachments,
  };
}

function parseLastMessage(value: unknown): ApiChatRoom['lastMessage'] {
  if (value === null) return null;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['id', 'message', 'type', 'createdAt', 'sender']) ||
    typeof value.id !== 'string' ||
    !SAFE_ID.test(value.id) ||
    !(value.message === null || typeof value.message === 'string') ||
    typeof value.type !== 'string' ||
    !isDateString(value.createdAt)
  ) {
    invalidResponse();
  }
  return {
    id: value.id,
    message: value.message,
    type: value.type,
    createdAt: value.createdAt,
    sender: parseSender(value.sender),
  };
}

function parseRoom(value: unknown): ApiChatRoom {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      'id',
      'activityAt',
      'joinedAt',
      'mutedAt',
      'lastReadAt',
      'event',
      'lastMessage',
    ]) ||
    typeof value.id !== 'string' ||
    !SAFE_ID.test(value.id) ||
    !isDateString(value.activityAt) ||
    !isDateString(value.joinedAt) ||
    !(value.mutedAt === null || isDateString(value.mutedAt)) ||
    !(value.lastReadAt === null || isDateString(value.lastReadAt)) ||
    !isRecord(value.event) ||
    !hasOnlyKeys(value.event, [
      'id',
      'title',
      'startAt',
      'locationName',
      'club',
    ]) ||
    typeof value.event.id !== 'string' ||
    !SAFE_ID.test(value.event.id) ||
    typeof value.event.title !== 'string' ||
    !isDateString(value.event.startAt) ||
    typeof value.event.locationName !== 'string' ||
    !isRecord(value.event.club) ||
    !hasOnlyKeys(value.event.club, ['title', 'slug']) ||
    typeof value.event.club.title !== 'string' ||
    typeof value.event.club.slug !== 'string'
  ) {
    invalidResponse();
  }
  return {
    id: value.id,
    activityAt: value.activityAt,
    joinedAt: value.joinedAt,
    mutedAt: value.mutedAt,
    lastReadAt: value.lastReadAt,
    event: {
      id: value.event.id,
      title: value.event.title,
      startAt: value.event.startAt,
      locationName: value.event.locationName,
      club: { title: value.event.club.title, slug: value.event.club.slug },
    },
    lastMessage: parseLastMessage(value.lastMessage),
  };
}

function parseRooms(value: unknown): ApiChatRoomPage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['data', 'page']) ||
    !Array.isArray(value.data) ||
    value.data.length > CHAT_ROOM_PAGE_SIZE ||
    !isRecord(value.page) ||
    !hasOnlyKeys(value.page, ['hasNextPage', 'nextCursor']) ||
    typeof value.page.hasNextPage !== 'boolean' ||
    !(
      value.page.nextCursor === null ||
      (typeof value.page.nextCursor === 'string' &&
        SAFE_CURSOR.test(value.page.nextCursor))
    ) ||
    value.page.hasNextPage !== Boolean(value.page.nextCursor) ||
    (value.page.hasNextPage && value.data.length === 0)
  ) {
    invalidResponse();
  }
  const rooms = value.data.map(parseRoom);
  if (new Set(rooms.map(({ id }) => id)).size !== rooms.length) invalidResponse();
  for (let index = 1; index < rooms.length; index += 1) {
    const previous = rooms[index - 1];
    const current = rooms[index];
    if (
      previous.activityAt < current.activityAt ||
      (previous.activityAt === current.activityAt && previous.id <= current.id)
    ) {
      invalidResponse();
    }
  }
  return {
    data: rooms,
    page: {
      hasNextPage: value.page.hasNextPage,
      nextCursor: value.page.nextCursor,
    },
  };
}

function parseMessagePage(
  value: unknown,
  expectedRoomId: string,
  direction: 'ascending' | 'descending',
): ApiChatMessagePage {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ['data', 'page']) ||
    !Array.isArray(value.data) ||
    value.data.length > CHAT_MESSAGE_PAGE_SIZE ||
    !isRecord(value.page) ||
    !hasOnlyKeys(value.page, ['hasNextPage', 'nextCursor', 'nextAfter']) ||
    typeof value.page.hasNextPage !== 'boolean' ||
    !(value.page.nextCursor === null || typeof value.page.nextCursor === 'string') ||
    !(value.page.nextAfter === null || typeof value.page.nextAfter === 'string') ||
    (typeof value.page.nextCursor === 'string' &&
      !SAFE_CURSOR.test(value.page.nextCursor)) ||
    (typeof value.page.nextAfter === 'string' &&
      !SAFE_CURSOR.test(value.page.nextAfter)) ||
    (value.page.hasNextPage && value.data.length === 0)
  ) {
    invalidResponse();
  }
  const messages = value.data.map((message) =>
    parseMessage(message, expectedRoomId),
  );
  if (new Set(messages.map(({ id }) => id)).size !== messages.length) {
    invalidResponse();
  }
  for (let index = 1; index < messages.length; index += 1) {
    const order = messageSort(messages[index - 1], messages[index]);
    if (
      (direction === 'ascending' && order > 0) ||
      (direction === 'descending' && order < 0)
    ) {
      invalidResponse();
    }
  }
  return {
    data: messages,
    page: {
      hasNextPage: value.page.hasNextPage,
      nextCursor: value.page.nextCursor,
      nextAfter: value.page.nextAfter,
    },
  };
}

function roomPath(roomId: string) {
  if (!SAFE_ID.test(roomId)) {
    throw new TypeError('채팅방 식별자가 올바르지 않습니다.');
  }
  return `/v1/chat/rooms/${roomId}`;
}

function messageListPath(
  roomId: string,
  options: { cursor?: string; after?: string },
) {
  const { cursor, after } = options;
  if (cursor && after) {
    throw new TypeError('이전 대화 위치와 새 대화 위치를 함께 보낼 수 없습니다.');
  }
  if (cursor !== undefined && !SAFE_CURSOR.test(cursor)) {
    throw new TypeError('채팅 목록 위치가 올바르지 않습니다.');
  }
  if (after !== undefined && !SAFE_CURSOR.test(after)) {
    throw new TypeError('새 채팅 목록 위치가 올바르지 않습니다.');
  }
  const params = new URLSearchParams({ limit: String(CHAT_MESSAGE_PAGE_SIZE) });
  if (cursor) params.set('cursor', cursor);
  if (after) params.set('after', after);
  return `${roomPath(roomId)}/messages?${params}`;
}

function normalizeSendInput(input: SendChatMessageInput): SendChatMessageInput {
  const message = input.message.trim();
  if (!UUID_V4.test(input.clientMessageId)) {
    throw new TypeError('메시지 요청 식별자가 올바르지 않습니다.');
  }
  if (!message || message.length > CHAT_MESSAGE_MAX_LENGTH) {
    throw new TypeError(
      `메시지는 1자 이상 ${CHAT_MESSAGE_MAX_LENGTH}자 이하여야 합니다.`,
    );
  }
  return { clientMessageId: input.clientMessageId, message };
}

function messageSort(left: ApiChatMessage, right: ApiChatMessage) {
  const timeDifference = Date.parse(left.createdAt) - Date.parse(right.createdAt);
  return timeDifference || left.id.localeCompare(right.id);
}

/** Merges cursor/poll pages and replaces an optimistic row by clientMessageId. */
export function mergeChatMessages(
  current: readonly ApiChatMessage[],
  incoming: readonly ApiChatMessage[],
) {
  const incomingClientKeys = new Set(
    incoming.flatMap(({ clientMessageId, userId }) =>
      clientMessageId ? [`${userId}\u0000${clientMessageId}`] : [],
    ),
  );
  const byId = new Map<string, ApiChatMessage>();
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

/**
 * Reconciles the newest server window without retaining messages the server no
 * longer exposes (for example, deleted or newly blocked messages). Local
 * pending/failed rows remain retryable until a matching server message arrives.
 */
export function reconcileLatestChatMessages(
  current: readonly ApiChatMessage[],
  incoming: readonly ApiChatMessage[],
  options: { hasNextPage: boolean; replace: boolean },
) {
  const localRows = current.filter(
    ({ delivery }) => delivery === 'pending' || delivery === 'failed',
  );
  if (options.replace || !options.hasNextPage || incoming.length === 0) {
    return mergeChatMessages(localRows, incoming);
  }

  const oldestIncoming = [...incoming].sort(messageSort)[0];
  const olderRows = current.filter(
    (message) =>
      message.delivery !== 'pending' &&
      message.delivery !== 'failed' &&
      messageSort(message, oldestIncoming) < 0,
  );
  return mergeChatMessages([...olderRows, ...localRows], incoming);
}

export function isChatRoomUnread(room: ApiChatRoom, currentUserId: string) {
  if (!room.lastMessage || room.lastMessage.sender.id === currentUserId) {
    return false;
  }
  if (!room.lastReadAt) return true;
  return Date.parse(room.lastMessage.createdAt) > Date.parse(room.lastReadAt);
}

export const chatApi = {
  async rooms(options: { cursor?: string; signal?: AbortSignal } = {}) {
    if (options.cursor !== undefined && !SAFE_CURSOR.test(options.cursor)) {
      throw new TypeError('대화방 목록 위치가 올바르지 않습니다.');
    }
    const params = new URLSearchParams({ limit: String(CHAT_ROOM_PAGE_SIZE) });
    if (options.cursor) params.set('cursor', options.cursor);
    const response = await getAuthenticatedHttpClient().requestJson<ApiChatRoomPage>(
      `/v1/chat/rooms?${params}`,
      { auth: 'required', signal: options.signal },
    );
    return parseRooms(response.body);
  },

  async messages(
    roomId: string,
    options: { cursor?: string; after?: string; signal?: AbortSignal } = {},
  ) {
    const response =
      await getAuthenticatedHttpClient().requestJson<ApiChatMessagePage>(
        messageListPath(roomId, options),
        { auth: 'required', signal: options.signal },
      );
    const page = parseMessagePage(
      response.body,
      roomId,
      options.after ? 'ascending' : 'descending',
    );
    if (
      (options.after && (!page.page.nextAfter || page.page.nextCursor)) ||
      (options.after &&
        page.page.nextAfter === options.after &&
        (page.data.length > 0 || page.page.hasNextPage)) ||
      (!options.after && page.page.hasNextPage && !page.page.nextCursor) ||
      (!options.cursor && !page.page.nextAfter)
    ) {
      invalidResponse();
    }
    return page;
  },

  async send(
    roomId: string,
    input: SendChatMessageInput,
    signal?: AbortSignal,
  ) {
    const response = await getAuthenticatedHttpClient().requestJson<ApiChatMessage>(
      `${roomPath(roomId)}/messages`,
      {
        method: 'POST',
        auth: 'required',
        json: normalizeSendInput(input),
        signal,
      },
    );
    return parseMessage(response.body, roomId);
  },

  async markRead(roomId: string, signal?: AbortSignal) {
    const response = await getAuthenticatedHttpClient().requestJson<{
      success: true;
      lastReadAt: string;
    }>(`${roomPath(roomId)}/read`, {
      method: 'PATCH',
      auth: 'required',
      signal,
    });
    const body = response.body;
    if (
      !isRecord(body) ||
      !hasOnlyKeys(body, ['success', 'lastReadAt']) ||
      body.success !== true ||
      !isDateString(body.lastReadAt)
    ) {
      invalidResponse();
    }
    return { success: true as const, lastReadAt: body.lastReadAt };
  },
};

/** Loads at most three incremental pages so a busy room catches up without an unbounded loop. */
export async function drainChatMessageDelta(
  roomId: string,
  after: string,
  signal?: AbortSignal,
): Promise<ApiChatMessagePage> {
  const seenAfter = new Set([after]);
  let page = await chatApi.messages(roomId, { after, signal });
  let data = page.data;

  for (
    let pageCount = 1;
    page.page.hasNextPage && pageCount < CHAT_MAX_DELTA_PAGES;
    pageCount += 1
  ) {
    const nextAfter = page.page.nextAfter;
    if (!nextAfter || seenAfter.has(nextAfter)) invalidResponse();
    seenAfter.add(nextAfter);
    page = await chatApi.messages(roomId, { after: nextAfter, signal });
    data = mergeChatMessages(data, page.data);
  }

  return { data, page: page.page };
}
