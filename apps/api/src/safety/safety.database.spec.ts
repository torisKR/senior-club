import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  PrismaClient,
  ReportReason,
  ReportTargetType,
  UserRole,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import {
  MAX_USER_BLOCKS,
  USER_BLOCK_LIMIT_REACHED_CODE,
} from "./safety.contracts";
import { SafetyService } from "./safety.service";

const databaseUrl = process.env.DATABASE_URL;
const describeWithDatabase =
  process.env.RUN_DATABASE_E2E === "true" && databaseUrl
    ? describe
    : describe.skip;

describeWithDatabase("SafetyService PostgreSQL concurrency", () => {
  const runId = `safety-race-${process.pid}-${Date.now()}`;
  const reportReporterId = `${runId}-reporter`;
  const reportTargetId = `${runId}-report-target`;
  const blockerId = `${runId}-blocker`;
  const blockTargetIds = Array.from(
    { length: MAX_USER_BLOCKS + 1 },
    (_, index) => `${runId}-block-target-${index}`,
  );
  let prisma: PrismaClient;
  let service: SafetyService;

  const principal = (userId: string): AuthenticatedPrincipal => ({
    userId,
    sessionId: `${runId}-session`,
    role: UserRole.MEMBER,
  });

  beforeAll(async () => {
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: databaseUrl! }),
    });
    service = new SafetyService(prisma as unknown as PrismaService);
    await prisma.user.createMany({
      data: [
        {
          id: reportReporterId,
          email: `${reportReporterId}@seniorclub.test`,
          name: "신고 동시성 테스트 회원",
        },
        {
          id: reportTargetId,
          email: `${reportTargetId}@seniorclub.test`,
          name: "신고 대상 테스트 회원",
        },
        {
          id: blockerId,
          email: `${blockerId}@seniorclub.test`,
          name: "차단 동시성 테스트 회원",
        },
        ...blockTargetIds.map((id, index) => ({
          id,
          email: `${runId}-block-${index}@seniorclub.test`,
          name: `차단 대상 ${index}`,
        })),
      ],
    });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.report.deleteMany({ where: { reporterId: reportReporterId } });
    await prisma.user.deleteMany({ where: { id: { startsWith: runId } } });
    await prisma.$disconnect();
  });

  it("commits only one of two concurrent identical reports", async () => {
    const input = {
      targetType: ReportTargetType.USER,
      targetId: reportTargetId,
      reason: ReportReason.SPAM,
    } as const;

    const results = await Promise.allSettled([
      service.report(input, principal(reportReporterId)),
      service.report(input, principal(reportReporterId)),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: {
        status: 409,
        response: { error: { code: "REPORT_ALREADY_OPEN" } },
      },
    });
    await expect(
      prisma.report.count({
        where: { reporterId: reportReporterId, reportedUserId: reportTargetId },
      }),
    ).resolves.toBe(1);
  });

  it("commits only one of two new blocks when 499 already exist", async () => {
    await prisma.userBlock.createMany({
      data: blockTargetIds.slice(0, MAX_USER_BLOCKS - 1).map((blockedId) => ({
        blockerId,
        blockedId,
      })),
    });
    const candidates = blockTargetIds.slice(MAX_USER_BLOCKS - 1);

    const results = await Promise.allSettled(
      candidates.map((blockedUserId) =>
        service.block({ blockedUserId }, principal(blockerId)),
      ),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: {
        status: 409,
        response: { error: { code: USER_BLOCK_LIMIT_REACHED_CODE } },
      },
    });
    await expect(
      prisma.userBlock.count({ where: { blockerId } }),
    ).resolves.toBe(MAX_USER_BLOCKS);
  });
});
