import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  ContentStatus,
  PrismaClient,
  UserRole,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import {
  createReviewSchema,
  reviewListQuerySchema,
  updateReviewSchema,
} from "./reviews.contracts";
import { ReviewsService } from "./reviews.service";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase =
  process.env.RUN_DATABASE_E2E === "true" && databaseUrl
    ? describe
    : describe.skip;

describeWithDatabase("ReviewsService PostgreSQL lifecycle", () => {
  const eventId = "event-spring-photo-archive";
  const userId = "seed-user-member";
  let prisma: PrismaClient;
  let service: ReviewsService;

  const principal: AuthenticatedPrincipal = {
    userId,
    sessionId: "database-test-session",
    role: UserRole.MEMBER,
  };

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });
    service = new ReviewsService(prisma as unknown as PrismaService);
    await prisma.review.deleteMany({ where: { eventId, userId } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.review.deleteMany({ where: { eventId, userId } });
    await prisma.$disconnect();
  });

  it("creates, aggregates, updates, soft-deletes, and enforces uniqueness", async () => {
    const createInput = createReviewSchema.parse({
      rating: 5,
      content: "실제 PostgreSQL에 저장되는 충분히 자세한 후기입니다.",
    });
    const created = await service.create(eventId, createInput, principal);
    expect(created).toMatchObject({
      eventId,
      rating: 5,
      author: { id: userId, name: "박영희" },
    });

    await expect(service.create(eventId, createInput, principal)).resolves.toEqual(
      created,
    );

    await expect(
      service.create(
        eventId,
        createReviewSchema.parse({
          rating: 4,
          content: "중복으로 저장할 수 없어야 하는 후기입니다.",
        }),
        principal,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_ALREADY_EXISTS" } },
    });

    const listed = await service.list(
      eventId,
      reviewListQuerySchema.parse({}),
    );
    expect(listed.aggregate).toEqual({ averageRating: 5, count: 1 });
    expect(listed.data.map(({ id }) => id)).toContain(created.id);

    const updated = await service.update(
      created.id,
      updateReviewSchema.parse({
        rating: 4,
        content: "수정 후에도 열 글자 이상인 실제 후기 내용입니다.",
      }),
      principal,
    );
    expect(updated).toMatchObject({ rating: 4 });

    await expect(service.remove(created.id, principal)).resolves.toMatchObject({
      id: created.id,
      status: ContentStatus.HIDDEN,
    });
    await expect(
      service.update(
        created.id,
        updateReviewSchema.parse({ rating: 3 }),
        principal,
      ),
    ).rejects.toMatchObject({ status: 404 });

    const afterDelete = await service.list(
      eventId,
      reviewListQuerySchema.parse({}),
    );
    expect(afterDelete).toMatchObject({
      data: [],
      aggregate: { averageRating: null, count: 0 },
    });

    await expect(
      service.create(eventId, createInput, principal),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REVIEW_ALREADY_EXISTS" } },
    });
  });
});
