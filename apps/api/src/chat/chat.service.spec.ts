import { describe, expect, it, vi } from "vitest";

import {
  ClubMemberRole,
  ClubMemberStatus,
  EventMemberStatus,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { ChatService } from "./chat.service";

const principal = {
  userId: "participant-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};

function encodeTestCursor(createdAt: string, id: string) {
  return Buffer.from(JSON.stringify({ createdAt, id }), "utf8").toString(
    "base64url",
  );
}

function decodeTestCursor(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
    createdAt: string;
    id: string;
  };
}

function encodeTestRoomCursor(activityAt: string, id: string) {
  return Buffer.from(JSON.stringify({ activityAt, id }), "utf8").toString(
    "base64url",
  );
}

function decodeTestRoomCursor(value: string) {
  return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
    activityAt: string;
    id: string;
  };
}

function chatRoomMembership(id: string, activityAt: string) {
  return {
    roomId: id,
    userId: principal.userId,
    joinedAt: new Date("2026-07-01T00:00:00.000Z"),
    mutedAt: null,
    lastReadAt: null,
    leftAt: null,
    room: {
      id,
      eventId: `event-${id}`,
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      updatedAt: new Date(activityAt),
      event: {
        id: `event-${id}`,
        title: `모임 ${id}`,
        startAt: new Date("2026-08-01T00:00:00.000Z"),
        locationName: "서울숲",
        club: { title: "산책 모임", slug: "walking" },
      },
      messages: [],
    },
  };
}

function chatMessage(id: string, createdAt: string) {
  return {
    id,
    roomId: "room-1",
    userId: "sender-1",
    clientMessageId: null,
    replyToId: null,
    type: "TEXT",
    message: `message ${id}`,
    createdAt: new Date(createdAt),
    editedAt: null,
    sender: { id: "sender-1", name: "보낸 사람", avatarUrl: null },
    attachments: [],
  };
}

function entitledRoomProjection() {
  return {
    members: [
      { userId: "participant-1", user: { role: UserRole.MEMBER } },
      { userId: "leader-1", user: { role: UserRole.LEADER } },
      { userId: "moderator-1", user: { role: UserRole.LEADER } },
      { userId: "admin-1", user: { role: UserRole.ADMIN } },
      { userId: "demoted-1", user: { role: UserRole.MEMBER } },
    ],
    event: {
      participants: [{ userId: "participant-1" }],
      club: {
        leaderId: "leader-1",
        leader: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
        members: [{ userId: "moderator-1" }],
      },
    },
  };
}

describe("ChatService membership entitlement", () => {
  it("computes participant and current operator access in one room projection", async () => {
    const findUnique = vi.fn().mockResolvedValue(entitledRoomProjection());
    const prisma = {
      chatRoom: { findUnique },
    } as unknown as PrismaService;

    const entitled = await new ChatService(prisma).entitledMemberIds("room-1");

    expect([...entitled].sort()).toEqual(
      ["participant-1", "leader-1", "moderator-1"].sort(),
    );
    expect(entitled.has("admin-1")).toBe(false);
    expect(entitled.has("demoted-1")).toBe(false);
    expect(findUnique).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "room-1" },
      select: {
        members: {
          where: { leftAt: null, user: { status: UserStatus.ACTIVE } },
          select: { userId: true, user: { select: { role: true } } },
        },
        event: {
          select: {
            participants: {
              where: { status: EventMemberStatus.APPROVED },
              select: { userId: true },
            },
            club: {
              select: {
                leaderId: true,
                leader: { select: { role: true, status: true } },
                members: {
                  where: {
                    status: ClubMemberStatus.ACTIVE,
                    role: {
                      in: [ClubMemberRole.LEADER, ClubMemberRole.MODERATOR],
                    },
                    user: {
                      role: UserRole.LEADER,
                      status: UserStatus.ACTIVE,
                    },
                  },
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });
  });

  it("rejects a stale operator even when the socket principal still says LEADER", async () => {
    const findUnique = vi.fn().mockResolvedValue(entitledRoomProjection());
    const prisma = {
      chatRoom: { findUnique },
    } as unknown as PrismaService;
    const stalePrincipal = {
      userId: "demoted-1",
      sessionId: "session-1",
      role: UserRole.LEADER,
    };

    await expect(
      new ChatService(prisma).assertMembership("room-1", stalePrincipal),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: { code: "CHAT_MEMBERSHIP_REQUIRED" } },
    });
    expect(findUnique).toHaveBeenCalledOnce();
  });

  it("filters room listings by current database-backed entitlement", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      userBlock: { findMany: vi.fn().mockResolvedValue([]) },
      chatRoomMember: { findMany },
    } as unknown as PrismaService;
    const principal = {
      userId: "operator-1",
      sessionId: "session-1",
      role: UserRole.LEADER,
    };

    const result = await new ChatService(prisma).rooms(
      { limit: 20 },
      principal,
    );

    expect(result).toEqual({
      data: [],
      page: { hasNextPage: false, nextCursor: null },
    });
    const where = findMany.mock.calls[0]![0].where;
    expect(where).toMatchObject({
      userId: principal.userId,
      leftAt: null,
      user: { status: UserStatus.ACTIVE },
    });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        {
          user: { role: UserRole.LEADER },
          room: {
            event: {
              OR: expect.arrayContaining([
                {
                  club: {
                    leaderId: principal.userId,
                    leader: {
                      role: UserRole.LEADER,
                      status: UserStatus.ACTIVE,
                    },
                  },
                },
              ]),
            },
          },
        },
      ]),
    );
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      orderBy: [{ room: { updatedAt: "desc" } }, { roomId: "desc" }],
      take: 21,
    });
  });
});

describe("ChatService room pagination", () => {
  it("orders rooms by stable activity and paginates beyond the former hard cap", async () => {
    const rows = [
      chatRoomMembership("room-3", "2026-07-30T03:00:00.000Z"),
      chatRoomMembership("room-2", "2026-07-30T02:00:00.000Z"),
      chatRoomMembership("room-1", "2026-07-30T01:00:00.000Z"),
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = {
      userBlock: {
        findMany: vi.fn().mockResolvedValue([
          { blockerId: principal.userId, blockedId: "blocked-user" },
        ]),
      },
      chatRoomMember: { findMany },
    } as unknown as PrismaService;

    const result = await new ChatService(prisma).rooms(
      { limit: 2 },
      principal,
    );

    expect(result.data.map(({ id }) => id)).toEqual(["room-3", "room-2"]);
    expect(result.data[0]).toMatchObject({
      id: "room-3",
      activityAt: "2026-07-30T03:00:00.000Z",
    });
    expect(result.page).toMatchObject({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });
    expect(decodeTestRoomCursor(result.page.nextCursor!)).toEqual({
      activityAt: "2026-07-30T02:00:00.000Z",
      id: "room-2",
    });
    const query = findMany.mock.calls[0]![0];
    expect(query).toMatchObject({
      orderBy: [{ room: { updatedAt: "desc" } }, { roomId: "desc" }],
      take: 3,
    });
    expect(query.include.room.include.messages.where).toEqual({
      deletedAt: null,
      userId: { notIn: ["blocked-user"] },
    });
  });

  it("applies an opaque activity cursor and rejects malformed room cursors early", async () => {
    const activityAt = "2026-07-30T02:00:00.000Z";
    const cursor = encodeTestRoomCursor(activityAt, "room-2");
    const blockFindMany = vi.fn().mockResolvedValue([]);
    const findMany = vi
      .fn()
      .mockResolvedValue([
        chatRoomMembership("room-1", "2026-07-30T01:00:00.000Z"),
      ]);
    const prisma = {
      userBlock: { findMany: blockFindMany },
      chatRoomMember: { findMany },
    } as unknown as PrismaService;
    const service = new ChatService(prisma);

    await expect(
      service.rooms({ limit: 20, cursor: "not-valid" }, principal),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_CURSOR" } },
    });
    expect(blockFindMany).not.toHaveBeenCalled();
    expect(findMany).not.toHaveBeenCalled();

    const result = await service.rooms({ limit: 20, cursor }, principal);
    expect(result.page).toEqual({ hasNextPage: false, nextCursor: null });
    expect(findMany.mock.calls[0]![0].where.AND).toEqual([
      {
        OR: [
          { room: { updatedAt: { lt: new Date(activityAt) } } },
          {
            room: { updatedAt: new Date(activityAt) },
            roomId: { lt: "room-2" },
          },
        ],
      },
    ]);
  });

  it("advances room activity only when the persisted message is newer", async () => {
    const persisted = chatMessage(
      "message-9",
      "2026-07-30T09:00:00.000Z",
    );
    const upsert = vi.fn().mockResolvedValue(persisted);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn(async (callback: (client: unknown) => unknown) =>
      callback({
        chatMessage: { upsert },
        chatRoom: { updateMany },
      }),
    );
    const service = new ChatService({
      $transaction: transaction,
    } as unknown as PrismaService);
    vi.spyOn(service, "assertMembership").mockResolvedValue(undefined);

    const result = await service.send(
      "room-1",
      { clientMessageId: "client-message-9", message: "새 메시지" },
      principal,
    );

    expect(result.id).toBe("message-9");
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "room-1",
        updatedAt: { lt: new Date("2026-07-30T09:00:00.000Z") },
      },
      data: { updatedAt: new Date("2026-07-30T09:00:00.000Z") },
    });
  });
});

describe("ChatService block relationships", () => {
  it("loads reciprocal block relationships in one bounded candidate query", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { blockerId: principal.userId, blockedId: "blocked-by-me" },
      { blockerId: "blocked-me", blockedId: principal.userId },
    ]);
    const service = new ChatService({
      userBlock: { findMany },
    } as unknown as PrismaService);

    const result = await service.blockedInteractionUserIds(principal.userId, [
      "blocked-by-me",
      "blocked-me",
      "blocked-me",
      principal.userId,
    ]);

    expect([...result].sort()).toEqual(["blocked-by-me", "blocked-me"].sort());
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          {
            blockerId: principal.userId,
            blockedId: { in: ["blocked-by-me", "blocked-me"] },
          },
          {
            blockedId: principal.userId,
            blockerId: { in: ["blocked-by-me", "blocked-me"] },
          },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
  });
});

describe("ChatService message pagination", () => {
  it("keeps the default feed newest-first and returns both pagination edges", async () => {
    const rows = [
      {
        ...chatMessage("message-3", "2026-07-30T03:00:00.000Z"),
        deletedAt: null,
        attachments: [
          {
            id: "attachment-1",
            type: "FILE",
            url: "https://cdn.seniorclub.test/chat/file.pdf",
            fileName: "안내.pdf",
            mimeType: "application/pdf",
            sizeBytes: 512,
            messageId: "message-3",
            createdAt: new Date("2026-07-30T03:00:00.000Z"),
          },
        ],
      },
      chatMessage("message-2", "2026-07-30T02:00:00.000Z"),
      chatMessage("message-1", "2026-07-30T01:00:00.000Z"),
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = {
      userBlock: { findMany: vi.fn().mockResolvedValue([]) },
      chatMessage: { findMany },
    } as unknown as PrismaService;
    const service = new ChatService(prisma);
    vi.spyOn(service, "assertMembership").mockResolvedValue(undefined);

    const result = await service.messages("room-1", { limit: 2 }, principal);

    expect(result.data.map(({ id }) => id)).toEqual(["message-3", "message-2"]);
    expect(Object.keys(result.data[0]!).sort()).toEqual(
      [
        "attachments",
        "clientMessageId",
        "createdAt",
        "editedAt",
        "id",
        "message",
        "replyToId",
        "roomId",
        "sender",
        "type",
        "userId",
      ].sort(),
    );
    expect(result.data[0]!.attachments).toEqual([
      {
        id: "attachment-1",
        type: "FILE",
        url: "https://cdn.seniorclub.test/chat/file.pdf",
        fileName: "안내.pdf",
        mimeType: "application/pdf",
        sizeBytes: 512,
      },
    ]);
    expect(result.page).toMatchObject({
      hasNextPage: true,
      nextCursor: expect.any(String),
      nextAfter: expect.any(String),
    });
    expect(decodeTestCursor(result.page.nextCursor!)).toEqual({
      createdAt: "2026-07-30T02:00:00.000Z",
      id: "message-2",
    });
    expect(decodeTestCursor(result.page.nextAfter!)).toEqual({
      createdAt: "2026-07-30T03:00:00.000Z",
      id: "message-3",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { roomId: "room-1", deletedAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 3,
      }),
    );
  });

  it("loads forward deltas oldest-first without weakening deletion or block filters", async () => {
    const boundaryTime = "2026-07-30T01:00:00.000Z";
    const after = encodeTestCursor(boundaryTime, "message-1");
    const rows = [
      chatMessage("message-2", boundaryTime),
      chatMessage("message-3", "2026-07-30T02:00:00.000Z"),
      chatMessage("message-4", "2026-07-30T03:00:00.000Z"),
    ];
    const findMany = vi.fn().mockResolvedValue(rows);
    const prisma = {
      userBlock: {
        findMany: vi.fn().mockResolvedValue([
          { blockerId: principal.userId, blockedId: "blocked-user" },
        ]),
      },
      chatMessage: { findMany },
    } as unknown as PrismaService;
    const service = new ChatService(prisma);
    vi.spyOn(service, "assertMembership").mockResolvedValue(undefined);

    const result = await service.messages(
      "room-1",
      { limit: 2, after },
      principal,
    );

    expect(result.data.map(({ id }) => id)).toEqual(["message-2", "message-3"]);
    expect(result.page).toMatchObject({
      hasNextPage: true,
      nextCursor: null,
      nextAfter: expect.any(String),
    });
    expect(decodeTestCursor(result.page.nextAfter!)).toEqual({
      createdAt: "2026-07-30T02:00:00.000Z",
      id: "message-3",
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          roomId: "room-1",
          deletedAt: null,
          userId: { notIn: ["blocked-user"] },
          OR: [
            { createdAt: { gt: new Date(boundaryTime) } },
            {
              createdAt: new Date(boundaryTime),
              id: { gt: "message-1" },
            },
          ],
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 3,
      }),
    );
  });

  it("keeps older cursors descending and does not regress the forward watermark", async () => {
    const boundaryTime = "2026-07-30T02:00:00.000Z";
    const cursor = encodeTestCursor(boundaryTime, "message-2");
    const findMany = vi
      .fn()
      .mockResolvedValue([
        chatMessage("message-1", "2026-07-30T01:00:00.000Z"),
      ]);
    const prisma = {
      userBlock: { findMany: vi.fn().mockResolvedValue([]) },
      chatMessage: { findMany },
    } as unknown as PrismaService;
    const service = new ChatService(prisma);
    vi.spyOn(service, "assertMembership").mockResolvedValue(undefined);

    const result = await service.messages(
      "room-1",
      { limit: 2, cursor },
      principal,
    );

    expect(result.page).toEqual({
      hasNextPage: false,
      nextCursor: null,
      nextAfter: null,
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          roomId: "room-1",
          deletedAt: null,
          OR: [
            { createdAt: { lt: new Date(boundaryTime) } },
            {
              createdAt: new Date(boundaryTime),
              id: { lt: "message-2" },
            },
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("returns a race-safe empty-room watermark and echoes an idle after cursor", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      userBlock: { findMany: vi.fn().mockResolvedValue([]) },
      chatMessage: { findMany },
    } as unknown as PrismaService;
    const service = new ChatService(prisma);
    vi.spyOn(service, "assertMembership").mockResolvedValue(undefined);

    const initial = await service.messages("room-1", { limit: 50 }, principal);
    expect(initial.page).toMatchObject({
      hasNextPage: false,
      nextCursor: null,
      nextAfter: expect.any(String),
    });
    expect(decodeTestCursor(initial.page.nextAfter!)).toEqual({
      createdAt: "1970-01-01T00:00:00.000Z",
      id: "",
    });

    const delta = await service.messages(
      "room-1",
      { limit: 50, after: initial.page.nextAfter! },
      principal,
    );
    expect(delta.page).toEqual({
      hasNextPage: false,
      nextCursor: null,
      nextAfter: initial.page.nextAfter,
    });
    expect(findMany.mock.calls[1]![0].where.OR).toEqual([
      { createdAt: { gt: new Date("1970-01-01T00:00:00.000Z") } },
      {
        createdAt: new Date("1970-01-01T00:00:00.000Z"),
        id: { gt: "" },
      },
    ]);
  });

  it("rejects malformed or ambiguous cursors before reading messages", async () => {
    const blockFindMany = vi.fn();
    const messageFindMany = vi.fn();
    const prisma = {
      userBlock: { findMany: blockFindMany },
      chatMessage: { findMany: messageFindMany },
    } as unknown as PrismaService;
    const service = new ChatService(prisma);
    vi.spyOn(service, "assertMembership").mockResolvedValue(undefined);

    await expect(
      service.messages("room-1", { limit: 50, after: "not-valid" }, principal),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_CURSOR" } },
    });
    await expect(
      service.messages(
        "room-1",
        {
          limit: 50,
          cursor: encodeTestCursor("2026-07-30T01:00:00.000Z", "message-1"),
          after: encodeTestCursor("2026-07-30T02:00:00.000Z", "message-2"),
        },
        principal,
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_CURSOR" } },
    });
    expect(blockFindMany).not.toHaveBeenCalled();
    expect(messageFindMany).not.toHaveBeenCalled();
  });
});
