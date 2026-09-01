import { describe, expect, it, vi } from "vitest";

import {
  ClubMemberStatus,
  ClubStatus,
  EventStatus,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { clubListQuerySchema } from "./clubs.contracts";
import { ClubsService } from "./clubs.service";

const firstCreatedAt = new Date("2026-07-20T09:00:00.000Z");
const secondCreatedAt = new Date("2026-07-19T09:00:00.000Z");

function clubRow(input: {
  id: string;
  slug: string;
  createdAt: Date;
  nextEvent?: boolean;
}) {
  return {
    id: input.id,
    slug: input.slug,
    title: `${input.slug} 커뮤니티`,
    description: "함께 천천히 활동하는 커뮤니티입니다.",
    region: "서울특별시",
    createdAt: input.createdAt,
    interest: {
      id: "interest-hiking",
      slug: "hiking",
      name: "등산",
      icon: "mountain",
    },
    leader: { name: "김선영" },
    _count: { members: 7 },
    events: input.nextEvent
      ? [
          {
            id: "event-next",
            title: "가까운 숲길 걷기",
            locationName: "둘레길 안내소",
            startAt: new Date("2099-08-01T01:00:00.000Z"),
            status: EventStatus.PUBLISHED,
          },
        ]
      : [],
  };
}

function createService(input?: {
  clubs?: ReturnType<typeof clubRow>[];
  detail?: ReturnType<typeof clubRow> | null;
  upcoming?: Array<{ clubId: string; _count: { _all: number } }>;
  past?: Array<{ clubId: string; _count: { _all: number } }>;
}) {
  const findMany = vi.fn().mockResolvedValue(input?.clubs ?? []);
  const findFirst = vi.fn().mockResolvedValue(input?.detail ?? null);
  const groupBy = vi
    .fn()
    .mockResolvedValueOnce(input?.upcoming ?? [])
    .mockResolvedValueOnce(input?.past ?? []);
  const prisma = {
    club: { findMany, findFirst },
    event: { groupBy },
  } as unknown as PrismaService;
  return {
    findMany,
    findFirst,
    groupBy,
    service: new ClubsService(prisma),
  };
}

describe("ClubsService public catalog", () => {
  it("queries only active clubs with normalized filters and a minimal projection", async () => {
    const { findMany, groupBy, service } = createService();

    await service.list(
      clubListQuerySchema.parse({
        category: "hiking",
        region: " 서울특별시 ",
        q: " 숲   걷기 ",
      }),
    );

    expect(findMany).toHaveBeenCalledOnce();
    const query = findMany.mock.calls[0]![0];
    expect(query.where).toMatchObject({
      status: ClubStatus.ACTIVE,
      interest: { isActive: true, slug: "hiking" },
      region: { contains: "서울특별시", mode: "insensitive" },
      AND: [
        {
          OR: [
            { title: { contains: "숲 걷기", mode: "insensitive" } },
            {
              description: {
                contains: "숲 걷기",
                mode: "insensitive",
              },
            },
          ],
        },
      ],
    });
    expect(query.orderBy).toEqual([
      { createdAt: "desc" },
      { id: "desc" },
    ]);
    expect(query.take).toBe(21);
    expect(query).not.toHaveProperty("include");
    expect(query.select).toMatchObject({
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
          status: {
            in: [
              EventStatus.PUBLISHED,
              EventStatus.CLOSED,
            ],
          },
          startAt: { gte: expect.any(Date) },
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
    });
    expect(groupBy).not.toHaveBeenCalled();
  });

  it("batches upcoming and past counts for the entire page without N+1 queries", async () => {
    const first = clubRow({
      id: "club-1",
      slug: "slow-hiking",
      createdAt: firstCreatedAt,
      nextEvent: true,
    });
    const second = clubRow({
      id: "club-2",
      slug: "photo-walk",
      createdAt: secondCreatedAt,
    });
    const extra = clubRow({
      id: "club-3",
      slug: "reading",
      createdAt: new Date("2026-07-18T09:00:00.000Z"),
    });
    const { groupBy, service } = createService({
      clubs: [first, second, extra],
      upcoming: [
        { clubId: first.id, _count: { _all: 3 } },
        { clubId: second.id, _count: { _all: 1 } },
      ],
      past: [{ clubId: first.id, _count: { _all: 8 } }],
    });

    const result = await service.list(clubListQuerySchema.parse({ limit: 2 }));

    expect(groupBy).toHaveBeenCalledTimes(2);
    for (const call of groupBy.mock.calls) {
      expect(call[0].where.clubId).toEqual({ in: [first.id, second.id] });
    }
    expect(groupBy.mock.calls[0]![0].where).toMatchObject({
      status: {
        in: [
          EventStatus.PUBLISHED,
          EventStatus.CLOSED,
        ],
      },
      startAt: { gte: expect.any(Date) },
    });
    expect(groupBy.mock.calls[1]![0].where.OR).toEqual([
      { status: EventStatus.COMPLETED },
      {
        status: {
          in: [
            EventStatus.PUBLISHED,
            EventStatus.CLOSED,
          ],
        },
        startAt: { lt: expect.any(Date) },
      },
    ]);
    expect(result.data).toEqual([
      {
        id: first.id,
        slug: first.slug,
        title: first.title,
        description: first.description,
        region: first.region,
        interest: first.interest,
        leaderName: first.leader.name,
        memberCount: 7,
        upcomingEventCount: 3,
        pastEventCount: 8,
        nextEvent: {
          ...first.events[0],
          startAt: first.events[0]!.startAt.toISOString(),
        },
      },
      {
        id: second.id,
        slug: second.slug,
        title: second.title,
        description: second.description,
        region: second.region,
        interest: second.interest,
        leaderName: second.leader.name,
        memberCount: 7,
        upcomingEventCount: 1,
        pastEventCount: 0,
        nextEvent: null,
      },
    ]);
    expect(result.page.hasNextPage).toBe(true);
    expect(result.page.nextCursor).toEqual(expect.any(String));
    expect(result.data[0]).not.toHaveProperty("createdAt");
    expect(result.data[0]).not.toHaveProperty("leader");

    const decodedCursor = JSON.parse(
      Buffer.from(result.page.nextCursor!, "base64url").toString("utf8"),
    );
    expect(decodedCursor).toEqual({
      createdAt: second.createdAt.toISOString(),
      id: second.id,
    });
  });

  it("applies the opaque cursor before querying and rejects malformed cursors", async () => {
    const validCursor = Buffer.from(
      JSON.stringify({
        createdAt: secondCreatedAt.toISOString(),
        id: "club-2",
      }),
      "utf8",
    ).toString("base64url");
    const { findMany, service } = createService();

    await service.list(clubListQuerySchema.parse({ cursor: validCursor }));
    expect(findMany.mock.calls[0]![0].where.AND).toEqual([
      {
        OR: [
          { createdAt: { lt: secondCreatedAt } },
          { createdAt: secondCreatedAt, id: { lt: "club-2" } },
        ],
      },
    ]);

    await expect(
      service.list(
        clubListQuerySchema.parse({ cursor: "not-a-valid-cursor" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(findMany).toHaveBeenCalledOnce();
  });
});

describe("ClubsService public detail", () => {
  it("returns an active club DTO with batched event counts", async () => {
    const detail = clubRow({
      id: "club-1",
      slug: "slow-hiking",
      createdAt: firstCreatedAt,
      nextEvent: true,
    });
    const { findFirst, groupBy, service } = createService({
      detail,
      upcoming: [{ clubId: detail.id, _count: { _all: 2 } }],
      past: [{ clubId: detail.id, _count: { _all: 5 } }],
    });

    const result = await service.detail(detail.slug);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          slug: detail.slug,
          status: ClubStatus.ACTIVE,
          interest: { isActive: true },
        },
      }),
    );
    expect(groupBy).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({
      id: detail.id,
      slug: detail.slug,
      memberCount: 7,
      upcomingEventCount: 2,
      pastEventCount: 5,
      leaderName: "김선영",
      nextEvent: { id: "event-next" },
    });
  });

  it("hides archived, missing, and inactive-interest clubs behind one 404", async () => {
    const { groupBy, service } = createService({ detail: null });

    await expect(service.detail("archived-club")).rejects.toMatchObject({
      status: 404,
    });
    expect(groupBy).not.toHaveBeenCalled();
  });
});
