import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import {
  ClubMemberRole,
  ClubMemberStatus,
  EventMemberStatus,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ChatMessageListQuery,
  ChatRoomListQuery,
  SendChatMessageInput,
} from "./chat.contracts";

type Cursor = { createdAt: string; id: string };
type RoomCursor = { activityAt: string; id: string };

const EMPTY_AFTER_WATERMARK: Cursor = {
  createdAt: "1970-01-01T00:00:00.000Z",
  id: "",
};
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

const membershipEntitlementFilter = (userId: string) => ({
  user: { status: UserStatus.ACTIVE },
  OR: [
    {
      room: {
        event: {
          participants: {
            some: { userId, status: EventMemberStatus.APPROVED },
          },
        },
      },
    },
    {
      user: { role: UserRole.LEADER },
      room: {
        event: {
          OR: [
            {
              club: {
                leaderId: userId,
                leader: {
                  role: UserRole.LEADER,
                  status: UserStatus.ACTIVE,
                },
              },
            },
            {
              club: {
                members: {
                  some: {
                    userId,
                    status: ClubMemberStatus.ACTIVE,
                    role: {
                      in: [
                        ClubMemberRole.LEADER,
                        ClubMemberRole.MODERATOR,
                      ],
                    },
                    user: {
                      role: UserRole.LEADER,
                      status: UserStatus.ACTIVE,
                    },
                  },
                },
              },
            },
          ],
        },
      },
    },
  ],
});

const activeOperatorMembershipFilter = {
  status: ClubMemberStatus.ACTIVE,
  role: { in: [ClubMemberRole.LEADER, ClubMemberRole.MODERATOR] },
  user: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
};

function encodeCursor(value: Cursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(
  value: string | undefined,
  options: { allowEmptyWatermark?: boolean } = {},
): Cursor | null {
  if (!value) return null;
  try {
    if (!BASE64URL_PATTERN.test(value)) return null;
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    const parsed = JSON.parse(decoded.toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      !("createdAt" in parsed) ||
      !("id" in parsed)
    ) return null;
    const createdAt = parsed.createdAt;
    const id = parsed.id;
    if (
      typeof createdAt !== "string" ||
      !Number.isFinite(Date.parse(createdAt)) ||
      new Date(createdAt).toISOString() !== createdAt ||
      typeof id !== "string" ||
      id.length > 128 ||
      (id.length === 0 &&
        !(
          options.allowEmptyWatermark &&
          createdAt === EMPTY_AFTER_WATERMARK.createdAt
        ))
    ) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeRoomCursor(value: RoomCursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeRoomCursor(value: string | undefined): RoomCursor | null {
  if (!value) return null;
  try {
    if (!BASE64URL_PATTERN.test(value)) return null;
    const decoded = Buffer.from(value, "base64url");
    if (decoded.toString("base64url") !== value) return null;
    const parsed = JSON.parse(decoded.toString("utf8")) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      !("activityAt" in parsed) ||
      !("id" in parsed)
    ) return null;
    const activityAt = parsed.activityAt;
    const id = parsed.id;
    if (
      typeof activityAt !== "string" ||
      !Number.isFinite(Date.parse(activityAt)) ||
      new Date(activityAt).toISOString() !== activityAt ||
      typeof id !== "string" ||
      id.length < 1 ||
      id.length > 128
    ) return null;
    return { activityAt, id };
  } catch {
    return null;
  }
}

function invalidCursor(): never {
  throw new ApiException(
    HttpStatus.BAD_REQUEST,
    "INVALID_CURSOR",
    "채팅 목록 위치가 올바르지 않습니다.",
  );
}

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  async blockedInteractionUserIds(
    userId: string,
    candidateUserIds?: readonly string[],
  ) {
    const candidates = candidateUserIds
      ? [...new Set(candidateUserIds.filter((candidate) => candidate !== userId))]
      : null;
    if (candidates && candidates.length === 0) return new Set<string>();
    const blocks = await this.prisma.userBlock.findMany({
      where: {
        OR: [
          {
            blockerId: userId,
            ...(candidates ? { blockedId: { in: candidates } } : {}),
          },
          {
            blockedId: userId,
            ...(candidates ? { blockerId: { in: candidates } } : {}),
          },
        ],
      },
      select: { blockerId: true, blockedId: true },
    });
    return new Set(
      blocks.map((entry) =>
        entry.blockerId === userId ? entry.blockedId : entry.blockerId,
      ),
    );
  }

  async assertMembership(
    roomId: string,
    principal: AuthenticatedPrincipal,
  ) {
    const entitledMemberIds = await this.entitledMemberIds(roomId);
    if (!entitledMemberIds.has(principal.userId)) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "CHAT_MEMBERSHIP_REQUIRED",
        "승인된 참가자와 현재 운영진만 이 채팅방을 이용할 수 있습니다.",
      );
    }
  }

  async entitledMemberIds(roomId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
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
                  where: activeOperatorMembershipFilter,
                  select: { userId: true },
                },
              },
            },
          },
        },
      },
    });
    if (!room) return new Set<string>();

    const activeMembershipIds = new Set(
      room.members.map((member) => member.userId),
    );
    const entitledIds = new Set(
      room.event.participants.map((participant) => participant.userId),
    );
    if (
      room.event.club.leader.role === UserRole.LEADER &&
      room.event.club.leader.status === UserStatus.ACTIVE
    ) {
      entitledIds.add(room.event.club.leaderId);
    }
    for (const member of room.event.club.members) {
      entitledIds.add(member.userId);
    }
    return new Set(
      [...entitledIds].filter((userId) => activeMembershipIds.has(userId)),
    );
  }

  async rooms(
    query: ChatRoomListQuery,
    principal: AuthenticatedPrincipal,
  ) {
    const cursor = decodeRoomCursor(query.cursor);
    if (query.cursor && !cursor) invalidCursor();
    const blockedIds = await this.blockedInteractionUserIds(principal.userId);
    const rows = await this.prisma.chatRoomMember.findMany({
      where: {
        userId: principal.userId,
        leftAt: null,
        ...membershipEntitlementFilter(principal.userId),
        ...(cursor
          ? {
              AND: [
                {
                  OR: [
                    {
                      room: {
                        updatedAt: { lt: new Date(cursor.activityAt) },
                      },
                    },
                    {
                      room: { updatedAt: new Date(cursor.activityAt) },
                      roomId: { lt: cursor.id },
                    },
                  ],
                },
              ],
            }
          : {}),
      },
      orderBy: [{ room: { updatedAt: "desc" } }, { roomId: "desc" }],
      take: query.limit + 1,
      include: {
        room: {
          include: {
            event: {
              select: {
                id: true,
                title: true,
                startAt: true,
                locationName: true,
                club: { select: { title: true, slug: true } },
              },
            },
            messages: {
              where: {
                deletedAt: null,
                ...(blockedIds.size > 0
                  ? { userId: { notIn: [...blockedIds] } }
                  : {}),
              },
              orderBy: [{ createdAt: "desc" }, { id: "desc" }],
              take: 1,
              select: {
                id: true,
                message: true,
                type: true,
                createdAt: true,
                sender: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((entry) => ({
        id: entry.room.id,
        activityAt: entry.room.updatedAt.toISOString(),
        joinedAt: entry.joinedAt.toISOString(),
        mutedAt: entry.mutedAt?.toISOString() ?? null,
        lastReadAt: entry.lastReadAt?.toISOString() ?? null,
        event: {
          ...entry.room.event,
          startAt: entry.room.event.startAt.toISOString(),
        },
        lastMessage: entry.room.messages[0]
          ? {
              ...entry.room.messages[0],
              createdAt: entry.room.messages[0].createdAt.toISOString(),
            }
          : null,
      })),
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeRoomCursor({
                activityAt: last.room.updatedAt.toISOString(),
                id: last.room.id,
              })
            : null,
      },
    };
  }

  async messages(
    roomId: string,
    query: ChatMessageListQuery,
    principal: AuthenticatedPrincipal,
  ) {
    await this.assertMembership(roomId, principal);
    if (query.cursor && query.after) invalidCursor();
    const cursor = decodeCursor(query.cursor);
    const after = decodeCursor(query.after, { allowEmptyWatermark: true });
    if ((query.cursor && !cursor) || (query.after && !after)) invalidCursor();
    const isAfterQuery = query.after !== undefined;
    const boundary = after ?? cursor;
    const blockedIds = await this.blockedInteractionUserIds(principal.userId);
    const rows = await this.prisma.chatMessage.findMany({
      where: {
        roomId,
        deletedAt: null,
        ...(blockedIds.size > 0
          ? { userId: { notIn: [...blockedIds] } }
          : {}),
        ...(boundary
          ? {
              OR: [
                {
                  createdAt: {
                    [isAfterQuery ? "gt" : "lt"]: new Date(
                      boundary.createdAt,
                    ),
                  },
                },
                {
                  createdAt: new Date(boundary.createdAt),
                  id: { [isAfterQuery ? "gt" : "lt"]: boundary.id },
                },
              ],
            }
          : {}),
      },
      orderBy: [
        { createdAt: isAfterQuery ? "asc" : "desc" },
        { id: isAfterQuery ? "asc" : "desc" },
      ],
      take: query.limit + 1,
      include: {
        sender: { select: { id: true, name: true, avatarUrl: true } },
        attachments: {
          select: {
            id: true,
            type: true,
            url: true,
            fileName: true,
            mimeType: true,
            sizeBytes: true,
          },
        },
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const first = page.at(0);
    const last = page.at(-1);
    return {
      data: page.map((entry) => this.toMessage(entry)),
      page: {
        hasNextPage,
        nextCursor:
          !isAfterQuery && hasNextPage && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
        // `nextAfter` is a forward-only watermark. Older cursor pages do not
        // return one because doing so could move a client's watermark backwards.
        nextAfter: isAfterQuery
          ? last
            ? encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : query.after!
          : query.cursor
            ? null
            : first
              ? encodeCursor({
                  createdAt: first.createdAt.toISOString(),
                  id: first.id,
                })
              : encodeCursor(EMPTY_AFTER_WATERMARK),
      },
    };
  }

  async send(
    roomId: string,
    input: SendChatMessageInput,
    principal: AuthenticatedPrincipal,
  ) {
    await this.assertMembership(roomId, principal);
    if (input.replyToId) {
      const reply = await this.prisma.chatMessage.findFirst({
        where: { id: input.replyToId, roomId, deletedAt: null },
        select: { id: true },
      });
      if (!reply) {
        throw new ApiException(
          HttpStatus.BAD_REQUEST,
          "INVALID_REPLY_TARGET",
          "답장할 메시지를 찾을 수 없습니다.",
        );
      }
    }
    const message = await this.prisma.$transaction(async (transaction) => {
      const persisted = await transaction.chatMessage.upsert({
        where: {
          roomId_userId_clientMessageId: {
            roomId,
            userId: principal.userId,
            clientMessageId: input.clientMessageId,
          },
        },
        update: {},
        create: {
          roomId,
          userId: principal.userId,
          clientMessageId: input.clientMessageId,
          message: input.message,
          ...(input.replyToId ? { replyToId: input.replyToId } : {}),
        },
        include: {
          sender: { select: { id: true, name: true, avatarUrl: true } },
          attachments: {
            select: {
              id: true,
              type: true,
              url: true,
              fileName: true,
              mimeType: true,
              sizeBytes: true,
            },
          },
        },
      });
      await transaction.chatRoom.updateMany({
        where: { id: roomId, updatedAt: { lt: persisted.createdAt } },
        data: { updatedAt: persisted.createdAt },
      });
      return persisted;
    });
    return this.toMessage(message);
  }

  async markRead(roomId: string, principal: AuthenticatedPrincipal) {
    await this.assertMembership(roomId, principal);
    const now = new Date();
    await this.prisma.chatRoomMember.update({
      where: { roomId_userId: { roomId, userId: principal.userId } },
      data: { lastReadAt: now },
    });
    return { success: true as const, lastReadAt: now.toISOString() };
  }

  private toMessage(message: {
    id: string;
    roomId: string;
    userId: string;
    clientMessageId: string | null;
    replyToId: string | null;
    type: string;
    message: string | null;
    createdAt: Date;
    editedAt: Date | null;
    sender: { id: string; name: string; avatarUrl: string | null };
    attachments: Array<{
      id: string;
      type: string;
      url: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
    }>;
  }) {
    return {
      id: message.id,
      roomId: message.roomId,
      userId: message.userId,
      clientMessageId: message.clientMessageId,
      replyToId: message.replyToId,
      type: message.type,
      message: message.message,
      createdAt: message.createdAt.toISOString(),
      editedAt: message.editedAt?.toISOString() ?? null,
      sender: {
        id: message.sender.id,
        name: message.sender.name,
        avatarUrl: message.sender.avatarUrl,
      },
      attachments: message.attachments.map((attachment) => ({
        id: attachment.id,
        type: attachment.type,
        url: attachment.url,
        fileName: attachment.fileName,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
      })),
    };
  }
}
