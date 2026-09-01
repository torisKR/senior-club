import { HttpStatus, Injectable } from "@nestjs/common";

import { ApiException } from "../common/http/api.exception";
import {
  ClubMemberStatus,
  ClubStatus,
  EventStatus,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { ClubListQuery } from "./clubs.contracts";

type ClubCursor = { createdAt: string; id: string };

const PUBLIC_UPCOMING_STATUSES = [
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
] as const;

const PUBLIC_PAST_STATUSES = [
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
] as const;

const NEXT_EVENT_STATUSES = [
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
] as const;

function publicUpcomingEventWhere(now: Date): Prisma.EventWhereInput {
  return {
    status: { in: [...PUBLIC_UPCOMING_STATUSES] },
    startAt: { gte: now },
  };
}

function publicPastEventWhere(now: Date): Prisma.EventWhereInput {
  return {
    OR: [
      { status: EventStatus.COMPLETED },
      {
        status: { in: [...PUBLIC_PAST_STATUSES] },
        startAt: { lt: now },
      },
    ],
  };
}

const publicClubSelect = (now: Date) =>
  ({
    id: true,
    slug: true,
    title: true,
    description: true,
    region: true,
    createdAt: true,
    interest: {
      select: { id: true, slug: true, name: true, icon: true },
    },
    leader: { select: { name: true } },
    _count: {
      select: {
        members: { where: { status: ClubMemberStatus.ACTIVE } },
      },
    },
    events: {
      where: {
        status: { in: [...NEXT_EVENT_STATUSES] },
        startAt: { gte: now },
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      take: 1,
      select: {
        id: true,
        title: true,
        locationName: true,
        startAt: true,
        status: true,
      },
    },
  }) satisfies Prisma.ClubSelect;

type PublicClubRow = Prisma.ClubGetPayload<{
  select: ReturnType<typeof publicClubSelect>;
}>;

function encodeCursor(cursor: ClubCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): ClubCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ClubCursor>;
    if (
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.id !== "string" ||
      parsed.id.length < 1 ||
      parsed.id.length > 128
    ) {
      return null;
    }
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ClubListQuery) {
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "커뮤니티 목록 위치가 올바르지 않습니다.",
      );
    }

    const now = new Date();
    const cursorDate = cursor ? new Date(cursor.createdAt) : null;
    const andFilters: Prisma.ClubWhereInput[] = [];
    if (query.q) {
      andFilters.push({
        OR: [
          { title: { contains: query.q, mode: "insensitive" } },
          { description: { contains: query.q, mode: "insensitive" } },
        ],
      });
    }
    if (cursor && cursorDate) {
      andFilters.push({
        OR: [
          { createdAt: { lt: cursorDate } },
          { createdAt: cursorDate, id: { lt: cursor.id } },
        ],
      });
    }

    const rows = await this.prisma.club.findMany({
      where: {
        status: ClubStatus.ACTIVE,
        interest: {
          isActive: true,
          ...(query.category ? { slug: query.category } : {}),
        },
        ...(query.region
          ? { region: { contains: query.region, mode: "insensitive" } }
          : {}),
        ...(andFilters.length > 0 ? { AND: andFilters } : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      select: publicClubSelect(now),
    });

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const counts = await this.publicEventCounts(
      page.map(({ id }) => id),
      now,
    );
    const last = page.at(-1);

    return {
      data: page.map((club) => this.toPublicClub(club, counts)),
      page: {
        hasNextPage,
        nextCursor:
          hasNextPage && last
            ? encodeCursor({
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      },
    };
  }

  async detail(slug: string) {
    const now = new Date();
    const club = await this.prisma.club.findFirst({
      where: {
        slug,
        status: ClubStatus.ACTIVE,
        interest: { isActive: true },
      },
      select: publicClubSelect(now),
    });
    if (!club) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "CLUB_NOT_FOUND",
        "커뮤니티를 찾을 수 없습니다.",
      );
    }

    const counts = await this.publicEventCounts([club.id], now);
    return this.toPublicClub(club, counts);
  }

  private async publicEventCounts(clubIds: string[], now: Date) {
    const empty = {
      upcoming: new Map<string, number>(),
      past: new Map<string, number>(),
    };
    if (clubIds.length === 0) return empty;

    const [upcomingRows, pastRows] = await Promise.all([
      this.prisma.event.groupBy({
        by: ["clubId"],
        where: {
          clubId: { in: clubIds },
          ...publicUpcomingEventWhere(now),
        },
        _count: { _all: true },
      }),
      this.prisma.event.groupBy({
        by: ["clubId"],
        where: {
          clubId: { in: clubIds },
          ...publicPastEventWhere(now),
        },
        _count: { _all: true },
      }),
    ]);

    return {
      upcoming: new Map(
        upcomingRows.map((row) => [row.clubId, row._count._all]),
      ),
      past: new Map(pastRows.map((row) => [row.clubId, row._count._all])),
    };
  }

  private toPublicClub(
    club: PublicClubRow,
    counts: {
      upcoming: ReadonlyMap<string, number>;
      past: ReadonlyMap<string, number>;
    },
  ) {
    const nextEvent = club.events[0];
    return {
      id: club.id,
      slug: club.slug,
      title: club.title,
      description: club.description,
      region: club.region,
      interest: {
        id: club.interest.id,
        slug: club.interest.slug,
        name: club.interest.name,
        icon: club.interest.icon,
      },
      leaderName: club.leader.name,
      memberCount: club._count.members,
      upcomingEventCount: counts.upcoming.get(club.id) ?? 0,
      pastEventCount: counts.past.get(club.id) ?? 0,
      nextEvent: nextEvent
        ? {
            id: nextEvent.id,
            title: nextEvent.title,
            locationName: nextEvent.locationName,
            startAt: nextEvent.startAt.toISOString(),
            status: nextEvent.status,
          }
        : null,
    };
  }
}
