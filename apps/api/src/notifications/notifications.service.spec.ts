import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { UserRole } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "./notifications.service";

const principal: AuthenticatedPrincipal = {
  userId: "user-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};

function notificationRow(id: string, createdAt: string, readAt: Date | null = null) {
  return {
    id,
    type: "APPLICATION_APPROVED",
    title: "참가가 승인됐어요",
    body: "모임 대화방이 열렸습니다.",
    link: "/events/event-1",
    readAt,
    createdAt: new Date(createdAt),
  };
}

function setup() {
  const notification = {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    count: vi.fn(),
  };
  const prisma = { notification } as unknown as PrismaService;
  return { notification, service: new NotificationsService(prisma) };
}

describe("NotificationsService", () => {
  it("returns a stable keyset page without loading the internal payload", async () => {
    const { notification, service } = setup();
    notification.findMany.mockResolvedValue([
      notificationRow("notification-3", "2026-07-30T03:00:00.000Z"),
      notificationRow("notification-2", "2026-07-30T02:00:00.000Z"),
      notificationRow("notification-1", "2026-07-30T01:00:00.000Z"),
    ]);

    const firstPage = await service.list({ limit: 2 }, principal);

    expect(firstPage.data).toHaveLength(2);
    expect(firstPage.page).toMatchObject({ hasNextPage: true });
    expect(firstPage.page.nextCursor).toEqual(expect.any(String));
    expect(firstPage.data[0]).toMatchObject({
      id: "notification-3",
      createdAt: "2026-07-30T03:00:00.000Z",
      readAt: null,
    });
    expect(notification.findMany).toHaveBeenCalledWith({
      where: { recipientId: principal.userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
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

    notification.findMany.mockResolvedValue([]);
    await service.list({ limit: 2, cursor: firstPage.page.nextCursor! }, principal);
    const cursorWhere = notification.findMany.mock.calls[1]![0].where;
    expect(cursorWhere).toEqual({
      recipientId: principal.userId,
      OR: [
        { createdAt: { lt: new Date("2026-07-30T02:00:00.000Z") } },
        {
          createdAt: new Date("2026-07-30T02:00:00.000Z"),
          id: { lt: "notification-2" },
        },
      ],
    });
  });

  it("rejects a malformed cursor before querying PostgreSQL", async () => {
    const { notification, service } = setup();

    await expect(
      service.list({ limit: 20, cursor: "not-a-valid-cursor" }, principal),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "INVALID_CURSOR" } },
    });
    expect(notification.findMany).not.toHaveBeenCalled();
  });

  it("marks an unread notification owned by the current user in one update", async () => {
    const { notification, service } = setup();
    notification.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.markRead("notification-1", principal)).resolves.toEqual({
      success: true,
    });
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: {
        id: "notification-1",
        recipientId: principal.userId,
        readAt: null,
      },
      data: { readAt: expect.any(Date) },
    });
    expect(notification.count).not.toHaveBeenCalled();
  });

  it("counts only the current user's unread notifications", async () => {
    const { notification, service } = setup();
    notification.count.mockResolvedValue(7);

    await expect(service.unreadCount(principal)).resolves.toEqual({ unreadCount: 7 });
    expect(notification.count).toHaveBeenCalledWith({
      where: { recipientId: principal.userId, readAt: null },
    });
  });

  it("keeps an already-read notification idempotent and hides foreign ids", async () => {
    const { notification, service } = setup();
    notification.updateMany.mockResolvedValue({ count: 0 });
    notification.count.mockResolvedValueOnce(1).mockResolvedValueOnce(0);

    await expect(service.markRead("notification-1", principal)).resolves.toEqual({
      success: true,
    });
    await expect(service.markRead("notification-foreign", principal)).rejects.toMatchObject({
      status: 404,
      response: { error: { code: "NOTIFICATION_NOT_FOUND" } },
    });
    expect(notification.count).toHaveBeenNthCalledWith(1, {
      where: { id: "notification-1", recipientId: principal.userId },
    });
    expect(notification.count).toHaveBeenNthCalledWith(2, {
      where: { id: "notification-foreign", recipientId: principal.userId },
    });
  });

  it("marks only the current user's unread notifications", async () => {
    const { notification, service } = setup();
    notification.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.markAllRead(principal)).resolves.toEqual({
      success: true,
      updatedCount: 4,
    });
    expect(notification.updateMany).toHaveBeenCalledWith({
      where: { recipientId: principal.userId, readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });
});
