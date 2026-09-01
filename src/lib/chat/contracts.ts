import { ApiHttpError } from "@/lib/api";

const ROOM_RESOURCE_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CURSOR = /^[A-Za-z0-9_-]{8,500}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(code: string, message: string): never {
  throw new ApiHttpError(400, message, code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

export function validateChatRoomId(value: string) {
  if (!ROOM_RESOURCE_ID.test(value)) {
    invalid("INVALID_CHAT_ROOM_ID", "대화방 식별자가 올바르지 않습니다.");
  }
  return value;
}

export function parseChatRoomListQuery(url: string | URL) {
  const searchParams = new URL(url).searchParams;
  for (const key of searchParams.keys()) {
    if (key !== "limit" && key !== "cursor") {
      invalid("INVALID_CHAT_ROOM_QUERY", "지원하지 않는 대화방 목록 조건입니다.");
    }
  }
  if (
    searchParams.getAll("limit").length > 1 ||
    searchParams.getAll("cursor").length > 1
  ) {
    invalid("INVALID_CHAT_ROOM_QUERY", "대화방 목록 조건을 중복해서 보낼 수 없습니다.");
  }
  const rawLimit = searchParams.get("limit") ?? "50";
  if (!/^\d{1,2}$/.test(rawLimit)) {
    invalid("INVALID_CHAT_ROOM_LIMIT", "대화방 조회 개수가 올바르지 않습니다.");
  }
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 50) {
    invalid("INVALID_CHAT_ROOM_LIMIT", "대화방은 한 번에 1~50개 조회할 수 있습니다.");
  }
  const cursor = searchParams.get("cursor") ?? undefined;
  if (cursor !== undefined && !CURSOR.test(cursor)) {
    invalid("INVALID_CHAT_ROOM_CURSOR", "대화방 목록 위치가 올바르지 않습니다.");
  }
  return { limit, ...(cursor ? { cursor } : {}) };
}

export function chatRoomListEndpoint(query: { limit: number; cursor?: string }) {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) params.set("cursor", query.cursor);
  return `/v1/chat/rooms?${params}`;
}

export function parseChatMessageListQuery(url: string | URL) {
  const searchParams = new URL(url).searchParams;
  for (const key of searchParams.keys()) {
    if (key !== "limit" && key !== "cursor" && key !== "after") {
      invalid("INVALID_CHAT_QUERY", "지원하지 않는 채팅 목록 조건입니다.");
    }
  }
  if (
    searchParams.getAll("limit").length > 1 ||
    searchParams.getAll("cursor").length > 1 ||
    searchParams.getAll("after").length > 1
  ) {
    invalid("INVALID_CHAT_QUERY", "채팅 목록 조건을 중복해서 보낼 수 없습니다.");
  }

  const rawLimit = searchParams.get("limit") ?? "50";
  if (!/^\d{1,3}$/.test(rawLimit)) {
    invalid("INVALID_CHAT_LIMIT", "메시지 조회 개수가 올바르지 않습니다.");
  }
  const limit = Number(rawLimit);
  if (limit < 1 || limit > 100) {
    invalid("INVALID_CHAT_LIMIT", "메시지는 한 번에 1~100개 조회할 수 있습니다.");
  }

  const cursor = searchParams.get("cursor") ?? undefined;
  const after = searchParams.get("after") ?? undefined;
  if (cursor !== undefined && !CURSOR.test(cursor)) {
    invalid("INVALID_CHAT_CURSOR", "메시지 목록 위치가 올바르지 않습니다.");
  }
  if (after !== undefined && !CURSOR.test(after)) {
    invalid("INVALID_CHAT_AFTER", "새 메시지 목록 위치가 올바르지 않습니다.");
  }
  if (cursor && after) {
    invalid(
      "AMBIGUOUS_CHAT_CURSOR",
      "이전 메시지 위치와 새 메시지 위치를 함께 보낼 수 없습니다.",
    );
  }
  return {
    limit,
    ...(cursor ? { cursor } : {}),
    ...(after ? { after } : {}),
  };
}

export function chatMessageListEndpoint(
  roomId: string,
  query: { limit: number; cursor?: string; after?: string },
) {
  const params = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) params.set("cursor", query.cursor);
  if (query.after) params.set("after", query.after);
  return `/v1/chat/rooms/${encodeURIComponent(validateChatRoomId(roomId))}/messages?${params}`;
}

export type SendChatMessageBody = {
  clientMessageId: string;
  message: string;
  replyToId?: string;
};

export async function readChatJsonBody(request: Request) {
  try {
    return (await request.json()) as unknown;
  } catch {
    invalid("INVALID_JSON", "올바른 JSON 요청이 필요합니다.");
  }
}

export function parseSendChatMessageBody(value: unknown): SendChatMessageBody {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["clientMessageId", "message", "replyToId"])
  ) {
    invalid("INVALID_CHAT_MESSAGE", "메시지 요청 형식이 올바르지 않습니다.");
  }

  const clientMessageId = value.clientMessageId;
  const rawMessage = value.message;
  const replyToId = value.replyToId;
  if (typeof clientMessageId !== "string" || !UUID.test(clientMessageId)) {
    invalid("INVALID_CLIENT_MESSAGE_ID", "메시지 전송 식별자가 올바르지 않습니다.");
  }
  if (typeof rawMessage !== "string") {
    invalid("INVALID_CHAT_MESSAGE", "메시지 내용을 입력해 주세요.");
  }
  const message = rawMessage.trim();
  if (!message || message.length > 2_000) {
    invalid("INVALID_CHAT_MESSAGE", "메시지는 1~2,000자로 입력해 주세요.");
  }
  if (
    replyToId !== undefined &&
    (typeof replyToId !== "string" || !ROOM_RESOURCE_ID.test(replyToId))
  ) {
    invalid("INVALID_REPLY_TARGET", "답장할 메시지 식별자가 올바르지 않습니다.");
  }

  return {
    clientMessageId,
    message,
    ...(typeof replyToId === "string" ? { replyToId } : {}),
  };
}

export function parseEmptyJsonObject(value: unknown) {
  if (!isRecord(value) || Object.keys(value).length !== 0) {
    invalid("INVALID_CHAT_READ_REQUEST", "읽음 요청 형식이 올바르지 않습니다.");
  }
  return {};
}
