import { describe, expect, it, vi } from "vitest";

import { ContentStatus } from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { reviewListQuerySchema } from "./reviews.contracts";
import { ReviewsService } from "./reviews.service";

function createPrisma() {
  const findMany = vi.fn().mockResolvedValue([]);
  const aggregate = vi.fn().mockResolvedValue({
    _avg: { rating: null },
    _count: { _all: 0 },
  });
  const prisma = {
    event: { findFirst: vi.fn().mockResolvedValue({ id: "event-1" }) },
    review: { findMany, aggregate },
  } as unknown as PrismaService;
  return { prisma, findMany, aggregate };
}

describe("ReviewsService personalized feed", () => {
  it("keeps the public feed and aggregate free of viewer-specific filters", async () => {
    const { prisma, findMany, aggregate } = createPrisma();

    await new ReviewsService(prisma).list(
      "event-1",
      reviewListQuerySchema.parse({}),
    );

    expect(findMany.mock.calls[0]![0].where).toEqual({
      eventId: "event-1",
      status: ContentStatus.PUBLISHED,
    });
    expect(aggregate.mock.calls[0]![0].where).toEqual({
      eventId: "event-1",
      status: ContentStatus.PUBLISHED,
    });
  });

  it("excludes blocked authors from both rows and the event aggregate", async () => {
    const { prisma, findMany, aggregate } = createPrisma();

    await new ReviewsService(prisma).list(
      "event-1",
      reviewListQuerySchema.parse({}),
      "viewer-1",
    );

    const expectedWhere = {
      eventId: "event-1",
      status: ContentStatus.PUBLISHED,
      author: {
        receivedBlocks: { none: { blockerId: "viewer-1" } },
      },
    };
    expect(findMany.mock.calls[0]![0].where).toEqual(expectedWhere);
    expect(aggregate.mock.calls[0]![0].where).toEqual(expectedWhere);
  });
});
