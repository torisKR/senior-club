import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  ApprovalMode,
  ClubStatus,
  EventDifficulty,
  EventMemberStatus,
  EventStatus,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { createEventSchema, updateEventSchema } from "./events.contracts";
import { EventsService } from "./events.service";

const leaderPrincipal: AuthenticatedPrincipal = {
  userId: "leader-1",
  sessionId: "session-1",
  role: UserRole.LEADER,
};

const eventManagerInput = createEventSchema.parse({
  clubId: "club-1",
  title: "북한산 둘레길 걷기",
  description: "천천히 걸으며 북한산의 여름 풍경을 함께 감상합니다.",
  coverImageUrl: "https://cdn.example.com/events/walk.jpg",
  locationName: "북한산 안내소",
  address: "서울특별시 은평구 진관동",
  mapUrl: "https://map.example.com/place/1",
  startAt: "2099-08-01T09:00:00+09:00",
  endAt: "2099-08-01T12:00:00+09:00",
  registrationDeadline: "2099-07-31T18:00:00+09:00",
  capacity: 20,
  price: 10_000,
  difficulty: EventDifficulty.EASY,
  supplies: "물, 모자",
  approvalMode: ApprovalMode.MANUAL,
  publish: true,
});

function managedEventRow(
  overrides: Partial<{
    status: EventStatus;
    startAt: Date;
    registrationDeadline: Date | null;
    leaderId: string;
    clubStatus: ClubStatus;
    participantCount: number;
  }> = {},
) {
  return {
    id: "event-1",
    clubId: "club-1",
    title: "북한산 둘레길 걷기",
    description: "천천히 걸으며 북한산의 여름 풍경을 함께 감상합니다.",
    coverImageUrl: null,
    locationName: "북한산 안내소",
    address: "서울특별시 은평구 진관동",
    mapUrl: null,
    startAt:
      overrides.startAt ?? new Date("2099-08-01T00:00:00.000Z"),
    endAt: new Date("2099-08-01T03:00:00.000Z"),
    registrationDeadline:
      overrides.registrationDeadline === undefined
        ? new Date("2099-07-31T09:00:00.000Z")
        : overrides.registrationDeadline,
    capacity: 20,
    price: 10_000,
    currency: "KRW",
    difficulty: EventDifficulty.EASY,
    supplies: "물, 모자",
    approvalMode: ApprovalMode.MANUAL,
    status: overrides.status ?? EventStatus.DRAFT,
    createdAt: new Date("2026-07-30T00:00:00.000Z"),
    updatedAt: new Date("2026-07-30T01:00:00.000Z"),
    club: {
      id: "club-1",
      slug: "slow-hiking",
      title: "천천히 걷는 산길",
      region: "서울특별시",
      interest: { slug: "hiking", name: "등산", icon: "mountain" },
      leader: {
        name: "김리더",
        role: UserRole.LEADER,
        status: UserStatus.ACTIVE,
      },
      leaderId: overrides.leaderId ?? leaderPrincipal.userId,
      status: overrides.clubStatus ?? ClubStatus.ACTIVE,
      members: [] as Array<{ userId: string }>,
    },
    _count: { participants: overrides.participantCount ?? 0 },
  };
}

function managementTransaction(
  event = managedEventRow(),
  options: {
    activeApplicationCount?: number;
    applications?: Array<{
      id: string;
      userId: string;
      status: EventMemberStatus;
    }>;
  } = {},
) {
  const transaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: event.id }]),
    user: {
      findUnique: vi.fn().mockResolvedValue({
        onboardingCompletedAt: new Date("2026-07-29T00:00:00.000Z"),
        role: UserRole.LEADER,
        status: UserStatus.ACTIVE,
      }),
    },
    club: {
      findUnique: vi.fn().mockResolvedValue({
        id: event.clubId,
        leaderId: event.club.leaderId,
        status: event.club.status,
      }),
    },
    idempotencyRecord: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
    },
    event: {
      findUnique: vi.fn().mockResolvedValue(event),
      create: vi.fn().mockImplementation(({ data }) => ({
        ...event,
        ...data,
        clubId: data.clubId,
        status: data.status,
      })),
      update: vi.fn().mockImplementation(({ data }) => ({
        ...event,
        ...data,
        updatedAt: new Date("2026-07-30T02:00:00.000Z"),
        _count: {
          participants:
            data.status === EventStatus.CANCELED
              ? 0
              : event._count.participants,
        },
      })),
    },
    eventMember: {
      count: vi.fn().mockResolvedValue(options.activeApplicationCount ?? 0),
      findMany: vi.fn().mockResolvedValue(
        (options.applications ?? []).map((application) => ({
          ...application,
          user: { email: `${application.userId}@example.com` },
        })),
      ),
      updateMany: vi.fn().mockResolvedValue({
        count: options.applications?.length ?? 0,
      }),
    },
    eventMemberTransition: {
      createMany: vi.fn().mockResolvedValue({
        count: options.applications?.length ?? 0,
      }),
    },
    notification: {
      createMany: vi.fn().mockResolvedValue({
        count: options.applications?.length ?? 0,
      }),
    },
    chatRoomMember: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    outboxEvent: {
      createMany: vi.fn().mockResolvedValue({
        count: (options.applications?.length ?? 0) * 2,
      }),
    },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  } as unknown as PrismaService;
  return { transaction, service: new EventsService(prisma) };
}

describe("EventsService event management", () => {
  it("creates a published event after onboarding and locking an owned active club", async () => {
    const { service, transaction } = managementTransaction();

    const result = await service.create(
      eventManagerInput,
      leaderPrincipal,
      "event-create-key-1",
    );

    expect(result).toMatchObject({
      id: "event-1",
      clubId: "club-1",
      status: EventStatus.PUBLISHED,
      updatedAt: "2026-07-30T01:00:00.000Z",
    });
    expect(result).not.toHaveProperty("createdAt");
    const createSelect = transaction.event.create.mock.calls[0]![0].select;
    expect(createSelect).toMatchObject({ clubId: true, updatedAt: true });
    expect(createSelect).not.toHaveProperty("createdAt");
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(2);
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.idempotencyRecord.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(transaction.$queryRaw.mock.invocationCallOrder[1]).toBeLessThan(
      transaction.club.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(transaction.event.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          creatorId: leaderPrincipal.userId,
          clubId: "club-1",
          status: EventStatus.PUBLISHED,
          currency: "KRW",
        }),
      }),
    );
  });

  it("replays an exact create request and rejects reuse with a different body", async () => {
    const { service, transaction } = managementTransaction();
    const key = "event-create-replay-key";
    const first = await service.create(eventManagerInput, leaderPrincipal, key);
    const requestHash = transaction.idempotencyRecord.create.mock.calls[0]![0]
      .data.requestHash;
    transaction.idempotencyRecord.findUnique.mockResolvedValue({
      requestHash,
      completedAt: new Date("2026-07-30T02:00:00.000Z"),
      responseBody: first,
    });
    transaction.event.create.mockClear();

    await expect(
      service.create(eventManagerInput, leaderPrincipal, key),
    ).resolves.toEqual(first);
    expect(transaction.event.create).not.toHaveBeenCalled();

    await expect(
      service.create(
        { ...eventManagerInput, title: "서로 다른 모임 제목" },
        leaderPrincipal,
        key,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "IDEMPOTENCY_KEY_REUSED" } },
    });
    expect(transaction.event.create).not.toHaveBeenCalled();
  });

  it("serializes concurrent same-key creates into one write and one exact replay", async () => {
    const event = managedEventRow();
    let storedRequest: Record<string, unknown> | null = null;
    const eventCreate = vi.fn().mockImplementation(({ data }) => ({
      ...event,
      ...data,
      clubId: data.clubId,
      status: data.status,
    }));
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "locked" }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({
          onboardingCompletedAt: new Date("2026-07-29T00:00:00.000Z"),
          role: UserRole.LEADER,
          status: UserStatus.ACTIVE,
        }),
      },
      idempotencyRecord: {
        findUnique: vi.fn().mockImplementation(() => storedRequest),
        create: vi.fn().mockImplementation(({ data }) => {
          storedRequest = {
            ...data,
            completedAt: null,
            responseBody: null,
          };
          return storedRequest;
        }),
        update: vi.fn().mockImplementation(({ data }) => {
          storedRequest = { ...storedRequest, ...data };
          return storedRequest;
        }),
      },
      club: {
        findUnique: vi.fn().mockResolvedValue({
          id: "club-1",
          leaderId: leaderPrincipal.userId,
          status: ClubStatus.ACTIVE,
        }),
      },
      event: { create: eventCreate },
    };
    let previous = Promise.resolve();
    const prisma = {
      $transaction: vi.fn(
        async (callback: (tx: typeof transaction) => Promise<unknown>) => {
          const waitForPrevious = previous;
          let release!: () => void;
          previous = new Promise<void>((resolve) => {
            release = resolve;
          });
          await waitForPrevious;
          try {
            return await callback(transaction);
          } finally {
            release();
          }
        },
      ),
    } as unknown as PrismaService;
    const service = new EventsService(prisma);

    const [first, replay] = await Promise.all([
      service.create(
        eventManagerInput,
        leaderPrincipal,
        "event-create-concurrent-key",
      ),
      service.create(
        eventManagerInput,
        leaderPrincipal,
        "event-create-concurrent-key",
      ),
    ]);

    expect(replay).toEqual(first);
    expect(eventCreate).toHaveBeenCalledOnce();
    expect(transaction.idempotencyRecord.create).toHaveBeenCalledOnce();
    expect(transaction.idempotencyRecord.findUnique).toHaveBeenCalledTimes(2);
  });

  it("lets an admin create in another active club but fails closed for a non-owner leader", async () => {
    const foreign = managedEventRow({ leaderId: "leader-2" });
    const adminSetup = managementTransaction(foreign);
    adminSetup.transaction.user.findUnique.mockResolvedValue({
      onboardingCompletedAt: new Date("2026-07-29T00:00:00.000Z"),
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
    });
    await expect(
      adminSetup.service.create(
        eventManagerInput,
        { ...leaderPrincipal, role: UserRole.ADMIN },
        "event-create-admin-key",
      ),
    ).resolves.toMatchObject({ status: EventStatus.PUBLISHED });

    const leaderSetup = managementTransaction(foreign);
    await expect(
      leaderSetup.service.create(
        eventManagerInput,
        leaderPrincipal,
        "event-create-leader-key",
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: { code: "MANAGED_CLUB_NOT_FOUND" } },
    });
    expect(leaderSetup.transaction.event.create).not.toHaveBeenCalled();
  });

  it("rejects past starts and incomplete onboarding before writing", async () => {
    const pastSetup = managementTransaction();
    await expect(
      pastSetup.service.create(
        createEventSchema.parse({
          ...eventManagerInput,
          startAt: "2000-01-01T00:00:00.000Z",
          endAt: "2000-01-01T01:00:00.000Z",
          registrationDeadline: null,
        }),
        leaderPrincipal,
        "event-create-past-key",
      ),
    ).rejects.toMatchObject({
      status: 400,
      response: { error: { code: "EVENT_START_MUST_BE_FUTURE" } },
    });
    expect(pastSetup.transaction.event.create).not.toHaveBeenCalled();

    const onboardingSetup = managementTransaction();
    onboardingSetup.transaction.user.findUnique.mockResolvedValueOnce({
      onboardingCompletedAt: null,
      role: UserRole.LEADER,
      status: UserStatus.ACTIVE,
    });
    await expect(
      onboardingSetup.service.create(
        eventManagerInput,
        leaderPrincipal,
        "event-create-onboarding-key",
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "PROFILE_ONBOARDING_REQUIRED" } },
    });
    expect(onboardingSetup.transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(onboardingSetup.transaction.club.findUnique).not.toHaveBeenCalled();
    expect(
      onboardingSetup.transaction.idempotencyRecord.create,
    ).not.toHaveBeenCalled();
    expect(onboardingSetup.transaction.event.create).not.toHaveBeenCalled();
  });

  it("locks the event and rejects capacity below pending plus approved applications", async () => {
    const { service, transaction } = managementTransaction(
      managedEventRow({ status: EventStatus.PUBLISHED }),
      { activeApplicationCount: 3 },
    );

    await expect(
      service.update(
        "event-1",
        updateEventSchema.parse({ capacity: 2 }),
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: {
        error: {
          code: "CAPACITY_BELOW_APPLICATION_COUNT",
          details: { minimumCapacity: 3 },
        },
      },
    });
    expect(transaction.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.event.findUnique.mock.invocationCallOrder[0]!,
    );
    expect(transaction.event.findUnique.mock.invocationCallOrder[0]).toBeLessThan(
      transaction.eventMember.count.mock.invocationCallOrder[0]!,
    );
    expect(transaction.event.update).not.toHaveBeenCalled();
  });

  it("repairs an expired draft but blocks changes after a published event starts", async () => {
    const repairedSetup = managementTransaction(
      managedEventRow({
        status: EventStatus.DRAFT,
        startAt: new Date("2000-01-01T00:00:00.000Z"),
        registrationDeadline: null,
      }),
    );
    await expect(
      repairedSetup.service.update(
        "event-1",
        updateEventSchema.parse({
          startAt: "2099-09-01T00:00:00.000Z",
          endAt: null,
        }),
        leaderPrincipal,
      ),
    ).resolves.toMatchObject({ startAt: "2099-09-01T00:00:00.000Z" });

    const startedSetup = managementTransaction(
      managedEventRow({
        status: EventStatus.PUBLISHED,
        startAt: new Date("2000-01-01T00:00:00.000Z"),
        registrationDeadline: null,
      }),
    );
    await expect(
      startedSetup.service.update(
        "event-1",
        updateEventSchema.parse({ description: "시작 후 바꿀 수 없는 설명입니다." }),
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "EVENT_UPDATE_CLOSED" } },
    });
    expect(startedSetup.transaction.event.update).not.toHaveBeenCalled();
  });

  it("publishes a valid draft and treats an already published event idempotently", async () => {
    const draftSetup = managementTransaction();
    await expect(
      draftSetup.service.publish("event-1", leaderPrincipal),
    ).resolves.toMatchObject({ status: EventStatus.PUBLISHED });
    expect(draftSetup.transaction.event.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: EventStatus.PUBLISHED } }),
    );

    const publishedSetup = managementTransaction(
      managedEventRow({ status: EventStatus.PUBLISHED }),
    );
    await expect(
      publishedSetup.service.publish("event-1", leaderPrincipal),
    ).resolves.toMatchObject({ status: EventStatus.PUBLISHED });
    expect(publishedSetup.transaction.event.update).not.toHaveBeenCalled();
  });

  it("atomically cancels active applications, transitions, and in-app notifications", async () => {
    const applications = [
      {
        id: "application-pending",
        userId: "member-1",
        status: EventMemberStatus.PENDING,
      },
      {
        id: "application-approved",
        userId: "member-2",
        status: EventMemberStatus.APPROVED,
      },
    ];
    const { service, transaction } = managementTransaction(
      managedEventRow({ status: EventStatus.PUBLISHED, participantCount: 1 }),
      { applications },
    );

    const result = await service.cancelEvent("event-1", leaderPrincipal);

    expect(result).toMatchObject({
      status: EventStatus.CANCELED,
      participantCount: 0,
    });
    expect(transaction.eventMember.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["application-pending", "application-approved"] } },
      data: {
        status: EventMemberStatus.CANCELED,
        canceledAt: expect.any(Date),
      },
    });
    expect(transaction.eventMemberTransition.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          eventMemberId: "application-pending",
          fromStatus: EventMemberStatus.PENDING,
          toStatus: EventMemberStatus.CANCELED,
        }),
        expect.objectContaining({
          eventMemberId: "application-approved",
          fromStatus: EventMemberStatus.APPROVED,
          toStatus: EventMemberStatus.CANCELED,
        }),
      ]),
    });
    expect(transaction.notification.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          id: "event-cancel:application-pending",
          recipientId: "member-1",
        }),
        expect.objectContaining({
          id: "event-cancel:application-approved",
          recipientId: "member-2",
        }),
      ]),
    });
    expect(transaction.chatRoomMember.updateMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["member-2"] },
        leftAt: null,
        room: { eventId: "event-1" },
      },
      data: { leftAt: expect.any(Date) },
    });
    expect(transaction.outboxEvent.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          type: "EVENT_APPLICATION_EMAIL",
          aggregateId: "application-pending",
          payload: expect.objectContaining({
            notificationId: "event-cancel:application-pending",
            status: EventMemberStatus.CANCELED,
          }),
        }),
        expect.objectContaining({
          type: "EVENT_APPLICATION_PUSH",
          aggregateId: "application-approved",
          payload: expect.objectContaining({
            notificationId: "event-cancel:application-approved",
            status: EventMemberStatus.CANCELED,
          }),
        }),
      ]),
    });
    expect(
      transaction.outboxEvent.createMany.mock.calls[0]![0].data,
    ).toHaveLength(4);
  });

  it("keeps operator chat access while revoking canceled approved participants", async () => {
    const event = managedEventRow({ status: EventStatus.PUBLISHED });
    event.club.members = [{ userId: "operator-2" }];
    const { service, transaction } = managementTransaction(event, {
      applications: [
        {
          id: "application-leader",
          userId: leaderPrincipal.userId,
          status: EventMemberStatus.APPROVED,
        },
        {
          id: "application-operator",
          userId: "operator-2",
          status: EventMemberStatus.APPROVED,
        },
        {
          id: "application-member",
          userId: "member-1",
          status: EventMemberStatus.APPROVED,
        },
      ],
    });

    await service.cancelEvent("event-1", leaderPrincipal);

    expect(transaction.chatRoomMember.updateMany).toHaveBeenCalledWith({
      where: {
        userId: { in: ["member-1"] },
        leftAt: null,
        room: { eventId: "event-1" },
      },
      data: { leftAt: expect.any(Date) },
    });
  });

  it("makes cancellation idempotent and refuses it after the event starts", async () => {
    const canceledSetup = managementTransaction(
      managedEventRow({ status: EventStatus.CANCELED }),
    );
    await expect(
      canceledSetup.service.cancelEvent("event-1", leaderPrincipal),
    ).resolves.toMatchObject({ status: EventStatus.CANCELED });
    expect(canceledSetup.transaction.eventMember.findMany).not.toHaveBeenCalled();
    expect(canceledSetup.transaction.event.update).not.toHaveBeenCalled();

    const startedSetup = managementTransaction(
      managedEventRow({
        status: EventStatus.PUBLISHED,
        startAt: new Date("2000-01-01T00:00:00.000Z"),
        registrationDeadline: null,
      }),
    );
    await expect(
      startedSetup.service.cancelEvent("event-1", leaderPrincipal),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "EVENT_CANCELLATION_CLOSED" } },
    });
    expect(startedSetup.transaction.eventMember.findMany).not.toHaveBeenCalled();
  });

  it("keeps private drafts out of the public canceled lifecycle", async () => {
    const draftSetup = managementTransaction(
      managedEventRow({ status: EventStatus.DRAFT }),
    );

    await expect(
      draftSetup.service.cancelEvent("event-1", leaderPrincipal),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "EVENT_CANCELLATION_NOT_ALLOWED" } },
    });
    expect(draftSetup.transaction.eventMember.findMany).not.toHaveBeenCalled();
    expect(draftSetup.transaction.event.update).not.toHaveBeenCalled();
  });

  it("rejects ordinary members before any event management query or transaction", async () => {
    const prisma = {
      $transaction: vi.fn(),
      user: { findUnique: vi.fn() },
      club: { findMany: vi.fn() },
    } as unknown as PrismaService;
    const service = new EventsService(prisma);
    const member = { ...leaderPrincipal, role: UserRole.MEMBER };

    await expect(
      service.create(eventManagerInput, member, "event-create-member-key"),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: { code: "EVENT_MANAGER_ROLE_REQUIRED" } },
    });
    await expect(
      service.managedClubs(member, { limit: 50 }),
    ).rejects.toMatchObject({ status: 403 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed if the database role changed after authentication", async () => {
    const setup = managementTransaction();
    setup.transaction.user.findUnique.mockResolvedValue({
      onboardingCompletedAt: new Date("2026-07-29T00:00:00.000Z"),
      role: UserRole.MEMBER,
      status: UserStatus.ACTIVE,
    });

    await expect(
      setup.service.update(
        "event-1",
        updateEventSchema.parse({ title: "권한 변경 후 수정" }),
        leaderPrincipal,
      ),
    ).rejects.toMatchObject({
      status: 403,
      response: { error: { code: "EVENT_MANAGER_SESSION_STALE" } },
    });
    expect(setup.transaction.event.findUnique).not.toHaveBeenCalled();
    expect(setup.transaction.event.update).not.toHaveBeenCalled();
  });
});

describe("EventsService managed club and draft reads", () => {
  it("lists only active clubs owned by a leader and returns private draft detail", async () => {
    const clubFindMany = vi.fn().mockResolvedValue([
      { id: "club-1", slug: "slow-hiking", title: "천천히 걷는 산길" },
    ]);
    const eventFindFirst = vi.fn().mockResolvedValue(managedEventRow());
    const service = new EventsService({
      user: {
        findUnique: vi.fn().mockResolvedValue({
          onboardingCompletedAt: new Date("2026-07-29T00:00:00.000Z"),
          role: UserRole.LEADER,
          status: UserStatus.ACTIVE,
        }),
      },
      club: { findMany: clubFindMany },
      event: { findFirst: eventFindFirst },
    } as unknown as PrismaService);

    await expect(
      service.managedClubs(leaderPrincipal, { limit: 50 }),
    ).resolves.toMatchObject({
      data: [{ id: "club-1", slug: "slow-hiking" }],
      page: { hasNextPage: false, nextCursor: null },
    });
    expect(clubFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: ClubStatus.ACTIVE,
          leaderId: leaderPrincipal.userId,
        }),
      }),
    );

    await expect(
      service.managedDetail("event-1", leaderPrincipal),
    ).resolves.toMatchObject({ id: "event-1", status: EventStatus.DRAFT });
    expect(eventFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "event-1",
          club: {
            status: ClubStatus.ACTIVE,
            leaderId: leaderPrincipal.userId,
          },
        },
      }),
    );
  });

  it("lists owned drafts newest-first with a view-bound updatedAt cursor", async () => {
    const row = (id: string, updatedAt: string) => ({
      id,
      title: `작성 중 모임 ${id}`,
      startAt: new Date("2099-08-01T00:00:00.000Z"),
      endAt: null,
      locationName: "북한산 안내소",
      capacity: 20,
      status: EventStatus.DRAFT,
      updatedAt: new Date(updatedAt),
      club: { slug: "slow-hiking", title: "천천히 걷는 산길" },
      _count: { participants: 0 },
    });
    const findMany = vi.fn().mockResolvedValue([
      row("event-2", "2026-07-30T02:00:00.000Z"),
      row("event-1", "2026-07-30T01:00:00.000Z"),
    ]);
    const groupBy = vi.fn();
    const service = new EventsService({
      user: {
        findUnique: vi.fn().mockResolvedValue({
          onboardingCompletedAt: new Date("2026-07-29T00:00:00.000Z"),
          role: UserRole.LEADER,
          status: UserStatus.ACTIVE,
        }),
      },
      event: { findMany },
      eventMember: { groupBy },
    } as unknown as PrismaService);

    const first = await service.managedEvents(leaderPrincipal, {
      limit: 1,
      view: "drafts",
    });
    expect(findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        club: {
          status: ClubStatus.ACTIVE,
          leaderId: leaderPrincipal.userId,
        },
        status: EventStatus.DRAFT,
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 2,
    });
    expect(groupBy).not.toHaveBeenCalled();
    expect(first.page).toMatchObject({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });

    findMany.mockResolvedValueOnce([]);
    await service.managedEvents(leaderPrincipal, {
      limit: 1,
      view: "drafts",
      cursor: first.page.nextCursor!,
    });
    expect(findMany.mock.calls[1]![0].where.OR).toEqual([
      { updatedAt: { lt: new Date("2026-07-30T02:00:00.000Z") } },
      {
        updatedAt: new Date("2026-07-30T02:00:00.000Z"),
        id: { lt: "event-2" },
      },
    ]);

    await expect(
      service.managedEvents(leaderPrincipal, {
        limit: 1,
        view: "upcoming",
        cursor: first.page.nextCursor!,
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
});
