import { describe, expect, it } from "vitest";

import {
  isChatRoomUnread,
  mergeChatMessages,
  reconcileLatestChatMessages,
  type ChatMessageRecord,
  type ChatRoomRecord,
} from "@/components/chat-room";

function message(
  overrides: Partial<ChatMessageRecord> & Pick<ChatMessageRecord, "id">,
): ChatMessageRecord {
  const { id, ...rest } = overrides;
  return {
    id,
    roomId: "room-1",
    userId: "user-1",
    clientMessageId: null,
    replyToId: null,
    type: "TEXT",
    message: "안녕하세요",
    createdAt: "2026-07-30T01:00:00.000Z",
    editedAt: null,
    sender: { id: "user-1", name: "정희" },
    attachments: [],
    ...rest,
  };
}

describe("chat message reconciliation", () => {
  it("deduplicates overlapping cursor/poll pages and keeps chronological order", () => {
    const first = message({ id: "message-1" });
    const second = message({
      id: "message-2",
      createdAt: "2026-07-30T02:00:00.000Z",
    });

    expect(mergeChatMessages([second], [first, second]).map(({ id }) => id)).toEqual([
      "message-1",
      "message-2",
    ]);
  });

  it("replaces an optimistic failure with the idempotent server row by the same UUID", () => {
    const clientMessageId = "49e84d7e-7251-4f39-8410-7dbb444cf7f9";
    const optimistic = message({
      id: `optimistic:${clientMessageId}`,
      clientMessageId,
      delivery: "failed",
    });
    const delivered = message({
      id: "message-server",
      clientMessageId,
      delivery: undefined,
    });
    const otherUserCollision = message({
      id: "message-other-user",
      userId: "user-2",
      clientMessageId,
      createdAt: "2026-07-30T00:00:00.000Z",
      sender: { id: "user-2", name: "민수" },
    });

    expect(
      mergeChatMessages([optimistic, otherUserCollision], [delivered]),
    ).toEqual([otherUserCollision, delivered]);
    expect(delivered.clientMessageId).toBe(clientMessageId);
  });

  it("removes no-longer-visible server rows while preserving a retryable local row", () => {
    const removed = message({ id: "message-removed" });
    const latest = message({
      id: "message-latest",
      createdAt: "2026-07-30T02:00:00.000Z",
    });
    const failed = message({
      id: "optimistic:retry",
      clientMessageId: "retry-client-id",
      delivery: "failed",
    });

    expect(reconcileLatestChatMessages([removed, failed], [latest])).toEqual([
      failed,
      latest,
    ]);
  });
});

describe("chat room unread indicator", () => {
  const room = {
    id: "room-1",
    activityAt: "2026-07-30T02:00:00.000Z",
    joinedAt: "2026-07-29T01:00:00.000Z",
    mutedAt: null,
    lastReadAt: "2026-07-30T01:00:00.000Z",
    event: {
      id: "event-1",
      title: "서울 산책",
      startAt: "2026-08-01T01:00:00.000Z",
      locationName: "서울역",
      club: { title: "걷기 모임", slug: "walking" },
    },
    lastMessage: {
      id: "message-2",
      message: "곧 만나요",
      type: "TEXT",
      createdAt: "2026-07-30T02:00:00.000Z",
      sender: { id: "user-2", name: "민수" },
    },
  } satisfies ChatRoomRecord;

  it("uses lastReadAt without inventing an unread message count", () => {
    expect(isChatRoomUnread(room, "user-1")).toBe(true);
    expect(
      isChatRoomUnread(
        { ...room, lastReadAt: "2026-07-30T03:00:00.000Z" },
        "user-1",
      ),
    ).toBe(false);
    expect(isChatRoomUnread(room, "user-2")).toBe(false);
  });
});
