import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  ApprovalMode,
  AttendanceStatus,
  ClubMemberRole,
  ClubMemberStatus,
  EventMemberStatus,
  EventStatus,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { eventListQuerySchema } from "./events.contracts";
import { EventsService } from "./events.service";

function serviceWithEmptyCatalog() {
  const findMany = vi.fn().mockResolvedValue([]);
  const prisma = { event: { findMany } } as unknown as PrismaService;
  return { findMany, service: new EventsService(prisma) };
}

describe("EventsService public catalog views", () => {
  it("includes only non-draft future statuses in the default upcoming view", async () => {
    const { findMany, service } = serviceWithEmptyCatalog();
    await service.list(eventListQuerySchema.parse({}));

    const query = findMany.mock.calls[0]![0];
    expect(query.where.AND[0]).toMatchObject({
      status: {
        in: [
          EventStatus.PUBLISHED,
          EventStatus.CLOSED,
          EventStatus.CANCELED,
        ],
      },
      startAt: { gte: expect.any(Date) },
    });
    expect(query.orderBy).toEqual([{ startAt: "asc" }, { id: "asc" }]);
    expect(query).not.toHaveProperty("include");
    expect(query.select).toEqual({
      id: true,
      title: true,
      description: true,
      coverImageUrl: true,
      locationName: true,
      address: true,
      mapUrl: true,
      startAt: true,
      endAt: true,
      registrationDeadline: true,
      capacity: true,
      price: true,
      currency: true,
      difficulty: true,
      supplies: true,
      approvalMode: true,
      status: true,
      club: {
        select: {
          id: true,
          slug: true,
          title: true,
          region: true,
          interest: { select: { slug: true, name: true, icon: true } },
          leader: { select: { name: true } },
        },
      },
      _count: {
        select: {
          participants: {
            where: { status: EventMemberStatus.APPROVED },
          },
        },
      },
    });
  });

  it("does not expose management-only identifiers or timestamps", async () => {
    const row = {
      id: "event-1",
      clubId: "club-1",
      title: "북한산 둘레길 걷기",
      description: "천천히 걸으며 북한산 풍경을 함께 감상합니다.",
      coverImageUrl: null,
      locationName: "북한산 안내소",
      address: "서울특별시 은평구 진관동",
      mapUrl: null,
      startAt: new Date("2099-08-01T00:00:00.000Z"),
      endAt: null,
      registrationDeadline: null,
      capacity: 20,
      price: 0,
      currency: "KRW",
      difficulty: "EASY" as const,
      supplies: null,
      approvalMode: ApprovalMode.MANUAL,
      status: EventStatus.PUBLISHED,
      createdAt: new Date("2026-07-30T00:00:00.000Z"),
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
      club: {
        id: "club-1",
        slug: "slow-hiking",
        title: "천천히 걷는 산길",
        region: "서울특별시",
        interest: { slug: "hiking", name: "등산", icon: "mountain" },
        leader: { name: "김리더" },
      },
      _count: { participants: 0 },
    };
    const service = new EventsService({
      event: { findMany: vi.fn().mockResolvedValue([row]) },
    } as unknown as PrismaService);

    const result = await service.list(eventListQuerySchema.parse({}));

    expect(result.data[0]).not.toHaveProperty("clubId");
    expect(result.data[0]).not.toHaveProperty("createdAt");
    expect(result.data[0]).not.toHaveProperty("updatedAt");
  });

  it("orders the past view newest-first and moves its cursor backwards", async () => {
    const { findMany, service } = serviceWithEmptyCatalog();
    const cursor = Buffer.from(
      JSON.stringify({ startAt: "2026-07-01T00:00:00.000Z", id: "event-z" }),
      "utf8",
    ).toString("base64url");

    await service.list(eventListQuerySchema.parse({ view: "past", cursor }));

    const query = findMany.mock.calls[0]![0];
    expect(query.orderBy).toEqual([{ startAt: "desc" }, { id: "desc" }]);
    expect(query.where.AND[1]).toEqual({
      OR: [
        { startAt: { lt: new Date("2026-07-01T00:00:00.000Z") } },
        {
          startAt: new Date("2026-07-01T00:00:00.000Z"),
          id: { lt: "event-z" },
        },
      ],
    });
  });

  it("allows every public lifecycle status in all while excluding drafts", async () => {
    const { findMany, service } = serviceWithEmptyCatalog();
    await service.list(eventListQuerySchema.parse({ view: "all" }));

    const statuses = findMany.mock.calls[0]![0].where.AND[0].status.in;
    expect(statuses).toEqual([
      EventStatus.PUBLISHED,
      EventStatus.CLOSED,
      EventStatus.COMPLETED,
      EventStatus.CANCELED,
    ]);
    expect(statuses).not.toContain(EventStatus.DRAFT);
  });
});

describe("EventsService application cancellation", () => {
  it("locks the event before reading and returns a concurrently canceled application without side effects", async () => {
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.CANCELED,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: new Date("2026-07-29T01:00:00.000Z"),
      decidedAt: null,
      canceledAt: new Date("2026-07-30T01:00:00.000Z"),
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          status: EventStatus.PUBLISHED,
          startAt: new Date("2099-08-01T00:00:00.000Z"),
          club: {
            leaderId: "leader-1",
            leader: {
              role: UserRole.LEADER,
              status: UserStatus.ACTIVE,
            },
            members: [],
          },
        }),
      },
      eventMember: {
        findUnique: vi.fn().mockResolvedValue(application),
        update: vi.fn(),
      },
      eventMemberTransition: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new EventsService(prisma);

    await service.cancel(application.eventId, {
      userId: application.userId,
      sessionId: "session-1",
      role: UserRole.MEMBER,
    });

    expect(transaction.eventMember.findUnique).toHaveBeenCalledWith({
      where: {
        eventId_userId: {
          eventId: application.eventId,
          userId: application.userId,
        },
      },
    });
    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.eventMember.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.eventMemberTransition.create).not.toHaveBeenCalled();
  });

  it("uses the status read after the event lock as the cancellation transition source", async () => {
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.APPROVED,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: new Date("2026-07-29T01:00:00.000Z"),
      decidedAt: new Date("2026-07-30T00:30:00.000Z"),
      canceledAt: null,
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };
    const canceled = {
      ...application,
      status: EventMemberStatus.CANCELED,
      canceledAt: new Date("2026-07-30T02:00:00.000Z"),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          status: EventStatus.PUBLISHED,
          startAt: new Date("2099-08-01T00:00:00.000Z"),
          club: {
            leaderId: "leader-1",
            leader: {
              role: UserRole.LEADER,
              status: UserStatus.ACTIVE,
            },
            members: [],
          },
        }),
      },
      eventMember: {
        findUnique: vi.fn().mockResolvedValue(application),
        update: vi.fn().mockResolvedValue(canceled),
      },
      eventMemberTransition: { create: vi.fn().mockResolvedValue({}) },
      chatRoomMember: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new EventsService(prisma);

    await service.cancel(application.eventId, {
      userId: application.userId,
      sessionId: "session-1",
      role: UserRole.MEMBER,
    });

    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.eventMember.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(transaction.eventMemberTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventMemberId: application.id,
        fromStatus: EventMemberStatus.APPROVED,
        toStatus: EventMemberStatus.CANCELED,
      }),
    });
    const cancellationTime = transaction.eventMember.update.mock.calls[0]![0]
      .data.canceledAt;
    expect(transaction.chatRoomMember.updateMany).toHaveBeenCalledWith({
      where: {
        userId: application.userId,
        leftAt: null,
        room: { eventId: application.eventId },
      },
      data: { leftAt: cancellationTime },
    });
  });

  it.each([
    {
      label: "representative leader",
      club: {
        leaderId: "member-1",
        leader: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
        members: [] as Array<{ id: string }>,
      },
    },
    {
      label: "active moderator",
      club: {
        leaderId: "leader-1",
        leader: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
        members: [{ id: "operator-membership-1" }],
      },
    },
  ])("keeps chat membership when an approved participant cancels as a current $label", async ({ club }) => {
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.APPROVED,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: new Date("2026-07-29T01:00:00.000Z"),
      decidedAt: new Date("2026-07-30T00:30:00.000Z"),
      canceledAt: null,
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          status: EventStatus.PUBLISHED,
          startAt: new Date("2099-08-01T00:00:00.000Z"),
          club,
        }),
      },
      eventMember: {
        findUnique: vi.fn().mockResolvedValue(application),
        update: vi.fn().mockImplementation(({ data }) => ({
          ...application,
          ...data,
          updatedAt: new Date("2026-07-30T02:00:00.000Z"),
        })),
      },
      eventMemberTransition: { create: vi.fn().mockResolvedValue({}) },
      chatRoomMember: { updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const result = await new EventsService(prisma).cancel(
      application.eventId,
      {
        userId: application.userId,
        sessionId: "session-1",
        role: UserRole.LEADER,
      },
    );

    expect(result.status).toBe(EventMemberStatus.CANCELED);
    expect(transaction.chatRoomMember.updateMany).not.toHaveBeenCalled();
  });

  it("cancels a pending application without touching chat membership", async () => {
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.PENDING,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: new Date("2026-07-29T01:00:00.000Z"),
      decidedAt: null,
      canceledAt: null,
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          status: EventStatus.CLOSED,
          startAt: new Date("2099-08-01T00:00:00.000Z"),
        }),
      },
      eventMember: {
        findUnique: vi.fn().mockResolvedValue(application),
        update: vi.fn().mockImplementation(({ data }) => ({
          ...application,
          ...data,
          updatedAt: new Date("2026-07-30T02:00:00.000Z"),
        })),
      },
      eventMemberTransition: { create: vi.fn().mockResolvedValue({}) },
      chatRoomMember: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const result = await new EventsService(prisma).cancel(
      application.eventId,
      {
        userId: application.userId,
        sessionId: "session-1",
        role: UserRole.MEMBER,
      },
    );

    expect(result.status).toBe(EventMemberStatus.CANCELED);
    expect(transaction.eventMemberTransition.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        fromStatus: EventMemberStatus.PENDING,
        toStatus: EventMemberStatus.CANCELED,
      }),
    });
    expect(transaction.chatRoomMember.updateMany).not.toHaveBeenCalled();
  });

  it("rejects cancellation of a rejected application", async () => {
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.REJECTED,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: new Date("2026-07-29T01:00:00.000Z"),
      decidedAt: new Date("2026-07-30T00:30:00.000Z"),
      canceledAt: null,
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          status: EventStatus.PUBLISHED,
          startAt: new Date("2099-08-01T00:00:00.000Z"),
        }),
      },
      eventMember: {
        findUnique: vi.fn().mockResolvedValue(application),
        update: vi.fn(),
      },
      eventMemberTransition: { create: vi.fn() },
      chatRoomMember: { updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    await expect(
      new EventsService(prisma).cancel(application.eventId, {
        userId: application.userId,
        sessionId: "session-1",
        role: UserRole.MEMBER,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "INVALID_APPLICATION_STATE" } },
    });
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.eventMemberTransition.create).not.toHaveBeenCalled();
    expect(transaction.chatRoomMember.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "completed event",
      status: EventStatus.COMPLETED,
      startAt: new Date("2099-08-01T00:00:00.000Z"),
    },
    {
      label: "canceled event",
      status: EventStatus.CANCELED,
      startAt: new Date("2099-08-01T00:00:00.000Z"),
    },
    {
      label: "started event",
      status: EventStatus.PUBLISHED,
      startAt: new Date("2000-01-01T00:00:00.000Z"),
    },
  ])("rejects cancellation for a $label", async ({ status, startAt }) => {
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.APPROVED,
      attendance: AttendanceStatus.ATTENDED,
      appliedAt: new Date("2026-07-29T01:00:00.000Z"),
      decidedAt: new Date("2026-07-30T00:30:00.000Z"),
      canceledAt: null,
      updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: vi.fn().mockResolvedValue({ status, startAt }) },
      eventMember: {
        findUnique: vi.fn().mockResolvedValue(application),
        update: vi.fn(),
      },
      eventMemberTransition: { create: vi.fn() },
      chatRoomMember: { updateMany: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    await expect(
      new EventsService(prisma).cancel(application.eventId, {
        userId: application.userId,
        sessionId: "session-1",
        role: UserRole.MEMBER,
      }),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        error: { code: "APPLICATION_CANCELLATION_CLOSED" },
      },
    });
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.eventMemberTransition.create).not.toHaveBeenCalled();
    expect(transaction.chatRoomMember.updateMany).not.toHaveBeenCalled();
  });
});

describe("EventsService application profile gate", () => {
  it("rejects an incomplete profile before creating idempotency or application records", async () => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: "event-1",
          title: "북한산 둘레길 걷기",
          status: EventStatus.PUBLISHED,
          startAt: new Date("2099-08-01T01:00:00.000Z"),
          registrationDeadline: null,
          capacity: 12,
          approvalMode: ApprovalMode.MANUAL,
          club: { leaderId: "leader-1" },
        }),
      },
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          email: "member@example.com",
          onboardingCompletedAt: null,
        }),
      },
      idempotencyRecord: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      eventMember: {
        count: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;
    const service = new EventsService(prisma);

    await expect(
      service.apply(
        "event-1",
        {
          userId: "member-1",
          sessionId: "session-1",
          role: UserRole.MEMBER,
        },
        "profile-gate-application-key",
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        error: { code: "PROFILE_ONBOARDING_REQUIRED" },
      },
    });

    expect(transaction.user.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: "member-1" },
      select: { email: true, onboardingCompletedAt: true },
    });
    expect(transaction.idempotencyRecord.findUnique).not.toHaveBeenCalled();
    expect(transaction.idempotencyRecord.create).not.toHaveBeenCalled();
    expect(transaction.eventMember.count).not.toHaveBeenCalled();
    expect(transaction.eventMember.create).not.toHaveBeenCalled();
  });
});

describe("EventsService automatic approval chat membership", () => {
  it("joins the applicant, representative leader, and every active operator", async () => {
    const now = new Date("2026-07-30T01:00:00.000Z");
    const application = {
      id: "application-1",
      eventId: "event-1",
      userId: "member-1",
      status: EventMemberStatus.APPROVED,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: now,
      decidedAt: now,
      canceledAt: null,
      updatedAt: now,
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: {
        findUnique: vi.fn().mockResolvedValue({
          id: "event-1",
          title: "자동 승인 산책",
          status: EventStatus.PUBLISHED,
          startAt: new Date("2099-08-01T00:00:00.000Z"),
          registrationDeadline: null,
          capacity: 12,
          approvalMode: ApprovalMode.AUTO,
          club: {
            leaderId: "representative-leader",
            leader: {
              role: UserRole.LEADER,
              status: UserStatus.ACTIVE,
            },
            members: [
              { userId: "operator-1" },
              { userId: "moderator-1" },
            ],
          },
        }),
      },
      user: {
        findUniqueOrThrow: vi.fn().mockResolvedValue({
          email: "member@example.com",
          onboardingCompletedAt: now,
        }),
      },
      idempotencyRecord: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({}),
        update: vi.fn().mockResolvedValue({}),
      },
      eventMember: {
        count: vi.fn().mockResolvedValue(0),
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(application),
        update: vi.fn(),
      },
      eventMemberTransition: { create: vi.fn().mockResolvedValue({}) },
      chatRoom: {
        upsert: vi.fn().mockResolvedValue({ id: "chat-room-1" }),
      },
      chatRoomMember: { upsert: vi.fn().mockResolvedValue({}) },
      notification: {
        create: vi.fn().mockResolvedValue({ id: "notification-1" }),
      },
      outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
    };
    const prisma = {
      $transaction: vi.fn(
        async (
          callback: (tx: typeof transaction) => Promise<unknown>,
        ) => callback(transaction),
      ),
    } as unknown as PrismaService;

    const result = await new EventsService(prisma).apply(
      application.eventId,
      {
        userId: application.userId,
        sessionId: "session-1",
        role: UserRole.MEMBER,
      },
      "automatic-approval-key",
    );

    expect(result).toMatchObject({ status: EventMemberStatus.APPROVED });
    expect(transaction.event.findUnique).toHaveBeenCalledWith({
      where: { id: application.eventId },
      include: {
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
    });
    const joinedUserIds = transaction.chatRoomMember.upsert.mock.calls
      .map(([input]) => input.create.userId)
      .sort();
    expect(joinedUserIds).toEqual(
      [
        application.userId,
        "representative-leader",
        "operator-1",
        "moderator-1",
      ].sort(),
    );
    for (const [input] of transaction.chatRoomMember.upsert.mock.calls) {
      expect(input.update).toEqual({ leftAt: null });
    }
  });
});

const leaderPrincipal: AuthenticatedPrincipal = {
  userId: "leader-1",
  sessionId: "session-1",
  role: UserRole.LEADER,
};

function decisionApplication(
  status: EventMemberStatus,
  updatedAt = new Date("2026-07-30T01:00:00.000Z"),
) {
  return {
    id: "application-1",
    eventId: "event-1",
    userId: "member-1",
    status,
    attendance: AttendanceStatus.NOT_CHECKED,
    appliedAt: new Date("2026-07-29T01:00:00.000Z"),
    decidedAt:
      status === EventMemberStatus.PENDING
        ? null
        : new Date("2026-07-30T00:30:00.000Z"),
    canceledAt: null,
    updatedAt,
    event: {
      id: "event-1",
      title: "북한산 둘레길 걷기",
      capacity: 12,
      startAt: new Date("2099-08-01T00:00:00.000Z"),
      status: EventStatus.PUBLISHED as EventStatus,
      club: {
        leaderId: leaderPrincipal.userId,
        leader: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
        members: [] as Array<{ id: string; userId: string }>,
      },
    },
    user: { email: "member@example.com" },
  };
}

function serviceWithDecisionTransaction(
  initialApplication: ReturnType<typeof decisionApplication>,
  lockedApplication: ReturnType<typeof decisionApplication>,
  updatedApplication = lockedApplication,
) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    eventMember: {
      findUnique: vi
        .fn()
        .mockResolvedValueOnce(initialApplication)
        .mockResolvedValueOnce(lockedApplication),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue(updatedApplication),
    },
    eventMemberTransition: { create: vi.fn().mockResolvedValue({}) },
    chatRoom: {
      upsert: vi.fn().mockResolvedValue({ id: "chat-room-1" }),
    },
    chatRoomMember: { upsert: vi.fn().mockResolvedValue({}) },
    notification: {
      create: vi.fn().mockResolvedValue({ id: "notification-1" }),
    },
    outboxEvent: { createMany: vi.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (
        callback: (tx: typeof transaction) => Promise<unknown>,
      ) => callback(transaction),
    ),
  } as unknown as PrismaService;

  return { service: new EventsService(prisma), transaction };
}

describe("EventsService application decisions", () => {
  it("re-reads after the event lock and returns an already matching decision without side effects", async () => {
    const initial = decisionApplication(EventMemberStatus.PENDING);
    const decidedByConcurrentRequest = decisionApplication(
      EventMemberStatus.APPROVED,
      new Date("2026-07-30T02:00:00.000Z"),
    );
    const { service, transaction } = serviceWithDecisionTransaction(
      initial,
      decidedByConcurrentRequest,
    );

    const result = await service.decide(
      initial.id,
      { status: EventMemberStatus.APPROVED },
      leaderPrincipal,
    );

    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.eventMember.findUnique).toHaveBeenCalledTimes(2);
    const initialRead = transaction.eventMember.findUnique.mock.calls[0]![0];
    expect(initialRead).not.toHaveProperty("include");
    expect(initialRead.select).toEqual(
      expect.objectContaining({
        id: true,
        eventId: true,
        userId: true,
        status: true,
        event: expect.objectContaining({ select: expect.any(Object) }),
        user: { select: { email: true } },
      }),
    );
    expect(
      transaction.eventMember.findUnique.mock.invocationCallOrder[0],
    ).toBeLessThan(transaction.$queryRaw.mock.invocationCallOrder[0]!);
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.eventMember.findUnique.mock.invocationCallOrder[1]!,
    );
    expect(result).toMatchObject({
      id: initial.id,
      status: EventMemberStatus.APPROVED,
      updatedAt: "2026-07-30T02:00:00.000Z",
    });
    expect(transaction.eventMember.count).not.toHaveBeenCalled();
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.eventMemberTransition.create).not.toHaveBeenCalled();
    expect(transaction.chatRoom.upsert).not.toHaveBeenCalled();
    expect(transaction.chatRoomMember.upsert).not.toHaveBeenCalled();
    expect(transaction.notification.create).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects an opposite concurrent decision after the fresh locked read", async () => {
    const initial = decisionApplication(EventMemberStatus.PENDING);
    const decidedByConcurrentRequest = decisionApplication(
      EventMemberStatus.APPROVED,
      new Date("2026-07-30T02:00:00.000Z"),
    );
    const { service, transaction } = serviceWithDecisionTransaction(
      initial,
      decidedByConcurrentRequest,
    );

    await expect(
      service.decide(
        initial.id,
        { status: EventMemberStatus.REJECTED, reason: "일정 확인 필요" },
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "INVALID_APPLICATION_STATE" } },
    });

    expect(transaction.eventMember.count).not.toHaveBeenCalled();
    expect(transaction.eventMemberTransition.create).not.toHaveBeenCalled();
    expect(transaction.notification.create).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("adds every active operator and the representative leader to chat on approval", async () => {
    const initial = decisionApplication(EventMemberStatus.PENDING);
    initial.event.club = {
      leaderId: "representative-leader",
      leader: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
      members: [
        { id: "club-member-operator", userId: leaderPrincipal.userId },
        { id: "club-member-moderator", userId: "moderator-2" },
      ],
    };
    const approved = decisionApplication(EventMemberStatus.APPROVED);
    approved.event.club = initial.event.club;
    const { service, transaction } = serviceWithDecisionTransaction(
      initial,
      initial,
      approved,
    );

    const result = await service.decide(
      initial.id,
      { status: EventMemberStatus.APPROVED },
      leaderPrincipal,
    );

    expect(result).not.toHaveProperty("userId");
    expect(transaction.chatRoomMember.upsert).toHaveBeenCalledTimes(4);
    const joinedUserIds = transaction.chatRoomMember.upsert.mock.calls
      .map(([input]) => input.create.userId)
      .sort();
    expect(joinedUserIds).toEqual(
      [
        "member-1",
        "representative-leader",
        leaderPrincipal.userId,
        "moderator-2",
      ].sort(),
    );
  });

  it.each([
    EventMemberStatus.APPROVED,
    EventMemberStatus.REJECTED,
    EventMemberStatus.CANCELED,
  ])("rejects a terminal %s application transition", async (status) => {
    const initial = decisionApplication(status);
    const { service, transaction } = serviceWithDecisionTransaction(
      initial,
      initial,
    );
    const target =
      status === EventMemberStatus.APPROVED
        ? EventMemberStatus.REJECTED
        : EventMemberStatus.APPROVED;

    await expect(
      service.decide(
        initial.id,
        {
          status: target,
          ...(target === EventMemberStatus.REJECTED
            ? { reason: "상태 변경 불가" }
            : {}),
        },
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it.each([EventStatus.CLOSED, EventStatus.COMPLETED, EventStatus.CANCELED])(
    "rejects decisions for a %s event",
    async (eventStatus) => {
      const initial = decisionApplication(EventMemberStatus.PENDING);
      initial.event.status = eventStatus;
      const { service, transaction } = serviceWithDecisionTransaction(
        initial,
        initial,
      );

      await expect(
        service.decide(
          initial.id,
          { status: EventMemberStatus.APPROVED },
          leaderPrincipal,
        ),
      ).rejects.toMatchObject({
        status: 409,
        response: { error: { code: "APPLICATION_DECISION_CLOSED" } },
      });
      expect(transaction.eventMember.update).not.toHaveBeenCalled();
      expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
    },
  );

  it("rejects a decision after a published event has started", async () => {
    const initial = decisionApplication(EventMemberStatus.PENDING);
    initial.event.startAt = new Date("2000-01-01T00:00:00.000Z");
    const { service, transaction } = serviceWithDecisionTransaction(
      initial,
      initial,
    );

    await expect(
      service.decide(
        initial.id,
        { status: EventMemberStatus.APPROVED },
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "APPLICATION_DECISION_CLOSED" } },
    });
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects a leader without representative or operator scope before locking", async () => {
    const initial = decisionApplication(EventMemberStatus.PENDING);
    initial.event.club = {
      leaderId: "another-leader",
      leader: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
      members: [],
    };
    const { service, transaction } = serviceWithDecisionTransaction(
      initial,
      initial,
    );

    await expect(
      service.decide(
        initial.id,
        { status: EventMemberStatus.APPROVED },
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(transaction.$queryRaw).not.toHaveBeenCalled();
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });
});

function attendanceApplication(
  attendance: AttendanceStatus = AttendanceStatus.NOT_CHECKED,
) {
  const application = decisionApplication(EventMemberStatus.APPROVED);
  return {
    ...application,
    attendance,
    checkedInAt:
      attendance === AttendanceStatus.NOT_CHECKED
        ? null
        : new Date("2026-07-30T03:00:00.000Z"),
    event: {
      ...application.event,
      startAt: new Date("2000-01-01T00:00:00.000Z"),
      endAt: new Date("2000-01-01T02:00:00.000Z") as Date | null,
    },
  };
}

function serviceWithAttendanceTransaction(
  current: ReturnType<typeof attendanceApplication>,
  options: {
    existingReviewCount?: number;
    updatedAttendance?: AttendanceStatus;
    updatedAt?: Date;
  } = {},
) {
  const updated = {
    id: current.id,
    attendance: options.updatedAttendance ?? AttendanceStatus.ATTENDED,
    checkedInAt: new Date("2026-07-30T04:00:00.000Z"),
    updatedAt: options.updatedAt ?? new Date("2026-07-30T04:00:00.000Z"),
  };
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    eventMember: {
      findUnique: vi.fn().mockResolvedValue(current),
      update: vi.fn().mockResolvedValue(updated),
    },
    eventMemberTransition: { create: vi.fn().mockResolvedValue({}) },
    review: {
      count: vi.fn().mockResolvedValue(options.existingReviewCount ?? 0),
    },
    outboxEvent: {
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;

  return { service: new EventsService(prisma), prisma, transaction, updated };
}

describe("EventsService attendance decisions", () => {
  it("records attendance and queues one delayed review request atomically", async () => {
    const current = attendanceApplication();
    const { service, transaction, updated } =
      serviceWithAttendanceTransaction(current);

    const result = await service.markAttendance(
      current.id,
      { attendance: AttendanceStatus.ATTENDED, reason: "현장 출석 확인" },
      leaderPrincipal,
    );

    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.eventMember.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id },
        select: expect.objectContaining({
          id: true,
          eventId: true,
          userId: true,
          attendance: true,
        }),
      }),
    );
    expect(transaction.eventMember.update).toHaveBeenCalledWith({
      where: { id: current.id },
      data: {
        attendance: AttendanceStatus.ATTENDED,
        checkedInById: leaderPrincipal.userId,
        checkedInAt: expect.any(Date),
      },
      select: {
        id: true,
        attendance: true,
        checkedInAt: true,
        updatedAt: true,
      },
    });
    expect(transaction.eventMemberTransition.create).toHaveBeenCalledWith({
      data: {
        eventMemberId: current.id,
        actorId: leaderPrincipal.userId,
        fromAttendance: AttendanceStatus.NOT_CHECKED,
        toAttendance: AttendanceStatus.ATTENDED,
        reason: "현장 출석 확인",
      },
    });
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        {
          type: "EVENT_REVIEW_REQUEST_READY",
          aggregateType: "EventMember",
          aggregateId: current.id,
          dedupKey: `review-request:${current.id}:ready:${updated.updatedAt.toISOString()}`,
          payload: { applicationId: current.id },
          availableAt: current.event.endAt,
        },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({
      id: updated.id,
      attendance: updated.attendance,
      checkedInAt: updated.checkedInAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    });
  });

  it("returns an identical attendance retry without duplicate side effects", async () => {
    const current = attendanceApplication(AttendanceStatus.ATTENDED);
    const { service, transaction } = serviceWithAttendanceTransaction(current);

    await expect(
      service.markAttendance(
        current.id,
        { attendance: AttendanceStatus.ATTENDED },
        leaderPrincipal,
      ),
    ).resolves.toMatchObject({ attendance: AttendanceStatus.ATTENDED });

    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.eventMemberTransition.create).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("rejects attendance before the event starts", async () => {
    const current = attendanceApplication();
    current.event.startAt = new Date("2099-01-01T00:00:00.000Z");
    const { service, transaction } = serviceWithAttendanceTransaction(current);

    await expect(
      service.markAttendance(
        current.id,
        { attendance: AttendanceStatus.ATTENDED },
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "ATTENDANCE_NOT_OPEN" } },
    });
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("uses startAt as the delivery time when the event has no endAt", async () => {
    const current = attendanceApplication();
    current.event.endAt = null;
    const { service, transaction } = serviceWithAttendanceTransaction(current);

    await service.markAttendance(
      current.id,
      { attendance: AttendanceStatus.ATTENDED },
      leaderPrincipal,
    );

    expect(transaction.outboxEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [expect.objectContaining({ availableAt: current.event.startAt })],
      }),
    );
  });

  it("does not queue a review request when recording a no-show", async () => {
    const current = attendanceApplication();
    const { service, transaction } = serviceWithAttendanceTransaction(current, {
      updatedAttendance: AttendanceStatus.NO_SHOW,
    });

    await service.markAttendance(
      current.id,
      { attendance: AttendanceStatus.NO_SHOW },
      leaderPrincipal,
    );

    expect(transaction.eventMember.update).toHaveBeenCalledOnce();
    expect(transaction.outboxEvent.createMany).not.toHaveBeenCalled();
  });

  it("queues a new version when a processed no-show is corrected to attended", async () => {
    const current = attendanceApplication(AttendanceStatus.NO_SHOW);
    const correctedAt = new Date("2026-07-30T05:00:00.000Z");
    const processedOldKey =
      `review-request:${current.id}:ready:2026-07-30T04:00:00.000Z`;
    const { service, transaction } = serviceWithAttendanceTransaction(current, {
      updatedAt: correctedAt,
    });

    await service.markAttendance(
      current.id,
      { attendance: AttendanceStatus.ATTENDED },
      leaderPrincipal,
    );

    const queued = transaction.outboxEvent.createMany.mock.calls[0]![0];
    expect(queued.data[0].dedupKey).toBe(
      `review-request:${current.id}:ready:${correctedAt.toISOString()}`,
    );
    expect(queued.data[0].dedupKey).not.toBe(processedOldKey);
  });

  it("does not turn an attended reviewer into a no-show", async () => {
    const current = attendanceApplication(AttendanceStatus.ATTENDED);
    const { service, transaction } = serviceWithAttendanceTransaction(current, {
      existingReviewCount: 1,
    });

    await expect(
      service.markAttendance(
        current.id,
        { attendance: AttendanceStatus.NO_SHOW },
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "ATTENDANCE_HAS_REVIEW" } },
    });
    expect(transaction.review.count).toHaveBeenCalledOnce();
    expect(transaction.eventMember.update).not.toHaveBeenCalled();
  });

  it("fails closed for a member before opening a transaction", async () => {
    const current = attendanceApplication();
    const { service, prisma } = serviceWithAttendanceTransaction(current);

    await expect(
      service.markAttendance(
        current.id,
        { attendance: AttendanceStatus.ATTENDED },
        { ...leaderPrincipal, role: UserRole.MEMBER },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("EventsService leader application reads", () => {
  it("keeps the default managed view limited to future operator events", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "event-1",
        title: "북한산 둘레길 걷기",
        startAt: new Date("2026-08-01T00:00:00.000Z"),
        endAt: null,
        locationName: "둘레길 안내소",
        capacity: 12,
        status: EventStatus.PUBLISHED,
        club: { slug: "slow-hiking", title: "천천히 걷는 산길" },
        _count: { participants: 3 },
      },
    ]);
    const groupBy = vi.fn().mockResolvedValue([
      { eventId: "event-1", _count: { _all: 2 } },
    ]);
    const prisma = {
      event: { findMany },
      eventMember: { groupBy },
    } as unknown as PrismaService;

    const result = await new EventsService(prisma).managedEvents(
      leaderPrincipal,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          club: {
            OR: [
              { leaderId: leaderPrincipal.userId },
              {
                members: {
                  some: {
                    userId: leaderPrincipal.userId,
                    status: ClubMemberStatus.ACTIVE,
                    role: {
                      in: [ClubMemberRole.LEADER, ClubMemberRole.MODERATOR],
                    },
                    user: {
                      role: UserRole.LEADER,
                      status: UserStatus.ACTIVE,
                    },
                  },
                },
              },
            ],
          },
          status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] },
          startAt: { gte: expect.any(Date) },
        }),
        take: 21,
        select: expect.objectContaining({
          id: true,
          title: true,
          _count: {
            select: {
              participants: {
                where: { status: EventMemberStatus.APPROVED },
              },
            },
          },
        }),
      }),
    );
    expect(result.data[0]).toMatchObject({
      id: "event-1",
      participantCount: 3,
      pendingCount: 2,
      remainingCapacity: 9,
    });
    expect(groupBy).toHaveBeenCalledWith({
      by: ["eventId"],
      where: {
        eventId: { in: ["event-1"] },
        status: EventMemberStatus.PENDING,
      },
      _count: { _all: true },
    });
    expect(result.page).toEqual({ nextCursor: null, hasNextPage: false });
  });

  it("lists started ongoing or recent attendance events newest first", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "event-attendance",
        title: "출석 확인 모임",
        startAt: new Date("2026-07-29T00:00:00.000Z"),
        endAt: new Date("2026-07-31T00:00:00.000Z"),
        locationName: "서울숲",
        capacity: 20,
        status: EventStatus.COMPLETED,
        club: { slug: "walking", title: "서울 걷기" },
        _count: { participants: 10 },
      },
    ]);
    const service = new EventsService({
      event: { findMany },
      eventMember: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);
    const before = Date.now();

    const result = await service.managedEvents(leaderPrincipal, {
      limit: 20,
      view: "attendance",
    });
    const after = Date.now();
    const query = findMany.mock.calls[0]![0];

    expect(query.orderBy).toEqual([{ startAt: "desc" }, { id: "desc" }]);
    expect(query.where.status).toEqual({
      in: [EventStatus.PUBLISHED, EventStatus.CLOSED, EventStatus.COMPLETED],
    });
    expect(query.where.startAt.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(query.where.startAt.lte.getTime()).toBeLessThanOrEqual(after);
    expect(query.where.AND[0].OR[0].endAt.gte).toEqual(query.where.startAt.lte);
    const recentCutoff = query.where.AND[0].OR[1].startAt.gte.getTime();
    expect(recentCutoff).toBe(
      query.where.startAt.lte.getTime() - 30 * 24 * 60 * 60 * 1_000,
    );
    expect(result.data[0]).toMatchObject({
      id: "event-attendance",
      status: EventStatus.COMPLETED,
    });
  });

  it("returns a minimal applicant projection without email or user id", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "event-1",
      title: "북한산 둘레길 걷기",
      startAt: new Date("2026-08-01T00:00:00.000Z"),
      endAt: null,
      locationName: "둘레길 안내소",
      capacity: 12,
      status: EventStatus.PUBLISHED,
      club: { slug: "slow-hiking", title: "천천히 걷는 산길" },
      _count: { participants: 3 },
      participants: [
        {
          id: "application-1",
          status: EventMemberStatus.PENDING,
          attendance: AttendanceStatus.NOT_CHECKED,
          appliedAt: new Date("2026-07-30T00:00:00.000Z"),
          decidedAt: null,
          updatedAt: new Date("2026-07-30T00:00:00.000Z"),
          user: {
            name: "김정희",
            birthYear: 1962,
            region: "서울특별시 마포구",
            interests: [
              { interest: { slug: "hiking", name: "등산" } },
            ],
            _count: { eventMemberships: 2 },
          },
        },
      ],
    });
    const count = vi.fn().mockResolvedValue(1);
    const prisma = {
      event: { findFirst },
      eventMember: { count },
    } as unknown as PrismaService;

    const result = await new EventsService(prisma).leaderApplications(
      "event-1",
      leaderPrincipal,
    );

    const query = findFirst.mock.calls[0]![0];
    expect(query.where.club).toEqual({
      OR: [
        { leaderId: leaderPrincipal.userId },
        {
          members: {
            some: {
              userId: leaderPrincipal.userId,
              status: ClubMemberStatus.ACTIVE,
              role: {
                in: [ClubMemberRole.LEADER, ClubMemberRole.MODERATOR],
              },
              user: {
                role: UserRole.LEADER,
                status: UserStatus.ACTIVE,
              },
            },
          },
        },
      ],
    });
    expect(query.select.participants.select.user.select).not.toHaveProperty(
      "email",
    );
    expect(query.select.participants.select.user.select).not.toHaveProperty(
      "id",
    );
    expect(query.select.participants.take).toBe(51);
    expect(result.applications[0]).toEqual({
      id: "application-1",
      status: EventMemberStatus.PENDING,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: "2026-07-30T00:00:00.000Z",
      decidedAt: null,
      updatedAt: "2026-07-30T00:00:00.000Z",
      applicant: {
        name: "김정희",
        ageGroup: "60대",
        region: "서울특별시 마포구",
        interests: [{ slug: "hiking", name: "등산" }],
        attendedEventCount: 2,
      },
    });
    expect(result.event.pendingCount).toBe(1);
    expect(count).toHaveBeenCalledWith({
      where: {
        eventId: "event-1",
        status: EventMemberStatus.PENDING,
      },
    });
    expect(result.page).toEqual({ nextCursor: null, hasNextPage: false });
  });

  it("returns opaque cursors instead of silently truncating managed events", async () => {
    const row = (id: string, startAt: string) => ({
      id,
      title: `모임 ${id}`,
      startAt: new Date(startAt),
      endAt: null,
      locationName: "둘레길 안내소",
      capacity: 12,
      status: EventStatus.PUBLISHED,
      club: { slug: "slow-hiking", title: "천천히 걷는 산길" },
      _count: { participants: 0 },
    });
    const findMany = vi.fn().mockResolvedValue([
      row("event-1", "2099-08-01T00:00:00.000Z"),
      row("event-2", "2099-08-02T00:00:00.000Z"),
    ]);
    const service = new EventsService({
      event: { findMany },
      eventMember: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    const first = await service.managedEvents(leaderPrincipal, {
      limit: 1,
      view: "upcoming",
    });

    expect(findMany.mock.calls[0]![0].take).toBe(2);
    expect(first.data).toHaveLength(1);
    expect(first.page).toMatchObject({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });

    findMany.mockResolvedValueOnce([]);
    await service.managedEvents(leaderPrincipal, {
      limit: 1,
      cursor: first.page.nextCursor!,
      view: "upcoming",
    });
    expect(findMany.mock.calls[1]![0].where.OR).toEqual([
      { startAt: { gt: new Date("2099-08-01T00:00:00.000Z") } },
      {
        startAt: new Date("2099-08-01T00:00:00.000Z"),
        id: { gt: "event-1" },
      },
    ]);
  });

  it("binds attendance cursors to the descending attendance view", async () => {
    const row = (id: string, startAt: string) => ({
      id,
      title: `모임 ${id}`,
      startAt: new Date(startAt),
      endAt: new Date("2099-08-03T00:00:00.000Z"),
      locationName: "둘레길 안내소",
      capacity: 12,
      status: EventStatus.PUBLISHED,
      club: { slug: "slow-hiking", title: "천천히 걷는 산길" },
      _count: { participants: 0 },
    });
    const findMany = vi.fn().mockResolvedValue([
      row("event-2", "2026-07-30T02:00:00.000Z"),
      row("event-1", "2026-07-30T01:00:00.000Z"),
    ]);
    const service = new EventsService({
      event: { findMany },
      eventMember: { groupBy: vi.fn().mockResolvedValue([]) },
    } as unknown as PrismaService);

    const first = await service.managedEvents(leaderPrincipal, {
      limit: 1,
      view: "attendance",
    });

    findMany.mockResolvedValueOnce([]);
    await service.managedEvents(leaderPrincipal, {
      limit: 1,
      cursor: first.page.nextCursor!,
      view: "attendance",
    });
    expect(findMany.mock.calls[1]![0].where.AND[1].OR).toEqual([
      { startAt: { lt: new Date("2026-07-30T02:00:00.000Z") } },
      {
        startAt: new Date("2026-07-30T02:00:00.000Z"),
        id: { lt: "event-2" },
      },
    ]);

    await expect(
      service.managedEvents(leaderPrincipal, {
        limit: 1,
        cursor: first.page.nextCursor!,
        view: "upcoming",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(findMany).toHaveBeenCalledTimes(2);
  });

  it("paginates applications by applied time and id", async () => {
    const application = (id: string, appliedAt: string) => ({
      id,
      status: EventMemberStatus.PENDING,
      attendance: AttendanceStatus.NOT_CHECKED,
      appliedAt: new Date(appliedAt),
      decidedAt: null,
      updatedAt: new Date(appliedAt),
      user: {
        name: `신청자 ${id}`,
        birthYear: 1962,
        region: "서울특별시",
        interests: [],
        _count: { eventMemberships: 0 },
      },
    });
    const event = (participants: ReturnType<typeof application>[]) => ({
      id: "event-1",
      title: "북한산 둘레길 걷기",
      startAt: new Date("2099-08-01T00:00:00.000Z"),
      endAt: null,
      locationName: "둘레길 안내소",
      capacity: 12,
      status: EventStatus.PUBLISHED,
      club: { slug: "slow-hiking", title: "천천히 걷는 산길" },
      _count: { participants: 0 },
      participants,
    });
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce(
        event([
          application("application-2", "2026-07-30T02:00:00.000Z"),
          application("application-1", "2026-07-30T01:00:00.000Z"),
        ]),
      )
      .mockResolvedValueOnce(event([]));
    const service = new EventsService({
      event: { findFirst },
      eventMember: { count: vi.fn().mockResolvedValue(2) },
    } as unknown as PrismaService);

    const first = await service.leaderApplications(
      "event-1",
      leaderPrincipal,
      { limit: 1 },
    );

    expect(findFirst.mock.calls[0]![0].select.participants.take).toBe(2);
    expect(first.applications.map(({ id }) => id)).toEqual([
      "application-2",
    ]);
    expect(first.page).toMatchObject({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });

    await service.leaderApplications("event-1", leaderPrincipal, {
      limit: 1,
      cursor: first.page.nextCursor!,
    });
    expect(
      findFirst.mock.calls[1]![0].select.participants.where.OR,
    ).toEqual([
      { appliedAt: { lt: new Date("2026-07-30T02:00:00.000Z") } },
      {
        appliedAt: new Date("2026-07-30T02:00:00.000Z"),
        id: { lt: "application-2" },
      },
    ]);
  });

  it("rejects malformed leader cursors before querying", async () => {
    const findMany = vi.fn();
    const findFirst = vi.fn();
    const service = new EventsService({
      event: { findMany, findFirst },
    } as unknown as PrismaService);

    await expect(
      service.managedEvents(leaderPrincipal, {
        limit: 20,
        cursor: "not-a-valid-cursor",
        view: "upcoming",
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.leaderApplications("event-1", leaderPrincipal, {
        limit: 50,
        cursor: "not-a-valid-cursor",
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(findMany).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("fails closed for a member before querying managed data", async () => {
    const findMany = vi.fn();
    const prisma = { event: { findMany } } as unknown as PrismaService;
    const service = new EventsService(prisma);

    await expect(
      service.managedEvents({ ...leaderPrincipal, role: UserRole.MEMBER }),
    ).rejects.toMatchObject({ status: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });
});
