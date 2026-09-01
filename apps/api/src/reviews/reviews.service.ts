import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import {
  AttendanceStatus,
  ContentStatus,
  EventMemberStatus,
  EventStatus,
  Prisma,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateReviewInput,
  MyReviewStateDto,
  PublicReviewDto,
  ReviewEligibilityCode,
  ReviewListQuery,
  UpdateReviewInput,
} from "./reviews.contracts";

type ReviewCursor = { createdAt: string; id: string };

const publicEventStatuses = [
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
  EventStatus.COMPLETED,
  EventStatus.CANCELED,
] as const;

const reviewableEventStatuses = new Set<EventStatus>([
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
  EventStatus.COMPLETED,
]);

const publicReviewSelect = {
  id: true,
  eventId: true,
  rating: true,
  content: true,
  createdAt: true,
  updatedAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.ReviewSelect;

const existingReviewSelect = {
  ...publicReviewSelect,
  status: true,
} satisfies Prisma.ReviewSelect;

type PublicReviewRow = Prisma.ReviewGetPayload<{
  select: typeof publicReviewSelect;
}>;

type ExistingReviewRow = Prisma.ReviewGetPayload<{
  select: typeof existingReviewSelect;
}>;

function encodeCursor(cursor: ReviewCursor) {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): ReviewCursor | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ReviewCursor>;
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

function isUniqueConstraintError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  );
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    eventId: string,
    query: ReviewListQuery,
    viewerUserId?: string,
  ) {
    const cursor = decodeCursor(query.cursor);
    if (query.cursor && !cursor) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_CURSOR",
        "후기 목록 위치가 올바르지 않습니다.",
      );
    }

    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: [...publicEventStatuses] } },
      select: { id: true },
    });
    if (!event) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "EVENT_NOT_FOUND",
        "모임을 찾을 수 없습니다.",
      );
    }

    const baseWhere: Prisma.ReviewWhereInput = {
      eventId,
      status: ContentStatus.PUBLISHED,
      ...(viewerUserId
        ? {
            author: {
              receivedBlocks: { none: { blockerId: viewerUserId } },
            },
          }
        : {}),
    };
    const where: Prisma.ReviewWhereInput = {
      ...baseWhere,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.createdAt) } },
              {
                createdAt: new Date(cursor.createdAt),
                id: { lt: cursor.id },
              },
            ],
          }
        : {}),
    };
    const [rows, aggregate] = await Promise.all([
      this.prisma.review.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        select: publicReviewSelect,
      }),
      this.prisma.review.aggregate({
        where: baseWhere,
        _avg: { rating: true },
        _count: { _all: true },
      }),
    ]);

    const hasNextPage = rows.length > query.limit;
    const page = hasNextPage ? rows.slice(0, query.limit) : rows;
    const last = page.at(-1);
    const average = aggregate._avg.rating;

    return {
      data: page.map((review) => this.toPublicReview(review)),
      aggregate: {
        averageRating:
          average === null ? null : Math.round(average * 100) / 100,
        count: aggregate._count._all,
      },
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

  async mine(
    eventId: string,
    principal: AuthenticatedPrincipal,
  ): Promise<MyReviewStateDto> {
    const event = await this.prisma.event.findFirst({
      where: { id: eventId, status: { in: [...publicEventStatuses] } },
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
          select: existingReviewSelect,
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

    const participation = event.participants[0];
    const existing = event.reviews[0];
    const approved = participation?.status === EventMemberStatus.APPROVED;
    const attendance = participation?.attendance ?? null;
    const reviewsOpenAt = event.endAt ?? event.startAt;

    let review: PublicReviewDto | null = null;
    let code: ReviewEligibilityCode;
    if (existing?.status === ContentStatus.PUBLISHED) {
      review = this.toPublicReview(existing);
      code = "REVIEW_ALREADY_EXISTS";
    } else if (existing) {
      code = "REVIEW_DELETED";
    } else if (
      !reviewableEventStatuses.has(event.status) ||
      !approved ||
      attendance !== AttendanceStatus.ATTENDED
    ) {
      code = "REVIEW_NOT_ALLOWED";
    } else if (reviewsOpenAt > new Date()) {
      code = "REVIEW_NOT_OPEN";
    } else {
      code = "CAN_CREATE";
    }

    return {
      review,
      eligibility: {
        approved,
        attendance,
        reviewsOpenAt: reviewsOpenAt.toISOString(),
        canCreate: code === "CAN_CREATE",
        code,
      },
    };
  }

  async create(
    eventId: string,
    input: CreateReviewInput,
    principal: AuthenticatedPrincipal,
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        // Lock both eligibility rows in a stable order. Attendance or event
        // changes then cannot race between authorization and review creation.
        await transaction.$queryRaw`
          SELECT "id" FROM "events" WHERE "id" = ${eventId} FOR UPDATE
        `;
        await transaction.$queryRaw`
          SELECT "id" FROM "event_members"
          WHERE "event_id" = ${eventId} AND "user_id" = ${principal.userId}
          FOR UPDATE
        `;

        const event = await transaction.event.findUnique({
          where: { id: eventId },
          select: {
            id: true,
            status: true,
            startAt: true,
            endAt: true,
            participants: {
              where: { userId: principal.userId },
              take: 1,
              select: { status: true, attendance: true },
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
        if (!reviewableEventStatuses.has(event.status)) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "REVIEW_NOT_ALLOWED",
            "후기를 작성할 수 없는 모임입니다.",
          );
        }

        // A scheduled end time is authoritative. Events without one open
        // reviews when they start, never before the activity begins.
        const reviewsOpenAt = event.endAt ?? event.startAt;
        if (reviewsOpenAt > new Date()) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "REVIEW_NOT_OPEN",
            "모임이 끝난 뒤 후기를 작성할 수 있습니다.",
          );
        }

        const participation = event.participants[0];
        if (
          participation?.status !== EventMemberStatus.APPROVED ||
          participation.attendance !== AttendanceStatus.ATTENDED
        ) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            "REVIEW_NOT_ALLOWED",
            "출석이 확인된 참가자만 후기를 작성할 수 있습니다.",
          );
        }

        const existing = await transaction.review.findUnique({
          where: {
            eventId_userId: { eventId, userId: principal.userId },
          },
          select: existingReviewSelect,
        });
        if (existing) return this.resolveExistingReview(existing, input);

        const review = await transaction.review.create({
          data: {
            eventId,
            userId: principal.userId,
            rating: input.rating,
            content: input.content,
          },
          select: publicReviewSelect,
        });
        return this.toPublicReview(review);
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        // A successful response may have been lost and retried, or another
        // identical request may have won the unique-constraint race.
        const existing = await this.prisma.review.findUnique({
          where: {
            eventId_userId: { eventId, userId: principal.userId },
          },
          select: existingReviewSelect,
        });
        if (existing) return this.resolveExistingReview(existing, input);
        this.throwReviewAlreadyExists();
      }
      throw error;
    }
  }

  async update(
    reviewId: string,
    input: UpdateReviewInput,
    principal: AuthenticatedPrincipal,
  ) {
    await this.assertOwnedPublishedReview(reviewId, principal.userId);

    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        ...(input.rating === undefined ? {} : { rating: input.rating }),
        ...(input.content === undefined ? {} : { content: input.content }),
      },
      select: publicReviewSelect,
    });
    return this.toPublicReview(review);
  }

  async remove(reviewId: string, principal: AuthenticatedPrincipal) {
    await this.assertOwnedPublishedReview(reviewId, principal.userId);

    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: ContentStatus.HIDDEN },
      select: { id: true, status: true, updatedAt: true },
    });
    return {
      id: review.id,
      status: review.status,
      updatedAt: review.updatedAt.toISOString(),
    };
  }

  private async assertOwnedPublishedReview(reviewId: string, userId: string) {
    const review = await this.prisma.review.findFirst({
      where: {
        id: reviewId,
        userId,
        status: ContentStatus.PUBLISHED,
      },
      select: { id: true },
    });
    if (!review) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "REVIEW_NOT_FOUND",
        "후기를 찾을 수 없습니다.",
      );
    }
  }

  private resolveExistingReview(
    review: ExistingReviewRow,
    input: CreateReviewInput,
  ) {
    if (
      review.status === ContentStatus.PUBLISHED &&
      review.rating === input.rating &&
      review.content === input.content
    ) {
      return this.toPublicReview(review);
    }
    this.throwReviewAlreadyExists();
  }

  private throwReviewAlreadyExists(): never {
    throw new ApiException(
      HttpStatus.CONFLICT,
      "REVIEW_ALREADY_EXISTS",
      "이 모임의 후기는 삭제한 후기까지 포함해 한 번만 등록할 수 있습니다.",
    );
  }

  private toPublicReview(review: PublicReviewRow): PublicReviewDto {
    return {
      id: review.id,
      eventId: review.eventId,
      rating: review.rating,
      content: review.content,
      author: review.author,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
    };
  }
}
