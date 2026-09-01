import { createHash } from "node:crypto";

import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import {
  ApprovalMode,
  AttendanceStatus,
  ClubMemberRole,
  ClubMemberStatus,
  ClubStatus,
  EventMemberStatus,
  EventStatus,
  NotificationType,
  Prisma,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  ApplicationDecisionInput,
  AttendanceUpdateInput,
  CreateEventInput,
  EventListQuery,
  LeaderApplicationListQuery,
  ManagedClubListQuery,
  ManagedEventListQuery,
  UpdateEventInput,
} from "./events.contracts";

type EventCursor = { startAt: string; id: string };
type ApplicationCursor = { appliedAt: string; id: string };
type ManagedClubCursor = { title: string; id: string };
type ManagedEventView = ManagedEventListQuery["view"];
type ManagedEventCursor = {
  startAt?: string;
  updatedAt?: string;
  id: string;
  view: ManagedEventView;
};
type DecodedManagedEventCursor = { sortAt: string; id: string };
type ApplicationDeliveryInput = {
  notificationId: string;
  applicationId: string;
  recipientUserId: string;
  email: string | null;
  eventId: string;
  eventTitle: string;
  status: EventMemberStatus;
  version: Date;
};

const activeOperatorClubMemberFilter = {
  status: ClubMemberStatus.ACTIVE,
  role: { in: [ClubMemberRole.LEADER, ClubMemberRole.MODERATOR] },
  user: { role: UserRole.LEADER, status: UserStatus.ACTIVE },
};

const publicEventSelect = {
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
      participants: { where: { status: EventMemberStatus.APPROVED } },
    },
  },
} satisfies Prisma.EventSelect;

type PublicEventRow = Prisma.EventGetPayload<{
  select: typeof publicEventSelect;
}>;

const managedEventResponseSelect = {
  ...publicEventSelect,
  clubId: true,
  updatedAt: true,
} satisfies Prisma.EventSelect;

type ManagedEventResponseRow = Prisma.EventGetPayload<{
  select: typeof managedEventResponseSelect;
}>;

const managedEventDetailSelect = {
  ...managedEventResponseSelect,
  club: {
    select: {
      ...publicEventSelect.club.select,
      leaderId: true,
      status: true,
      leader: {
        select: {
          ...publicEventSelect.club.select.leader.select,
          role: true,
          status: true,
        },
      },
      members: {
        where: activeOperatorClubMemberFilter,
        select: { userId: true },
      },
    },
  },
} satisfies Prisma.EventSelect;

type ManagedEventDetailRow = Prisma.EventGetPayload<{
  select: typeof managedEventDetailSelect;
}>;

const managedEventSelect = {
  id: true,
  title: true,
  startAt: true,
  endAt: true,
  locationName: true,
  capacity: true,
  status: true,
  updatedAt: true,
  club: { select: { slug: true, title: true } },
  _count: {
    select: {
      participants: { where: { status: EventMemberStatus.APPROVED } },
    },
  },
} satisfies Prisma.EventSelect;

const operatorClubMemberFilter = (userId: string) => ({
  userId,
  ...activeOperatorClubMemberFilter,
});

const operatorClubFilter = (userId: string) => ({
  OR: [
    { leaderId: userId },
    { members: { some: operatorClubMemberFilter(userId) } },
  ],
});

const decisionApplicationSelect = () =>
  ({
    id: true,
    eventId: true,
    userId: true,
    status: true,
    attendance: true,
    appliedAt: true,
    decidedAt: true,
    canceledAt: true,
    updatedAt: true,
    event: {
      select: {
        title: true,
        capacity: true,
        startAt: true,
        status: true,
        club: {
          select: {
            leaderId: true,
            leader: { select: { role: true, status: true } },
            members: {
              where: activeOperatorClubMemberFilter,
              select: { id: true, userId: true },
            },
          },
        },
      },
    },
    user: { select: { email: true } },
  }) satisfies Prisma.EventMemberSelect;

function encodeCursor(cursor: EventCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): EventCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<EventCursor>;
    if (
      typeof parsed.startAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.startAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    ) {
      return null;
    }
    return { startAt: parsed.startAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeManagedEventCursor(cursor: ManagedEventCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeManagedEventCursor(
  value: string | undefined,
  view: ManagedEventView,
): DecodedManagedEventCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ManagedEventCursor>;
    const sortAt = view === "drafts" ? parsed.updatedAt : parsed.startAt;
    if (
      typeof sortAt !== "string" ||
      !Number.isFinite(Date.parse(sortAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128 ||
      (parsed.view !== undefined && parsed.view !== view) ||
      (parsed.view === undefined && view !== "upcoming")
    ) {
      return null;
    }
    return { sortAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeApplicationCursor(cursor: ApplicationCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeApplicationCursor(
  value: string | undefined,
): ApplicationCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ApplicationCursor>;
    if (
      typeof parsed.appliedAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.appliedAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    ) {
      return null;
    }
    return { appliedAt: parsed.appliedAt, id: parsed.id };
  } catch {
    return null;
  }
}

function encodeManagedClubCursor(cursor: ManagedClubCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeManagedClubCursor(
  value: string | undefined,
): ManagedClubCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ManagedClubCursor>;
    if (
      typeof parsed.title !== "string" ||
      parsed.title.length < 1 ||
      parsed.title.length > 200 ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    ) {
      return null;
    }
    return { title: parsed.title, id: parsed.id };
  } catch {
    return null;
  }
}

function idempotencyHash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

function ageGroup(birthYear: number | null) {
  if (!birthYear) return null;
  const age = Math.max(new Date().getUTCFullYear() - birthYear, 0);
  return `${Math.floor(age / 10) * 10}대`;
}

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: EventListQuery) {
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "목록 위치 정보가 올바르지 않습니다.",
      );
    }
    const cursorDate = cursor ? new Date(cursor.startAt) : null;
    const now = new Date();
    const sortDirection = query.view === "past" ? "desc" : "asc";
    const andFilters: Prisma.EventWhereInput[] = [];
    if (query.q) {
      andFilters.push({
        OR: [
          { title: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
          { locationName: { contains: query.q, mode: "insensitive" } },
        ],
      });
    }
    if (cursor && cursorDate) {
      andFilters.push({
        OR: [
          {
            startAt:
              sortDirection === "desc"
                ? { lt: cursorDate }
                : { gt: cursorDate },
          },
          {
            startAt: cursorDate,
            id:
              sortDirection === "desc" ? { lt: cursor.id } : { gt: cursor.id },
          },
        ],
      });
    }

    const visibilityFilter: Prisma.EventWhereInput =
      query.view === "upcoming"
        ? {
            status: {
              in: [
                EventStatus.PUBLISHED,
                EventStatus.CLOSED,
                EventStatus.CANCELED,
              ],
            },
            startAt: { gte: now },
          }
        : query.view === "past"
          ? {
              OR: [
                { status: EventStatus.COMPLETED },
                {
                  status: {
                    in: [
                      EventStatus.PUBLISHED,
                      EventStatus.CLOSED,
                      EventStatus.CANCELED,
                    ],
                  },
                  startAt: { lt: now },
                },
              ],
            }
          : {
              status: {
                in: [
                  EventStatus.PUBLISHED,
                  EventStatus.CLOSED,
                  EventStatus.COMPLETED,
                  EventStatus.CANCELED,
                ],
              },
            };
    const where: Prisma.EventWhereInput = {
      ...(query.category
        ? { club: { interest: { slug: query.category } } }
        : {}),
      ...(query.region
        ? {
            OR: [
              { club: { region: { contains: query.region, mode: "insensitive" } } },
              { address: { contains: query.region, mode: "insensitive" } },
              { locationName: { contains: query.region, mode: "insensitive" } },
            ],
          }
        : {}),
      AND: [visibilityFilter, ...andFilters],
    };

    const rows = await this.prisma.event.findMany({
      where,
      take: query.limit + 1,
      orderBy: [
        { startAt: sortDirection },
        { id: sortDirection },
      ],
      select: publicEventSelect,
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page.map((event) => this.toEventCard(event)),
      page: {
        nextCursor:
          hasNextPage && last
            ? encodeCursor({ startAt: last.startAt.toISOString(), id: last.id })
            : null,
        hasNextPage,
      },
    };
  }

  async detail(id: string) {
    const event = await this.prisma.event.findFirst({
      where: {
        id,
        status: {
          in: [
            EventStatus.PUBLISHED,
            EventStatus.CLOSED,
            EventStatus.COMPLETED,
            EventStatus.CANCELED,
          ],
        },
      },
      select: publicEventSelect,
    });
    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "EVENT_NOT_FOUND",
        "모임을 찾을 수 없습니다.",
      );
    }
    return this.toEventCard(event);
  }

  async managedClubs(
    principal: AuthenticatedPrincipal,
    query: ManagedClubListQuery = { limit: 50 },
  ) {
    this.assertEventManagerRole(principal);
    await this.assertOnboardedEventManager(this.prisma, principal);

    const cursor = decodeManagedClubCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "목록 위치 정보가 올바르지 않습니다.",
      );
    }

    const rows = await this.prisma.club.findMany({
      where: {
        status: ClubStatus.ACTIVE,
        ...(principal.role === UserRole.ADMIN
          ? {}
          : { leaderId: principal.userId }),
        ...(cursor
          ? {
              OR: [
                { title: { gt: cursor.title } },
                { title: cursor.title, id: { gt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      select: { id: true, slug: true, title: true },
    });
    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    return {
      data: page,
      page: {
        nextCursor:
          hasNextPage && last
            ? encodeManagedClubCursor({ title: last.title, id: last.id })
            : null,
        hasNextPage,
      },
    };
  }

  async managedDetail(id: string, principal: AuthenticatedPrincipal) {
    this.assertEventManagerRole(principal);
    await this.assertOnboardedEventManager(this.prisma, principal);

    const event = await this.prisma.event.findFirst({
      where: {
        id,
        club: {
          status: ClubStatus.ACTIVE,
          ...(principal.role === UserRole.ADMIN
            ? {}
            : { leaderId: principal.userId }),
        },
      },
      select: managedEventDetailSelect,
    });
    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "MANAGED_EVENT_NOT_FOUND",
        "관리할 수 있는 모임을 찾을 수 없습니다.",
      );
    }
    return this.toManagedEventCard(event);
  }

  async create(
    input: CreateEventInput,
    principal: AuthenticatedPrincipal,
    key: string,
  ) {
    this.assertEventManagerRole(principal);
    const route = "/v1/events";
    const requestHash = idempotencyHash(
      `${principal.userId}:event-create:${JSON.stringify(input)}`,
    );

    return this.prisma.$transaction(async (transaction) => {
      await this.lockAndAssertOnboardedEventManager(transaction, principal);
      const previousRequest = await transaction.idempotencyRecord.findUnique({
        where: { userId_route_key: { userId: principal.userId, route, key } },
      });
      if (previousRequest) {
        if (previousRequest.requestHash !== requestHash) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "IDEMPOTENCY_KEY_REUSED",
            "같은 요청 식별자가 다른 모임 생성 요청에 사용되었습니다.",
          );
        }
        if (previousRequest.completedAt && previousRequest.responseBody) {
          return previousRequest.responseBody;
        }
        throw new ApiException(
          HttpStatus.CONFLICT,
          "REQUEST_IN_PROGRESS",
          "같은 모임 생성 요청을 처리하고 있습니다. 잠시 후 확인해 주세요.",
        );
      }
      const now = new Date();
      await transaction.idempotencyRecord.create({
        data: {
          userId: principal.userId,
          route,
          key,
          requestHash,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
        },
      });
      await transaction.$queryRaw`
        SELECT "id" FROM "clubs" WHERE "id" = ${input.clubId} FOR UPDATE
      `;
      const club = await transaction.club.findUnique({
        where: { id: input.clubId },
        select: { id: true, leaderId: true, status: true },
      });
      if (!club || !this.canManageEventClub(principal, club)) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "MANAGED_CLUB_NOT_FOUND",
          "모임을 만들 수 있는 커뮤니티를 찾을 수 없습니다.",
        );
      }

      const schedule = {
        startAt: new Date(input.startAt),
        endAt: input.endAt ? new Date(input.endAt) : null,
        registrationDeadline: input.registrationDeadline
          ? new Date(input.registrationDeadline)
          : null,
      };
      this.assertValidEventSchedule(schedule, now, Boolean(schedule.registrationDeadline));

      const event = await transaction.event.create({
        data: {
          clubId: club.id,
          creatorId: principal.userId,
          title: input.title,
          description: input.description,
          coverImageUrl: input.coverImageUrl ?? null,
          locationName: input.locationName,
          address: input.address,
          mapUrl: input.mapUrl ?? null,
          ...schedule,
          capacity: input.capacity,
          price: input.price,
          currency: "KRW",
          difficulty: input.difficulty,
          supplies: input.supplies || null,
          approvalMode: input.approvalMode,
          status: input.publish ? EventStatus.PUBLISHED : EventStatus.DRAFT,
        },
        select: managedEventResponseSelect,
      });
      const response = this.toManagedEventCard(event);
      await transaction.idempotencyRecord.update({
        where: { userId_route_key: { userId: principal.userId, route, key } },
        data: {
          responseStatus: 201,
          responseBody: response,
          completedAt: now,
        },
      });
      return response;
    });
  }

  async update(
    eventId: string,
    input: UpdateEventInput,
    principal: AuthenticatedPrincipal,
  ) {
    this.assertEventManagerRole(principal);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockAndAssertOnboardedEventManager(transaction, principal);
      const current = await this.lockManagedEvent(
        transaction,
        eventId,
        principal,
      );
      const now = new Date();
      if (
        current.status === EventStatus.CANCELED ||
        current.status === EventStatus.COMPLETED
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EVENT_UPDATE_NOT_ALLOWED",
          "취소되거나 종료된 모임은 수정할 수 없습니다.",
        );
      }
      if (current.status !== EventStatus.DRAFT && current.startAt <= now) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EVENT_UPDATE_CLOSED",
          "시작한 모임은 수정할 수 없습니다.",
        );
      }

      const schedule = {
        startAt: input.startAt ? new Date(input.startAt) : current.startAt,
        endAt:
          input.endAt === undefined
            ? current.endAt
            : input.endAt
              ? new Date(input.endAt)
              : null,
        registrationDeadline:
          input.registrationDeadline === undefined
            ? current.registrationDeadline
            : input.registrationDeadline
              ? new Date(input.registrationDeadline)
              : null,
      };
      this.assertValidEventSchedule(
        schedule,
        now,
        input.registrationDeadline !== undefined &&
          input.registrationDeadline !== null,
      );

      if (input.capacity !== undefined) {
        const activeApplicationCount = await transaction.eventMember.count({
          where: {
            eventId,
            status: {
              in: [EventMemberStatus.PENDING, EventMemberStatus.APPROVED],
            },
          },
        });
        if (input.capacity < activeApplicationCount) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "CAPACITY_BELOW_APPLICATION_COUNT",
            "승인 대기 및 승인된 신청자 수보다 정원을 줄일 수 없습니다.",
            { minimumCapacity: activeApplicationCount },
          );
        }
      }

      const data: Prisma.EventUpdateInput = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        ...(input.coverImageUrl !== undefined
          ? { coverImageUrl: input.coverImageUrl }
          : {}),
        ...(input.locationName !== undefined
          ? { locationName: input.locationName }
          : {}),
        ...(input.address !== undefined ? { address: input.address } : {}),
        ...(input.mapUrl !== undefined ? { mapUrl: input.mapUrl } : {}),
        ...(input.startAt !== undefined ? { startAt: schedule.startAt } : {}),
        ...(input.endAt !== undefined ? { endAt: schedule.endAt } : {}),
        ...(input.registrationDeadline !== undefined
          ? { registrationDeadline: schedule.registrationDeadline }
          : {}),
        ...(input.capacity !== undefined ? { capacity: input.capacity } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.difficulty !== undefined
          ? { difficulty: input.difficulty }
          : {}),
        ...(input.supplies !== undefined
          ? { supplies: input.supplies || null }
          : {}),
        ...(input.approvalMode !== undefined
          ? { approvalMode: input.approvalMode }
          : {}),
      };
      const updated = await transaction.event.update({
        where: { id: eventId },
        data,
        select: managedEventResponseSelect,
      });
      return this.toManagedEventCard(updated);
    });
  }

  async publish(eventId: string, principal: AuthenticatedPrincipal) {
    this.assertEventManagerRole(principal);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockAndAssertOnboardedEventManager(transaction, principal);
      const current = await this.lockManagedEvent(
        transaction,
        eventId,
        principal,
      );
      if (current.status === EventStatus.PUBLISHED) {
        return this.toManagedEventCard(current);
      }
      if (current.status !== EventStatus.DRAFT) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EVENT_PUBLISH_NOT_ALLOWED",
          "작성 중인 모임만 게시할 수 있습니다.",
        );
      }

      this.assertValidEventSchedule(
        {
          startAt: current.startAt,
          endAt: current.endAt,
          registrationDeadline: current.registrationDeadline,
        },
        new Date(),
        Boolean(current.registrationDeadline),
      );
      const published = await transaction.event.update({
        where: { id: eventId },
        data: { status: EventStatus.PUBLISHED },
        select: managedEventResponseSelect,
      });
      return this.toManagedEventCard(published);
    });
  }

  async cancelEvent(eventId: string, principal: AuthenticatedPrincipal) {
    this.assertEventManagerRole(principal);

    return this.prisma.$transaction(async (transaction) => {
      await this.lockAndAssertOnboardedEventManager(transaction, principal);
      const current = await this.lockManagedEvent(
        transaction,
        eventId,
        principal,
      );
      if (current.status === EventStatus.CANCELED) {
        return this.toManagedEventCard(current);
      }

      if (
        current.status !== EventStatus.PUBLISHED &&
        current.status !== EventStatus.CLOSED
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EVENT_CANCELLATION_NOT_ALLOWED",
          "게시된 모임만 취소할 수 있습니다.",
        );
      }

      const now = new Date();
      if (current.startAt <= now) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EVENT_CANCELLATION_CLOSED",
          "시작 전인 모임만 취소할 수 있습니다.",
        );
      }

      const applications = await transaction.eventMember.findMany({
        where: {
          eventId,
          status: {
            in: [EventMemberStatus.PENDING, EventMemberStatus.APPROVED],
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          user: { select: { email: true } },
        },
      });
      if (applications.length > 0) {
        await transaction.eventMember.updateMany({
          where: { id: { in: applications.map(({ id }) => id) } },
          data: {
            status: EventMemberStatus.CANCELED,
            canceledAt: now,
          },
        });
        await transaction.eventMemberTransition.createMany({
          data: applications.map((application) => ({
            eventMemberId: application.id,
            actorId: principal.userId,
            fromStatus: application.status,
            toStatus: EventMemberStatus.CANCELED,
            reason: "event_cancellation",
            metadata: { eventId },
          })),
        });

        const operatorUserIds = new Set([
          ...current.club.members.map(({ userId }) => userId),
          ...(current.club.leader.role === UserRole.LEADER &&
          current.club.leader.status === UserStatus.ACTIVE
            ? [current.club.leaderId]
            : []),
        ]);
        const revokedChatUserIds = applications
          .filter(
            (application) =>
              application.status === EventMemberStatus.APPROVED &&
              !operatorUserIds.has(application.userId),
          )
          .map(({ userId }) => userId);
        if (revokedChatUserIds.length > 0) {
          await transaction.chatRoomMember.updateMany({
            where: {
              userId: { in: revokedChatUserIds },
              leftAt: null,
              room: { eventId },
            },
            data: { leftAt: now },
          });
        }

        const cancellationNotifications = applications.map((application) => ({
          id: `event-cancel:${application.id}`,
          recipientId: application.userId,
          actorId: principal.userId,
          type: NotificationType.SYSTEM,
          title: "모임이 취소됐어요",
          body: current.title,
          link: `/events/${eventId}`,
          payload: {
            eventId,
            applicationId: application.id,
            reason: "event_cancellation",
          },
        }));
        await transaction.notification.createMany({
          data: cancellationNotifications,
        });
        await this.queueApplicationDeliveries(
          transaction,
          applications.map((application, index) => ({
            notificationId: cancellationNotifications[index]!.id,
            applicationId: application.id,
            recipientUserId: application.userId,
            email: application.user.email,
            eventId,
            eventTitle: current.title,
            status: EventMemberStatus.CANCELED,
            version: now,
          })),
        );
      }

      const canceled = await transaction.event.update({
        where: { id: eventId },
        data: { status: EventStatus.CANCELED },
        select: managedEventResponseSelect,
      });
      return this.toManagedEventCard(canceled);
    });
  }

  async apply(eventId: string, principal: AuthenticatedPrincipal, key: string) {
    const route = `/v1/events/${eventId}/applications`;
    const requestHash = idempotencyHash(`${principal.userId}:${eventId}:apply`);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE
      `;
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        include: {
          club: {
            select: {
              leaderId: true,
              leader: { select: { role: true, status: true } },
              members: {
                where: activeOperatorClubMemberFilter,
                select: { userId: true },
              },
            },
          },
        },
      });
      if (!event || event.status !== EventStatus.PUBLISHED) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "EVENT_NOT_AVAILABLE",
          "현재 신청할 수 없는 모임입니다.",
        );
      }
      const now = new Date();
      if (
        event.startAt <= now ||
        (event.registrationDeadline && event.registrationDeadline <= now)
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "APPLICATION_CLOSED",
          "모임 신청이 마감되었습니다.",
        );
      }

      const user = await transaction.user.findUniqueOrThrow({
        where: { id: principal.userId },
        select: { email: true, onboardingCompletedAt: true },
      });
      if (!user.onboardingCompletedAt) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "PROFILE_ONBOARDING_REQUIRED",
          "모임을 신청하려면 먼저 프로필 설정을 완료해 주세요.",
        );
      }

      const previousRequest = await transaction.idempotencyRecord.findUnique({
        where: { userId_route_key: { userId: principal.userId, route, key } },
      });
      if (previousRequest) {
        if (previousRequest.requestHash !== requestHash) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "IDEMPOTENCY_KEY_REUSED",
            "같은 요청 식별자가 다른 요청에 사용되었습니다.",
          );
        }
        if (previousRequest.completedAt && previousRequest.responseBody) {
          return previousRequest.responseBody;
        }
        throw new ApiException(
          HttpStatus.CONFLICT,
          "REQUEST_IN_PROGRESS",
          "같은 신청을 처리하고 있습니다. 잠시 후 확인해 주세요.",
        );
      }
      await transaction.idempotencyRecord.create({
        data: {
          userId: principal.userId,
          route,
          key,
          requestHash,
          expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1_000),
        },
      });

      const approvedCount = await transaction.eventMember.count({
        where: { eventId, status: EventMemberStatus.APPROVED },
      });
      if (approvedCount >= event.capacity) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "EVENT_FULL",
          "모임 정원이 모두 찼습니다.",
        );
      }

      const nextStatus =
        event.approvalMode === ApprovalMode.AUTO
          ? EventMemberStatus.APPROVED
          : EventMemberStatus.PENDING;
      const existing = await transaction.eventMember.findUnique({
        where: { eventId_userId: { eventId, userId: principal.userId } },
      });
      if (
        existing &&
        (existing.status === EventMemberStatus.PENDING ||
          existing.status === EventMemberStatus.APPROVED)
      ) {
        const response = this.toApplication(existing);
        await transaction.idempotencyRecord.update({
          where: { userId_route_key: { userId: principal.userId, route, key } },
          data: {
            responseStatus: 200,
            responseBody: response,
            completedAt: now,
          },
        });
        return response;
      }

      const application = existing
        ? await transaction.eventMember.update({
            where: { id: existing.id },
            data: {
              status: nextStatus,
              attendance: AttendanceStatus.NOT_CHECKED,
              appliedAt: now,
              decidedAt: nextStatus === EventMemberStatus.APPROVED ? now : null,
              canceledAt: null,
              reviewedById: null,
              checkedInAt: null,
              checkedInById: null,
            },
          })
        : await transaction.eventMember.create({
            data: {
              eventId,
              userId: principal.userId,
              status: nextStatus,
              decidedAt: nextStatus === EventMemberStatus.APPROVED ? now : null,
            },
          });
      await transaction.eventMemberTransition.create({
        data: {
          eventMemberId: application.id,
          actorId: principal.userId,
          fromStatus: existing?.status ?? null,
          toStatus: nextStatus,
          reason: "member_application",
        },
      });

      if (nextStatus === EventMemberStatus.APPROVED) {
        const chatMemberIds = new Set([
          principal.userId,
          ...event.club.members.map((member) => member.userId),
          ...(event.club.leader.role === UserRole.LEADER &&
          event.club.leader.status === UserStatus.ACTIVE
            ? [event.club.leaderId]
            : []),
        ]);
        for (const userId of chatMemberIds) {
          await this.ensureChatMembership(transaction, eventId, userId);
        }
      }
      const notification = await transaction.notification.create({
        data: {
          recipientId: principal.userId,
          type:
            nextStatus === EventMemberStatus.APPROVED
              ? NotificationType.APPLICATION_APPROVED
              : NotificationType.SYSTEM,
          title:
            nextStatus === EventMemberStatus.APPROVED
              ? "모임 신청이 승인됐어요"
              : "모임 신청을 접수했어요",
          body: `${event.title} 신청 상태를 확인해 주세요.`,
          link: `/events/${event.id}`,
        },
      });
      await this.queueApplicationDelivery(transaction, {
        notificationId: notification.id,
        applicationId: application.id,
        recipientUserId: principal.userId,
        email: user.email,
        eventId: event.id,
        eventTitle: event.title,
        status: nextStatus,
        version: application.updatedAt,
      });

      const response = this.toApplication(application);
      await transaction.idempotencyRecord.update({
        where: { userId_route_key: { userId: principal.userId, route, key } },
        data: { responseStatus: 201, responseBody: response, completedAt: now },
      });
      return response;
    });
  }

  async cancel(eventId: string, principal: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE
      `;
      const event = await transaction.event.findUnique({
        where: { id: eventId },
        select: {
          status: true,
          startAt: true,
          club: {
            select: {
              leaderId: true,
              leader: { select: { role: true, status: true } },
              members: {
                where: operatorClubMemberFilter(principal.userId),
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      });
      if (!event) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "EVENT_NOT_FOUND",
          "모임을 찾을 수 없습니다.",
        );
      }
      const application = await transaction.eventMember.findUnique({
        where: { eventId_userId: { eventId, userId: principal.userId } },
      });
      if (!application) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "APPLICATION_NOT_FOUND",
          "신청 내역을 찾을 수 없습니다.",
        );
      }
      if (application.status === EventMemberStatus.CANCELED) {
        return this.toApplication(application);
      }
      if (
        application.status !== EventMemberStatus.PENDING &&
        application.status !== EventMemberStatus.APPROVED
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "INVALID_APPLICATION_STATE",
          "승인 대기 또는 승인된 신청만 취소할 수 있습니다.",
        );
      }
      const now = new Date();
      if (
        (event.status !== EventStatus.PUBLISHED &&
          event.status !== EventStatus.CLOSED) ||
        event.startAt <= now
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "APPLICATION_CANCELLATION_CLOSED",
          "시작 전인 모임의 신청만 취소할 수 있습니다.",
        );
      }
      const updated = await transaction.eventMember.update({
        where: { id: application.id },
        data: { status: EventMemberStatus.CANCELED, canceledAt: now },
      });
      await transaction.eventMemberTransition.create({
        data: {
          eventMemberId: application.id,
          actorId: principal.userId,
          fromStatus: application.status,
          toStatus: EventMemberStatus.CANCELED,
          reason: "member_cancellation",
        },
      });
      if (application.status === EventMemberStatus.APPROVED) {
        const remainsOperator =
          (event.club.leaderId === principal.userId &&
            event.club.leader.role === UserRole.LEADER &&
            event.club.leader.status === UserStatus.ACTIVE) ||
          event.club.members.length > 0;
        if (!remainsOperator) {
          await transaction.chatRoomMember.updateMany({
            where: {
              userId: principal.userId,
              leftAt: null,
              room: { eventId },
            },
            data: { leftAt: now },
          });
        }
      }
      return this.toApplication(updated);
    });
  }

  async myApplication(eventId: string, principal: AuthenticatedPrincipal) {
    const application = await this.prisma.eventMember.findUnique({
      where: {
        eventId_userId: { eventId, userId: principal.userId },
      },
    });
    return {
      application: application ? this.toApplication(application) : null,
    };
  }

  async myApplications(principal: AuthenticatedPrincipal) {
    const rows = await this.prisma.eventMember.findMany({
      where: { userId: principal.userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        event: {
          select: {
            id: true,
            title: true,
            startAt: true,
            locationName: true,
            club: { select: { slug: true, title: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      ...this.toApplication(row),
      event: { ...row.event, startAt: row.event.startAt.toISOString() },
    }));
  }

  async managedEvents(
    principal: AuthenticatedPrincipal,
    query: ManagedEventListQuery = { limit: 20, view: "upcoming" },
  ) {
    this.assertOperatorRole(principal);
    if (query.view === "drafts") {
      await this.assertOnboardedEventManager(this.prisma, principal);
    }
    const cursor = decodeManagedEventCursor(query.cursor, query.view);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "목록 위치 정보가 올바르지 않습니다.",
      );
    }
    const now = new Date();
    const recentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
    const cursorDate = cursor ? new Date(cursor.sortAt) : null;
    const sortDirection =
      query.view === "attendance" || query.view === "drafts" ? "desc" : "asc";
    const sortField = query.view === "drafts" ? "updatedAt" : "startAt";
    const cursorFilter: Prisma.EventWhereInput | null =
      cursor && cursorDate
        ? {
            OR: [
              {
                [sortField]:
                  sortDirection === "desc"
                    ? { lt: cursorDate }
                    : { gt: cursorDate },
              },
              {
                [sortField]: cursorDate,
                id:
                  sortDirection === "desc"
                    ? { lt: cursor.id }
                    : { gt: cursor.id },
              },
            ],
          }
        : null;
    const visibilityFilter: Prisma.EventWhereInput =
      query.view === "drafts"
        ? {
            status: EventStatus.DRAFT,
            ...(cursorFilter ?? {}),
          }
        : query.view === "attendance"
        ? {
            status: {
              in: [
                EventStatus.PUBLISHED,
                EventStatus.CLOSED,
                EventStatus.COMPLETED,
              ],
            },
            startAt: { lte: now },
            AND: [
              {
                OR: [
                  { endAt: { gte: now } },
                  { startAt: { gte: recentCutoff } },
                ],
              },
              ...(cursorFilter ? [cursorFilter] : []),
            ],
          }
        : {
            status: { in: [EventStatus.PUBLISHED, EventStatus.CLOSED] },
            startAt: { gte: now },
            ...(cursorFilter ?? {}),
          };
    const rows = await this.prisma.event.findMany({
      where: {
        ...(query.view === "drafts"
          ? {
              club: {
                status: ClubStatus.ACTIVE,
                ...(principal.role === UserRole.ADMIN
                  ? {}
                  : { leaderId: principal.userId }),
              },
            }
          : principal.role === UserRole.ADMIN
            ? {}
            : { club: operatorClubFilter(principal.userId) }),
        ...visibilityFilter,
      },
      orderBy: [
        { [sortField]: sortDirection },
        { id: sortDirection },
      ],
      take: query.limit + 1,
      select: managedEventSelect,
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const pendingRows = query.view !== "drafts" && page.length
      ? await this.prisma.eventMember.groupBy({
          by: ["eventId"],
          where: {
            eventId: { in: page.map(({ id }) => id) },
            status: EventMemberStatus.PENDING,
          },
          _count: { _all: true },
        })
      : [];
    const pendingCounts = new Map(
      pendingRows.map((row) => [row.eventId, row._count._all]),
    );

    return {
      data: page.map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt?.toISOString() ?? null,
        locationName: event.locationName,
        capacity: event.capacity,
        participantCount: event._count.participants,
        pendingCount: pendingCounts.get(event.id) ?? 0,
        remainingCapacity: Math.max(
          event.capacity - event._count.participants,
          0,
        ),
        status: event.status,
        club: event.club,
      })),
      page: {
        nextCursor:
          hasNextPage && last
            ? encodeManagedEventCursor({
                ...(query.view === "drafts"
                  ? { updatedAt: last.updatedAt.toISOString() }
                  : { startAt: last.startAt.toISOString() }),
                id: last.id,
                view: query.view,
              })
            : null,
        hasNextPage,
      },
    };
  }

  async leaderApplications(
    eventId: string,
    principal: AuthenticatedPrincipal,
    query: LeaderApplicationListQuery = { limit: 50 },
  ) {
    this.assertOperatorRole(principal);
    const cursor = decodeApplicationCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "목록 위치 정보가 올바르지 않습니다.",
      );
    }
    const cursorDate = cursor ? new Date(cursor.appliedAt) : null;
    const event = await this.prisma.event.findFirst({
      where: {
        id: eventId,
        ...(principal.role === UserRole.ADMIN
          ? {}
          : {
              club: operatorClubFilter(principal.userId),
            }),
      },
      select: {
        ...managedEventSelect,
        participants: {
          ...(cursor && cursorDate
            ? {
                where: {
                  OR: [
                    { appliedAt: { lt: cursorDate } },
                    { appliedAt: cursorDate, id: { lt: cursor.id } },
                  ],
                },
              }
            : {}),
          orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
          take: query.limit + 1,
          select: {
            id: true,
            status: true,
            attendance: true,
            appliedAt: true,
            decidedAt: true,
            updatedAt: true,
            user: {
              select: {
                name: true,
                birthYear: true,
                region: true,
                interests: {
                  orderBy: { selectedAt: "asc" },
                  select: {
                    interest: { select: { slug: true, name: true } },
                  },
                },
                _count: {
                  select: {
                    eventMemberships: {
                      where: { attendance: AttendanceStatus.ATTENDED },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "EVENT_NOT_FOUND",
        "담당 모임을 찾을 수 없습니다.",
      );
    }

    const hasNextPage = event.participants.length > query.limit;
    const page = hasNextPage
      ? event.participants.slice(0, query.limit)
      : event.participants;
    const last = page.at(-1);
    const pendingCount = await this.prisma.eventMember.count({
      where: { eventId: event.id, status: EventMemberStatus.PENDING },
    });

    return {
      event: {
        id: event.id,
        title: event.title,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt?.toISOString() ?? null,
        locationName: event.locationName,
        capacity: event.capacity,
        participantCount: event._count.participants,
        pendingCount,
        remainingCapacity: Math.max(
          event.capacity - event._count.participants,
          0,
        ),
        status: event.status,
        club: event.club,
      },
      applications: page.map((application) => ({
        id: application.id,
        status: application.status,
        attendance: application.attendance,
        appliedAt: application.appliedAt.toISOString(),
        decidedAt: application.decidedAt?.toISOString() ?? null,
        updatedAt: application.updatedAt.toISOString(),
        applicant: {
          name: application.user.name,
          ageGroup: ageGroup(application.user.birthYear),
          region: application.user.region,
          interests: application.user.interests.map(
            ({ interest }) => interest,
          ),
          attendedEventCount: application.user._count.eventMemberships,
        },
      })),
      page: {
        nextCursor:
          hasNextPage && last
            ? encodeApplicationCursor({
                appliedAt: last.appliedAt.toISOString(),
                id: last.id,
              })
            : null,
        hasNextPage,
      },
    };
  }

  async decide(
    applicationId: string,
    input: ApplicationDecisionInput,
    principal: AuthenticatedPrincipal,
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const current = await transaction.eventMember.findUnique({
        where: { id: applicationId },
        select: decisionApplicationSelect(),
      });
      if (!current) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "APPLICATION_NOT_FOUND",
          "신청 내역을 찾을 수 없습니다.",
        );
      }
      if (!this.canOperateClub(principal, current.event.club)) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          "LEADER_SCOPE_REQUIRED",
          "담당 모임의 신청만 처리할 수 있습니다.",
        );
      }

      await transaction.$queryRaw`
        SELECT "id" FROM "events" WHERE "id" = ${current.eventId} FOR UPDATE
      `;

      const lockedCurrent = await transaction.eventMember.findUnique({
        where: { id: applicationId },
        select: decisionApplicationSelect(),
      });
      if (!lockedCurrent) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "APPLICATION_NOT_FOUND",
          "신청 내역을 찾을 수 없습니다.",
        );
      }
      if (!this.canOperateClub(principal, lockedCurrent.event.club)) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          "LEADER_SCOPE_REQUIRED",
          "담당 모임의 신청만 처리할 수 있습니다.",
        );
      }
      if (lockedCurrent.status === input.status) {
        return this.toDecision(lockedCurrent);
      }
      if (lockedCurrent.status !== EventMemberStatus.PENDING) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "INVALID_APPLICATION_STATE",
          "승인 대기 중인 신청만 처리할 수 있습니다.",
        );
      }
      if (
        lockedCurrent.event.status !== EventStatus.PUBLISHED ||
        lockedCurrent.event.startAt <= new Date()
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "APPLICATION_DECISION_CLOSED",
          "모집 중이며 시작 전인 모임의 신청만 처리할 수 있습니다.",
        );
      }

      if (input.status === EventMemberStatus.APPROVED) {
        const approvedCount = await transaction.eventMember.count({
          where: {
            eventId: lockedCurrent.eventId,
            status: EventMemberStatus.APPROVED,
          },
        });
        if (approvedCount >= lockedCurrent.event.capacity) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "EVENT_FULL",
            "정원이 가득 차 승인할 수 없습니다.",
          );
        }
      }

      const now = new Date();
      const updated = await transaction.eventMember.update({
        where: { id: lockedCurrent.id },
        data: {
          status: input.status,
          reviewedById: principal.userId,
          decidedAt: now,
          canceledAt: null,
          note: input.reason ?? null,
        },
      });
      await transaction.eventMemberTransition.create({
        data: {
          eventMemberId: lockedCurrent.id,
          actorId: principal.userId,
          fromStatus: lockedCurrent.status,
          toStatus: input.status,
          reason: input.reason ?? "leader_decision",
        },
      });
      if (input.status === EventMemberStatus.APPROVED) {
        const chatMemberIds = new Set([
          lockedCurrent.userId,
          ...lockedCurrent.event.club.members.map((member) => member.userId),
          ...(lockedCurrent.event.club.leader.role === UserRole.LEADER &&
          lockedCurrent.event.club.leader.status === UserStatus.ACTIVE
            ? [lockedCurrent.event.club.leaderId]
            : []),
        ]);
        for (const userId of chatMemberIds) {
          await this.ensureChatMembership(
            transaction,
            lockedCurrent.eventId,
            userId,
          );
        }
      }
      const notification = await transaction.notification.create({
        data: {
          recipientId: lockedCurrent.userId,
          actorId: principal.userId,
          type:
            input.status === EventMemberStatus.APPROVED
              ? NotificationType.APPLICATION_APPROVED
              : NotificationType.APPLICATION_REJECTED,
          title:
            input.status === EventMemberStatus.APPROVED
              ? "모임 신청이 승인됐어요"
              : "모임 신청 결과를 확인해 주세요",
          body: lockedCurrent.event.title,
          link: `/events/${lockedCurrent.eventId}`,
        },
      });
      await this.queueApplicationDelivery(transaction, {
        notificationId: notification.id,
        applicationId: lockedCurrent.id,
        recipientUserId: lockedCurrent.userId,
        email: lockedCurrent.user.email,
        eventId: lockedCurrent.eventId,
        eventTitle: lockedCurrent.event.title,
        status: input.status,
        version: updated.updatedAt,
      });
      return this.toDecision(updated);
    });
  }

  async markAttendance(
    applicationId: string,
    input: AttendanceUpdateInput,
    principal: AuthenticatedPrincipal,
  ) {
    this.assertOperatorRole(principal);

    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "event_members" WHERE "id" = ${applicationId} FOR UPDATE
      `;
      const current = await transaction.eventMember.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          eventId: true,
          userId: true,
          status: true,
          attendance: true,
          checkedInAt: true,
          updatedAt: true,
          event: {
            select: {
              title: true,
              status: true,
              startAt: true,
              endAt: true,
              club: {
                select: {
                  leaderId: true,
                  leader: { select: { role: true, status: true } },
                  members: {
                    where: activeOperatorClubMemberFilter,
                    select: { id: true, userId: true },
                  },
                },
              },
            },
          },
        },
      });
      if (!current) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "APPLICATION_NOT_FOUND",
          "신청 내역을 찾을 수 없습니다.",
        );
      }
      if (!this.canOperateClub(principal, current.event.club)) {
        throw new ApiException(
          HttpStatus.FORBIDDEN,
          "LEADER_SCOPE_REQUIRED",
          "담당 모임의 출석만 처리할 수 있습니다.",
        );
      }
      if (current.status !== EventMemberStatus.APPROVED) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "ATTENDANCE_NOT_ALLOWED",
          "참여가 승인된 회원의 출석만 처리할 수 있습니다.",
        );
      }
      if (current.attendance === input.attendance) {
        return this.toAttendance(current);
      }

      const now = new Date();
      if (
        current.event.startAt > now ||
        current.event.status === EventStatus.DRAFT ||
        current.event.status === EventStatus.CANCELED
      ) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "ATTENDANCE_NOT_OPEN",
          "시작한 모임에서만 출석을 처리할 수 있습니다.",
        );
      }

      if (
        current.attendance === AttendanceStatus.ATTENDED &&
        input.attendance === AttendanceStatus.NO_SHOW
      ) {
        const reviewCount = await transaction.review.count({
          where: { eventId: current.eventId, userId: current.userId },
        });
        if (reviewCount > 0) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "ATTENDANCE_HAS_REVIEW",
            "후기가 작성된 참석 기록은 불참으로 변경할 수 없습니다.",
          );
        }
      }

      const updated = await transaction.eventMember.update({
        where: { id: current.id },
        data: {
          attendance: input.attendance,
          checkedInById: principal.userId,
          checkedInAt: now,
        },
        select: {
          id: true,
          attendance: true,
          checkedInAt: true,
          updatedAt: true,
        },
      });
      await transaction.eventMemberTransition.create({
        data: {
          eventMemberId: current.id,
          actorId: principal.userId,
          fromAttendance: current.attendance,
          toAttendance: input.attendance,
          reason: input.reason ?? "leader_attendance",
        },
      });

      if (input.attendance === AttendanceStatus.ATTENDED) {
        await this.queueReviewRequest(transaction, {
          applicationId: current.id,
          availableAt: current.event.endAt ?? current.event.startAt,
          version: updated.updatedAt,
        });
      }

      return this.toAttendance(updated);
    });
  }

  private async queueReviewRequest(
    transaction: Prisma.TransactionClient,
    input: { applicationId: string; availableAt: Date; version: Date },
  ) {
    await transaction.outboxEvent.createMany({
      data: [
        {
          type: "EVENT_REVIEW_REQUEST_READY",
          aggregateType: "EventMember",
          aggregateId: input.applicationId,
          dedupKey: `review-request:${input.applicationId}:ready:${input.version.toISOString()}`,
          payload: { applicationId: input.applicationId },
          availableAt: input.availableAt,
        },
      ],
      skipDuplicates: true,
    });
  }

  private async queueApplicationDelivery(
    transaction: Prisma.TransactionClient,
    input: ApplicationDeliveryInput,
  ) {
    await this.queueApplicationDeliveries(transaction, [input]);
  }

  private async queueApplicationDeliveries(
    transaction: Prisma.TransactionClient,
    inputs: readonly ApplicationDeliveryInput[],
  ) {
    if (inputs.length === 0) return;
    await transaction.outboxEvent.createMany({
      data: inputs.flatMap((input) => {
        const payload = {
          notificationId: input.notificationId,
          recipientUserId: input.recipientUserId,
          email: input.email,
          eventId: input.eventId,
          eventTitle: input.eventTitle,
          status: input.status,
        };
        const dedup = `application:${input.applicationId}:${input.status}:${input.version.toISOString()}`;
        return [
          ...(input.email
            ? [{
                type: "EVENT_APPLICATION_EMAIL",
                aggregateType: "EventMember",
                aggregateId: input.applicationId,
                dedupKey: `${dedup}:email`,
                payload,
              }]
            : []),
          {
            type: "EVENT_APPLICATION_PUSH",
            aggregateType: "EventMember",
            aggregateId: input.applicationId,
            dedupKey: `${dedup}:push`,
            payload,
          },
        ];
      }),
    });
  }

  private assertEventManagerRole(principal: AuthenticatedPrincipal) {
    if (
      principal.role !== UserRole.LEADER &&
      principal.role !== UserRole.ADMIN
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "EVENT_MANAGER_ROLE_REQUIRED",
        "리더 또는 관리자만 모임을 관리할 수 있습니다.",
      );
    }
  }

  private async assertOnboardedEventManager(
    database: Pick<Prisma.TransactionClient, "user">,
    principal: AuthenticatedPrincipal,
  ) {
    const user = await database.user.findUnique({
      where: { id: principal.userId },
      select: { onboardingCompletedAt: true, role: true, status: true },
    });
    if (
      !user ||
      user.status !== UserStatus.ACTIVE ||
      user.role !== principal.role ||
      (user.role !== UserRole.LEADER && user.role !== UserRole.ADMIN)
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "EVENT_MANAGER_SESSION_STALE",
        "권한이 변경되었습니다. 다시 로그인해 주세요.",
      );
    }
    if (!user.onboardingCompletedAt) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "PROFILE_ONBOARDING_REQUIRED",
        "모임을 관리하려면 먼저 프로필 설정을 완료해 주세요.",
      );
    }
  }

  private async lockAndAssertOnboardedEventManager(
    transaction: Prisma.TransactionClient,
    principal: AuthenticatedPrincipal,
  ) {
    await transaction.$queryRaw`
      SELECT "id" FROM "users" WHERE "id" = ${principal.userId} FOR UPDATE
    `;
    await this.assertOnboardedEventManager(transaction, principal);
  }

  private canManageEventClub(
    principal: AuthenticatedPrincipal,
    club: { leaderId: string; status: ClubStatus },
  ) {
    if (club.status !== ClubStatus.ACTIVE) return false;
    return (
      principal.role === UserRole.ADMIN ||
      (principal.role === UserRole.LEADER &&
        club.leaderId === principal.userId)
    );
  }

  private async lockManagedEvent(
    transaction: Prisma.TransactionClient,
    eventId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<ManagedEventDetailRow> {
    await transaction.$queryRaw`
      SELECT e."id"
      FROM "events" e
      JOIN "clubs" c ON c."id" = e."club_id"
      WHERE e."id" = ${eventId}
      FOR UPDATE OF e, c
    `;
    const event = await transaction.event.findUnique({
      where: { id: eventId },
      select: managedEventDetailSelect,
    });
    if (!event || !this.canManageEventClub(principal, event.club)) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "MANAGED_EVENT_NOT_FOUND",
        "관리할 수 있는 모임을 찾을 수 없습니다.",
      );
    }
    return event;
  }

  private assertValidEventSchedule(
    schedule: {
      startAt: Date;
      endAt: Date | null;
      registrationDeadline: Date | null;
    },
    now: Date,
    requireOpenRegistration: boolean,
  ) {
    if (schedule.startAt <= now) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "EVENT_START_MUST_BE_FUTURE",
        "모임 시작 일시는 현재보다 늦어야 합니다.",
      );
    }
    if (schedule.endAt && schedule.endAt <= schedule.startAt) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_EVENT_END_AT",
        "종료 일시는 시작 일시보다 늦어야 합니다.",
      );
    }
    if (
      schedule.registrationDeadline &&
      schedule.registrationDeadline > schedule.startAt
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_REGISTRATION_DEADLINE",
        "신청 마감은 시작 일시보다 늦을 수 없습니다.",
      );
    }
    if (
      requireOpenRegistration &&
      schedule.registrationDeadline &&
      schedule.registrationDeadline <= now
    ) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "REGISTRATION_DEADLINE_MUST_BE_FUTURE",
        "신청 마감 일시는 현재보다 늦어야 합니다.",
      );
    }
  }

  private assertOperatorRole(principal: AuthenticatedPrincipal) {
    if (
      principal.role !== UserRole.LEADER &&
      principal.role !== UserRole.ADMIN
    ) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "LEADER_SCOPE_REQUIRED",
        "담당 모임의 신청만 확인할 수 있습니다.",
      );
    }
  }

  private canOperateClub(
    principal: AuthenticatedPrincipal,
    club: {
      leaderId: string;
      leader: { role: UserRole; status: UserStatus };
      members: readonly { id: string; userId: string }[];
    },
  ) {
    if (principal.role === UserRole.ADMIN) return true;
    return (
      principal.role === UserRole.LEADER &&
      (club.leaderId === principal.userId ||
        club.members.some((member) => member.userId === principal.userId))
    );
  }

  private async ensureChatMembership(
    transaction: Prisma.TransactionClient,
    eventId: string,
    userId: string,
  ) {
    const room = await transaction.chatRoom.upsert({
      where: { eventId },
      update: {},
      create: { eventId },
    });
    await transaction.chatRoomMember.upsert({
      where: { roomId_userId: { roomId: room.id, userId } },
      update: { leftAt: null },
      create: { roomId: room.id, userId },
    });
  }

  private toApplication(application: {
    id: string;
    eventId: string;
    userId: string;
    status: EventMemberStatus;
    attendance: AttendanceStatus;
    appliedAt: Date;
    decidedAt: Date | null;
    canceledAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      id: application.id,
      eventId: application.eventId,
      userId: application.userId,
      status: application.status,
      attendance: application.attendance,
      appliedAt: application.appliedAt.toISOString(),
      decidedAt: application.decidedAt?.toISOString() ?? null,
      canceledAt: application.canceledAt?.toISOString() ?? null,
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private toDecision(application: {
    id: string;
    status: EventMemberStatus;
    decidedAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      id: application.id,
      status: application.status,
      decidedAt: application.decidedAt?.toISOString() ?? null,
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private toAttendance(application: {
    id: string;
    attendance: AttendanceStatus;
    checkedInAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      id: application.id,
      attendance: application.attendance,
      checkedInAt: application.checkedInAt?.toISOString() ?? null,
      updatedAt: application.updatedAt.toISOString(),
    };
  }

  private toEventCard(event: PublicEventRow) {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      coverImageUrl: event.coverImageUrl,
      locationName: event.locationName,
      address: event.address,
      mapUrl: event.mapUrl,
      startAt: event.startAt.toISOString(),
      endAt: event.endAt?.toISOString() ?? null,
      registrationDeadline:
        event.registrationDeadline?.toISOString() ?? null,
      capacity: event.capacity,
      participantCount: event._count.participants,
      remainingCapacity: Math.max(
        event.capacity - event._count.participants,
        0,
      ),
      price: event.price,
      currency: event.currency,
      difficulty: event.difficulty,
      supplies: event.supplies,
      approvalMode: event.approvalMode,
      status: event.status,
      club: {
        id: event.club.id,
        slug: event.club.slug,
        title: event.club.title,
        region: event.club.region,
        interest: event.club.interest,
        leaderName: event.club.leader.name,
      },
    };
  }

  private toManagedEventCard(event: ManagedEventResponseRow) {
    return {
      ...this.toEventCard(event),
      clubId: event.clubId,
      updatedAt: event.updatedAt.toISOString(),
    };
  }
}
