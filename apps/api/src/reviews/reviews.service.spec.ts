import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  AttendanceStatus,
  ContentStatus,
  EventMemberStatus,
  EventStatus,
  Prisma,
  UserRole,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import {
  createReviewSchema,
  reviewListQuerySchema,
  updateReviewSchema,
} from "./reviews.contracts";
import { ReviewsService } from "./reviews.service";

const principal: AuthenticatedPrincipal = {
  userId: "member-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};

const createdAt = new Date("2026-07-29T09:00:00.000Z");
const updatedAt = new Date("2026-07-29T10:00:00.000Z");

function reviewRow(id: string, rating = 5) {
  return {
    id,
    eventId: "event-1",
    rating,
    content: `${id}에서 함께한 시간이 정말 즐거웠습니다.`,
    createdAt,
    updatedAt,
    author: { id: "member-1", name: "김정희" },
  };
}

function eligibleEvent(input?: { endAt?: Date | null; status?: EventStatus }) {
  return {
    id: "event-1",
    status: input?.status ?? EventStatus.COMPLETED,
    startAt: new Date("2026-07-29T07:00:00.000Z"),
    endAt:
      input && "endAt" in input
        ? input.endAt ?? null
        : new Date("2026-07-29T08:00:00.000Z"),
    participants: [
      {
        status: EventMemberStatus.APPROVED,
        attendance: AttendanceStatus.ATTENDED,
      },
    ],
  };
}

describe("ReviewsService public feed", () => {
  it("returns a stable cursor page, author projection, and one aggregate query", async () => {
    const rows = [reviewRow("review-3", 5), reviewRow("review-2", 4), reviewRow("review-1", 3)];
    const findFirst = vi.fn().mockResolvedValue({ id: "event-1" });
    const findMany = vi.fn().mockResolvedValue(rows);
    const aggregate = vi.fn().mockResolvedValue({
      _avg: { rating: 4.3333 },
      _count: { _all: 3 },
    });
    const prisma = {
      event: { findFirst },
      review: { findMany, aggregate },
    } as unknown as PrismaService;

    const result = await new ReviewsService(prisma).list(
      "event-1",
      reviewListQuerySchema.parse({ limit: 2 }),
    );

    expect(findMany).toHaveBeenCalledOnce();
    expect(aggregate).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: ContentStatus.PUBLISHED },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 3,
      select: {
        id: true,
        eventId: true,
        rating: true,
        content: true,
        createdAt: true,
        updatedAt: true,
        author: { select: { id: true, name: true } },
      },
    });
    expect(aggregate).toHaveBeenCalledWith({
      where: { eventId: "event-1", status: ContentStatus.PUBLISHED },
      _avg: { rating: true },
      _count: { _all: true },
    });
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({
      ...reviewRow("review-3", 5),
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
    expect(result.data[0]).not.toHaveProperty("status");
    expect(result.data[0]!.author).toEqual({ id: "member-1", name: "김정희" });
    expect(result.aggregate).toEqual({ averageRating: 4.33, count: 3 });
    expect(result.page).toEqual({
      hasNextPage: true,
      nextCursor: expect.any(String),
    });
  });

  it("applies an opaque cursor while keeping aggregate statistics event-wide", async () => {
    const cursorDate = new Date("2026-07-28T09:00:00.000Z");
    const cursor = Buffer.from(
      JSON.stringify({ createdAt: cursorDate.toISOString(), id: "review-9" }),
      "utf8",
    ).toString("base64url");
    const findMany = vi.fn().mockResolvedValue([]);
    const aggregate = vi.fn().mockResolvedValue({
      _avg: { rating: null },
      _count: { _all: 0 },
    });
    const prisma = {
      event: { findFirst: vi.fn().mockResolvedValue({ id: "event-1" }) },
      review: { findMany, aggregate },
    } as unknown as PrismaService;

    const result = await new ReviewsService(prisma).list(
      "event-1",
      reviewListQuerySchema.parse({ cursor }),
    );

    expect(findMany.mock.calls[0]![0].where).toEqual({
      eventId: "event-1",
      status: ContentStatus.PUBLISHED,
      OR: [
        { createdAt: { lt: cursorDate } },
        { createdAt: cursorDate, id: { lt: "review-9" } },
      ],
    });
    expect(aggregate.mock.calls[0]![0].where).toEqual({
      eventId: "event-1",
      status: ContentStatus.PUBLISHED,
    });
    expect(result.aggregate).toEqual({ averageRating: null, count: 0 });
  });

  it("rejects malformed cursors and non-public events before querying reviews", async () => {
    const findMany = vi.fn();
    const prisma = {
      event: { findFirst: vi.fn().mockResolvedValue(null) },
      review: { findMany, aggregate: vi.fn() },
    } as unknown as PrismaService;
    const service = new ReviewsService(prisma);

    await expect(
      service.list(
        "event-1",
        reviewListQuerySchema.parse({ cursor: "not-valid" }),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      service.list("event-1", reviewListQuerySchema.parse({})),
    ).rejects.toMatchObject({ status: 404 });
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("ReviewsService current user's review state", () => {
  it("returns only the current user's published review through one scoped event query", async () => {
    const ownReview = {
      ...reviewRow("review-own"),
      status: ContentStatus.PUBLISHED,
    };
    const findFirst = vi.fn().mockResolvedValue({
      status: EventStatus.COMPLETED,
      startAt: new Date("2026-07-29T07:00:00.000Z"),
      endAt: new Date("2026-07-29T08:00:00.000Z"),
      participants: [
        {
          status: EventMemberStatus.APPROVED,
          attendance: AttendanceStatus.ATTENDED,
        },
      ],
      reviews: [ownReview],
    });
    const service = new ReviewsService({
      event: { findFirst },
    } as unknown as PrismaService);

    await expect(service.mine("event-1", principal)).resolves.toEqual({
      review: {
        ...reviewRow("review-own"),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
      },
      eligibility: {
        approved: true,
        attendance: AttendanceStatus.ATTENDED,
        reviewsOpenAt: "2026-07-29T08:00:00.000Z",
        canCreate: false,
        code: "REVIEW_ALREADY_EXISTS",
      },
    });
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "event-1",
        status: {
          in: [
            EventStatus.PUBLISHED,
            EventStatus.CLOSED,
            EventStatus.COMPLETED,
            EventStatus.CANCELED,
          ],
        },
      },
      select: {
        status: true,
        startAt: true,
        endAt: true,
        participants: {
          where: { userId: principal.userId },
          take: 1,
          select: { status: true, attendance: true },
        },
        reviews: {
          where: { userId: principal.userId },
          take: 1,
          select: {
            id: true,
            eventId: true,
            rating: true,
            content: true,
            createdAt: true,
            updatedAt: true,
            author: { select: { id: true, name: true } },
            status: true,
          },
        },
      },
    });
  });

  it.each([ContentStatus.HIDDEN, ContentStatus.DELETED])(
    "does not expose a %s review and keeps one-review history",
    async (status) => {
      const service = new ReviewsService({
        event: {
          findFirst: vi.fn().mockResolvedValue({
            status: EventStatus.COMPLETED,
            startAt: new Date("2026-07-29T07:00:00.000Z"),
            endAt: new Date("2026-07-29T08:00:00.000Z"),
            participants: [
              {
                status: EventMemberStatus.APPROVED,
                attendance: AttendanceStatus.ATTENDED,
              },
            ],
            reviews: [{ ...reviewRow("review-deleted"), status }],
          }),
        },
      } as unknown as PrismaService);

      await expect(service.mine("event-1", principal)).resolves.toEqual({
        review: null,
        eligibility: {
          approved: true,
          attendance: AttendanceStatus.ATTENDED,
          reviewsOpenAt: "2026-07-29T08:00:00.000Z",
          canCreate: false,
          code: "REVIEW_DELETED",
        },
      });
    },
  );

  it("distinguishes create, not-open, and not-allowed states", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-30T09:00:00.000Z"));
    try {
      const findFirst = vi
        .fn()
        .mockResolvedValueOnce({
          status: EventStatus.PUBLISHED,
          startAt: new Date("2026-07-30T07:00:00.000Z"),
          endAt: new Date("2026-07-30T08:00:00.000Z"),
          participants: [
            {
              status: EventMemberStatus.APPROVED,
              attendance: AttendanceStatus.ATTENDED,
            },
          ],
          reviews: [],
        })
        .mockResolvedValueOnce({
          status: EventStatus.PUBLISHED,
          startAt: new Date("2026-07-30T07:00:00.000Z"),
          endAt: new Date("2026-07-30T10:00:00.000Z"),
          participants: [
            {
              status: EventMemberStatus.APPROVED,
              attendance: AttendanceStatus.ATTENDED,
            },
          ],
          reviews: [],
        })
        .mockResolvedValueOnce({
          status: EventStatus.CANCELED,
          startAt: new Date("2026-07-30T07:00:00.000Z"),
          endAt: new Date("2026-07-30T08:00:00.000Z"),
          participants: [
            {
              status: EventMemberStatus.APPROVED,
              attendance: AttendanceStatus.NO_SHOW,
            },
          ],
          reviews: [],
        });
      const service = new ReviewsService({
        event: { findFirst },
      } as unknown as PrismaService);

      await expect(service.mine("event-1", principal)).resolves.toMatchObject({
        review: null,
        eligibility: { canCreate: true, code: "CAN_CREATE" },
      });
      await expect(service.mine("event-1", principal)).resolves.toMatchObject({
        review: null,
        eligibility: { canCreate: false, code: "REVIEW_NOT_OPEN" },
      });
      await expect(service.mine("event-1", principal)).resolves.toMatchObject({
        review: null,
        eligibility: {
          approved: true,
          attendance: AttendanceStatus.NO_SHOW,
          canCreate: false,
          code: "REVIEW_NOT_ALLOWED",
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns the same safe 404 for a draft or missing event", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new ReviewsService({
      event: { findFirst },
    } as unknown as PrismaService);

    await expect(service.mine("event-private", principal)).rejects.toMatchObject({
      status: 404,
      response: { error: { code: "EVENT_NOT_FOUND" } },
    });
    expect(findFirst.mock.calls[0]![0].where.status.in).not.toContain(
      EventStatus.DRAFT,
    );
  });
});

describe("ReviewsService create", () => {
  it("creates a public review only for an approved attendee after the scheduled end", async () => {
    const row = reviewRow("review-new");
    const create = vi.fn().mockResolvedValue(row);
    const lock = vi.fn().mockResolvedValue([]);
    const transaction = {
      $queryRaw: lock,
      event: { findUnique: vi.fn().mockResolvedValue(eligibleEvent()) },
      review: { findUnique: vi.fn().mockResolvedValue(null), create },
    };
    const runTransaction = vi.fn(
      async (work: (client: typeof transaction) => Promise<unknown>) =>
        work(transaction),
    );
    const prisma = {
      $transaction: runTransaction,
      review: { findUnique: vi.fn() },
    } as unknown as PrismaService;

    const result = await new ReviewsService(prisma).create(
      "event-1",
      createReviewSchema.parse({
        rating: 5,
        content: "모임 진행이 친절해서 다음에도 참여하고 싶습니다.",
      }),
      principal,
    );

    expect(runTransaction).toHaveBeenCalledOnce();
    expect(lock).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledWith({
      data: {
        eventId: "event-1",
        userId: principal.userId,
        rating: 5,
        content: "모임 진행이 친절해서 다음에도 참여하고 싶습니다.",
      },
      select: expect.objectContaining({
        author: { select: { id: true, name: true } },
      }),
    });
    expect(result.author).toEqual({ id: "member-1", name: "김정희" });
    expect(result).not.toHaveProperty("userId");
  });

  it("uses endAt when present and startAt only when no end time exists", async () => {
    const create = vi.fn().mockResolvedValue(reviewRow("review-new"));
    const eventFind = vi
      .fn()
      .mockResolvedValueOnce(
        eligibleEvent({ endAt: new Date("2099-07-30T08:00:00.000Z") }),
      )
      .mockResolvedValueOnce(eligibleEvent({ endAt: null }));
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: eventFind },
      review: { findUnique: vi.fn().mockResolvedValue(null), create },
    };
    const service = new ReviewsService({
      $transaction: vi.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
      review: { findUnique: vi.fn() },
    } as unknown as PrismaService);
    const input = createReviewSchema.parse({
      rating: 4,
      content: "끝난 뒤에 남기는 충분히 자세한 후기입니다.",
    });

    await expect(service.create("event-1", input, principal)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_NOT_OPEN" } },
    });
    await expect(service.create("event-1", input, principal)).resolves.toMatchObject({
      id: "review-new",
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it("rejects canceled events and users without approved attendance", async () => {
    const create = vi.fn();
    const eventFind = vi
      .fn()
      .mockResolvedValueOnce(eligibleEvent({ status: EventStatus.CANCELED }))
      .mockResolvedValueOnce({
        ...eligibleEvent(),
        participants: [
          {
            status: EventMemberStatus.APPROVED,
            attendance: AttendanceStatus.NO_SHOW,
          },
        ],
      });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: eventFind },
      review: { findUnique: vi.fn().mockResolvedValue(null), create },
    };
    const service = new ReviewsService({
      $transaction: vi.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
      review: { findUnique: vi.fn() },
    } as unknown as PrismaService);
    const input = createReviewSchema.parse({
      rating: 4,
      content: "참여 여부를 서버에서 확인해야 하는 후기입니다.",
    });

    await expect(service.create("event-1", input, principal)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_NOT_ALLOWED" } },
    });
    await expect(service.create("event-1", input, principal)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_NOT_ALLOWED" } },
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("maps the database uniqueness race to a safe 409 response", async () => {
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "7.8.0" },
    );
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: vi.fn().mockResolvedValue(eligibleEvent()) },
      review: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(duplicate),
      },
    };
    const service = new ReviewsService({
      $transaction: vi.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
      review: { findUnique: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);

    await expect(
      service.create(
        "event-1",
        createReviewSchema.parse({
          rating: 5,
          content: "이미 저장된 후기와 충돌하는 요청입니다.",
        }),
        principal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_ALREADY_EXISTS" } },
    });
  });

  it("returns the existing DTO for an exact published retry without inserting", async () => {
    const input = createReviewSchema.parse({
      rating: 5,
      content: "응답 유실 뒤 같은 내용으로 재전송한 후기입니다.",
    });
    const existing = {
      ...reviewRow("review-existing", input.rating),
      content: input.content,
      status: ContentStatus.PUBLISHED,
    };
    const create = vi.fn();
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: vi.fn().mockResolvedValue(eligibleEvent()) },
      review: { findUnique: vi.fn().mockResolvedValue(existing), create },
    };
    const service = new ReviewsService({
      $transaction: vi.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
      review: { findUnique: vi.fn() },
    } as unknown as PrismaService);

    await expect(service.create("event-1", input, principal)).resolves.toEqual({
      ...reviewRow("review-existing", input.rating),
      content: input.content,
      createdAt: createdAt.toISOString(),
      updatedAt: updatedAt.toISOString(),
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("recovers an exact retry after a concurrent unique-constraint winner", async () => {
    const input = createReviewSchema.parse({
      rating: 4,
      content: "동시에 저장된 요청과 정확히 같은 후기 내용입니다.",
    });
    const duplicate = new Prisma.PrismaClientKnownRequestError(
      "Unique constraint failed",
      { code: "P2002", clientVersion: "7.8.0" },
    );
    const existing = {
      ...reviewRow("review-winner", input.rating),
      content: input.content,
      status: ContentStatus.PUBLISHED,
    };
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: vi.fn().mockResolvedValue(eligibleEvent()) },
      review: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockRejectedValue(duplicate),
      },
    };
    const rootFindUnique = vi.fn().mockResolvedValue(existing);
    const service = new ReviewsService({
      $transaction: vi.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
      review: { findUnique: rootFindUnique },
    } as unknown as PrismaService);

    await expect(service.create("event-1", input, principal)).resolves.toMatchObject({
      id: "review-winner",
      rating: input.rating,
      content: input.content,
    });
    expect(rootFindUnique).toHaveBeenCalledWith({
      where: {
        eventId_userId: { eventId: "event-1", userId: principal.userId },
      },
      select: expect.objectContaining({ status: true }),
    });
  });

  it.each([
    {
      label: "different published",
      status: ContentStatus.PUBLISHED,
      content: "기존에 저장된 서로 다른 후기 내용입니다.",
    },
    {
      label: "soft-deleted",
      status: ContentStatus.HIDDEN,
      content: "재등록할 수 없는 삭제된 후기 내용입니다.",
    },
  ])("keeps one-review history for a $label review", async ({ status, content }) => {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      event: { findUnique: vi.fn().mockResolvedValue(eligibleEvent()) },
      review: {
        findUnique: vi.fn().mockResolvedValue({
          ...reviewRow("review-existing"),
          content,
          status,
        }),
        create: vi.fn(),
      },
    };
    const service = new ReviewsService({
      $transaction: vi.fn(
        async (work: (client: typeof transaction) => Promise<unknown>) =>
          work(transaction),
      ),
      review: { findUnique: vi.fn() },
    } as unknown as PrismaService);

    await expect(
      service.create(
        "event-1",
        createReviewSchema.parse({
          rating: 5,
          content: "이번에 새로 등록하려는 충분히 다른 후기입니다.",
        }),
        principal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_ALREADY_EXISTS" } },
    });
    expect(transaction.review.create).not.toHaveBeenCalled();
  });
});

describe("ReviewsService owner mutations", () => {
  it("updates only the author's published review", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "review-1" });
    const update = vi.fn().mockResolvedValue(reviewRow("review-1", 4));
    const service = new ReviewsService({
      review: { findFirst, update },
    } as unknown as PrismaService);
    const input = updateReviewSchema.parse({ rating: 4 });

    await expect(service.update("review-1", input, principal)).resolves.toMatchObject({
      id: "review-1",
      rating: 4,
    });
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id: "review-1",
        userId: principal.userId,
        status: ContentStatus.PUBLISHED,
      },
      select: { id: true },
    });
    expect(update.mock.calls[0]![0]).toMatchObject({
      where: { id: "review-1" },
      data: { rating: 4 },
    });
  });

  it("hides a review instead of deleting its row", async () => {
    const update = vi.fn().mockResolvedValue({
      id: "review-1",
      status: ContentStatus.HIDDEN,
      updatedAt,
    });
    const service = new ReviewsService({
      review: {
        findFirst: vi.fn().mockResolvedValue({ id: "review-1" }),
        update,
      },
    } as unknown as PrismaService);

    await expect(service.remove("review-1", principal)).resolves.toEqual({
      id: "review-1",
      status: ContentStatus.HIDDEN,
      updatedAt: updatedAt.toISOString(),
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: "review-1" },
      data: { status: ContentStatus.HIDDEN },
      select: { id: true, status: true, updatedAt: true },
    });
  });

  it("returns the same safe 404 for another user's, hidden, or missing review", async () => {
    const update = vi.fn();
    const service = new ReviewsService({
      review: { findFirst: vi.fn().mockResolvedValue(null), update },
    } as unknown as PrismaService);

    await expect(
      service.update(
        "review-private",
        updateReviewSchema.parse({ rating: 3 }),
        principal,
      ),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: { code: "REVIEW_NOT_FOUND" } },
    });
    await expect(service.remove("review-private", principal)).rejects.toMatchObject({
      status: 404,
      response: { error: { code: "REVIEW_NOT_FOUND" } },
    });
    expect(update).not.toHaveBeenCalled();
  });
});
