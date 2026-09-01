import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import { PrismaService } from "../prisma/prisma.service";
import type { NotificationListQuery } from "./notifications.contracts";

type Cursor = { createdAt: string; id: string };

function encodeCursor(value: Cursor) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1
    ) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: NotificationListQuery, principal: AuthenticatedPrincipal) {
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "알림 목록 위치가 올바르지 않습니다.",
      );
    }
    const rows = await this.prisma.notification.findMany({
      where: {
        recipientId: principal.userId,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: new Date(cursor.createdAt) } },
                { createdAt: new Date(cursor.createdAt), id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: {
        id: true,
        type: true,
        title: true,
        body: true,
        link: true,
        readAt: true,
        createdAt: true,
      },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((entry) => ({
        ...entry,
        readAt: entry.readAt?.toISOString() ?? null,
        createdAt: entry.createdAt.toISOString(),
      })),
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id })
            : null,
      },
    };
  }

  async markRead(id: string, principal: AuthenticatedPrincipal) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId: principal.userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      const exists = await this.prisma.notification.count({
        where: { id, recipientId: principal.userId },
      });
      if (exists === 0) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "NOTIFICATION_NOT_FOUND",
          "알림을 찾을 수 없습니다.",
        );
      }
    }
    return { success: true as const };
  }

  async unreadCount(principal: AuthenticatedPrincipal) {
    const unreadCount = await this.prisma.notification.count({
      where: { recipientId: principal.userId, readAt: null },
    });
    return { unreadCount };
  }

  async markAllRead(principal: AuthenticatedPrincipal) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: principal.userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { success: true as const, updatedCount: result.count };
  }
}
