import { GUARDS_METADATA, HEADERS_METADATA } from "@nestjs/common/constants";
import { describe, expect, it, vi } from "vitest";

import { AccessTokenGuard } from "../auth/access-token.guard";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  ReportReason,
  ReportStatus,
  ReportTargetType,
  UserRole,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { SafetyController } from "./safety.controller";
import {
  MAX_USER_BLOCKS,
  USER_BLOCK_LIMIT_REACHED_CODE,
  USER_BLOCK_LIST_OVERFLOW_CODE,
} from "./safety.contracts";
import { SafetyService } from "./safety.service";

const admin: AuthenticatedPrincipal = {
  userId: "admin-1",
  sessionId: "session-1",
  role: UserRole.ADMIN,
};
const member: AuthenticatedPrincipal = { ...admin, role: UserRole.MEMBER };
const createdAt = new Date("2026-07-30T01:00:00.000Z");

const reportTargets = [
  {
    targetType: ReportTargetType.USER,
    delegate: "user",
    referenceKey: "reportedUserId",
  },
  {
    targetType: ReportTargetType.POST,
    delegate: "post",
    referenceKey: "postId",
  },
  {
    targetType: ReportTargetType.COMMENT,
    delegate: "comment",
    referenceKey: "commentId",
  },
  {
    targetType: ReportTargetType.REVIEW,
    delegate: "review",
    referenceKey: "reviewId",
  },
  {
    targetType: ReportTargetType.CHAT_MESSAGE,
    delegate: "chatMessage",
    referenceKey: "chatMessageId",
  },
] as const;

function reportHarness(
  target: (typeof reportTargets)[number],
  ownerUserId: string,
) {
  const targetId =
    target.targetType === ReportTargetType.USER
      ? ownerUserId
      : `${target.targetType.toLowerCase()}-1`;
  const findTarget = vi.fn().mockResolvedValue(
    target.targetType === ReportTargetType.USER
      ? { id: targetId }
      : target.targetType === ReportTargetType.CHAT_MESSAGE
        ? { id: targetId, userId: ownerUserId, roomId: "room-1" }
        : { id: targetId, userId: ownerUserId },
  );
  const findDuplicate = vi.fn().mockResolvedValue(null);
  const create = vi.fn().mockResolvedValue({
    id: "report-created",
    status: ReportStatus.OPEN,
    createdAt,
  });
  const lockReporter = vi.fn().mockResolvedValue([{ id: member.userId }]);
  const transaction = {
    $queryRaw: lockReporter,
    report: { findFirst: findDuplicate, create },
  };
  const runTransaction = vi.fn(
    async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  const prisma = {
    user: { findUnique: target.delegate === "user" ? findTarget : vi.fn() },
    post: { findUnique: target.delegate === "post" ? findTarget : vi.fn() },
    comment: {
      findUnique: target.delegate === "comment" ? findTarget : vi.fn(),
    },
    review: {
      findUnique: target.delegate === "review" ? findTarget : vi.fn(),
    },
    chatMessage: {
      findUnique: target.delegate === "chatMessage" ? findTarget : vi.fn(),
    },
    chatRoomMember: {
      findUnique: vi.fn().mockResolvedValue({ leftAt: null }),
    },
    $transaction: runTransaction,
  } as unknown as PrismaService;

  return {
    service: new SafetyService(prisma),
    targetId,
    findDuplicate,
    create,
    lockReporter,
    runTransaction,
  };
}

function createExclusiveLock() {
  let tail = Promise.resolve();

  return async () => {
    const previous = tail;
    let release: () => void = () => undefined;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    return release;
  };
}

function reportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "report-1",
    targetType: ReportTargetType.POST,
    reportedUserId: null,
    postId: "post-1",
    commentId: null,
    reviewId: null,
    chatMessageId: null,
    reason: ReportReason.SPAM,
    detail: "반복 광고입니다.",
    status: ReportStatus.OPEN,
    resolutionNote: null,
    createdAt,
    resolvedAt: null,
    updatedAt: createdAt,
    reporter: { id: "member-1", name: "신고자" },
    resolver: null,
    ...overrides,
  };
}

describe("SafetyService member reports", () => {
  it.each(reportTargets)(
    "rejects a self-owned $targetType target before duplicate lookup or creation",
    async (target) => {
      const harness = reportHarness(target, member.userId);

      await expect(
        harness.service.report(
          {
            targetType: target.targetType,
            targetId: harness.targetId,
            reason: ReportReason.ABUSE,
          },
          member,
        ),
      ).rejects.toMatchObject({
        status: 400,
        response: { error: { code: "CANNOT_REPORT_SELF" } },
      });
      expect(harness.findDuplicate).not.toHaveBeenCalled();
      expect(harness.create).not.toHaveBeenCalled();
      expect(harness.runTransaction).not.toHaveBeenCalled();
    },
  );

  it.each(reportTargets)(
    "persists only the $referenceKey reference for a non-self $targetType report",
    async (target) => {
      const harness = reportHarness(target, "owner-1");
      const expectedReference = { [target.referenceKey]: harness.targetId };

      await expect(
        harness.service.report(
          {
            targetType: target.targetType,
            targetId: harness.targetId,
            reason: ReportReason.SPAM,
          },
          member,
        ),
      ).resolves.toEqual({
        id: "report-created",
        status: ReportStatus.OPEN,
        createdAt: createdAt.toISOString(),
      });
      expect(harness.findDuplicate).toHaveBeenCalledWith({
        where: {
          reporterId: member.userId,
          status: { in: [ReportStatus.OPEN, ReportStatus.IN_REVIEW] },
          ...expectedReference,
        },
        select: { id: true },
      });
      expect(harness.create).toHaveBeenCalledWith({
        data: {
          reporterId: member.userId,
          targetType: target.targetType,
          reason: ReportReason.SPAM,
          detail: null,
          ...expectedReference,
        },
        select: { id: true, status: true, createdAt: true },
      });
      const createData = harness.create.mock.calls[0]![0].data;
      expect(createData).not.toHaveProperty("ownerUserId");
      expect(createData).not.toHaveProperty("userId");
      expect(
        [
          "reportedUserId",
          "postId",
          "commentId",
          "reviewId",
          "chatMessageId",
        ].filter((key) => Object.hasOwn(createData, key)),
      ).toEqual([target.referenceKey]);
      expect(harness.lockReporter).toHaveBeenCalledOnce();
      expect(harness.lockReporter.mock.invocationCallOrder[0]).toBeLessThan(
        harness.findDuplicate.mock.invocationCallOrder[0]!,
      );
    },
  );

  it("rejects an existing open report after locking the reporter", async () => {
    const target = reportTargets[1];
    const harness = reportHarness(target, "owner-1");
    harness.findDuplicate.mockResolvedValue({ id: "report-existing" });

    await expect(
      harness.service.report(
        {
          targetType: target.targetType,
          targetId: harness.targetId,
          reason: ReportReason.SPAM,
        },
        member,
      ),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: "REPORT_ALREADY_OPEN" } },
    });
    expect(harness.create).not.toHaveBeenCalled();
    expect(harness.lockReporter.mock.invocationCallOrder[0]).toBeLessThan(
      harness.findDuplicate.mock.invocationCallOrder[0]!,
    );
  });

  it("serializes concurrent identical reports so exactly one is created", async () => {
    const acquire = createExclusiveLock();
    const storedReports: Array<{ reporterId: string; postId?: string }> = [];
    const lockCalls = vi.fn();
    const prisma = {
      post: {
        findUnique: vi.fn().mockResolvedValue({ id: "post-1", userId: "owner-1" }),
      },
      $transaction: vi.fn(
        async (
          callback: (tx: {
            $queryRaw: ReturnType<typeof vi.fn>;
            report: {
              findFirst: ReturnType<typeof vi.fn>;
              create: ReturnType<typeof vi.fn>;
            };
          }) => Promise<unknown>,
        ) => {
          let release: (() => void) | undefined;
          const transaction = {
            $queryRaw: vi.fn(async () => {
              lockCalls();
              release = await acquire();
              return [{ id: member.userId }];
            }),
            report: {
              findFirst: vi.fn(async () =>
                storedReports.some(
                  (report) =>
                    report.reporterId === member.userId && report.postId === "post-1",
                )
                  ? { id: "report-created" }
                  : null,
              ),
              create: vi.fn(async (args: { data: typeof storedReports[number] }) => {
                storedReports.push(args.data);
                return {
                  id: "report-created",
                  status: ReportStatus.OPEN,
                  createdAt,
                };
              }),
            },
          };
          try {
            return await callback(transaction);
          } finally {
            release?.();
          }
        },
      ),
    } as unknown as PrismaService;
    const service = new SafetyService(prisma);
    const input = {
      targetType: ReportTargetType.POST,
      targetId: "post-1",
      reason: ReportReason.SPAM,
    } as const;

    const results = await Promise.allSettled([
      service.report(input, member),
      service.report(input, member),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      status: "rejected",
      reason: {
        status: 409,
        response: { error: { code: "REPORT_ALREADY_OPEN" } },
      },
    });
    expect(storedReports).toHaveLength(1);
    expect(lockCalls).toHaveBeenCalledTimes(2);
  });
});

function blockHarness(options: {
  existing?: boolean;
  blockCount?: number;
  listedBlocks?: unknown[];
} = {}) {
  const findTarget = vi.fn().mockResolvedValue({ id: "blocked-user-1" });
  const lockBlocker = vi.fn().mockResolvedValue([{ id: member.userId }]);
  const findExisting = vi
    .fn()
    .mockResolvedValue(options.existing ? { id: "block-existing" } : null);
  const count = vi.fn().mockResolvedValue(options.blockCount ?? 0);
  const upsert = vi.fn().mockResolvedValue({
    id: options.existing ? "block-existing" : "block-created",
    blocked: { id: "blocked-user-1", name: "차단 회원" },
    createdAt,
  });
  const transaction = {
    $queryRaw: lockBlocker,
    userBlock: { findUnique: findExisting, count, upsert },
  };
  const runTransaction = vi.fn(
    async (callback: (tx: typeof transaction) => Promise<unknown>) =>
      callback(transaction),
  );
  const findMany = vi.fn().mockResolvedValue(options.listedBlocks ?? []);
  const prisma = {
    user: { findFirst: findTarget },
    userBlock: { findMany },
    $transaction: runTransaction,
  } as unknown as PrismaService;

  return {
    service: new SafetyService(prisma),
    findTarget,
    lockBlocker,
    findExisting,
    count,
    upsert,
    runTransaction,
    findMany,
  };
}

describe("SafetyService member blocks", () => {
  it("creates a new block below the account limit inside the locked transaction", async () => {
    const harness = blockHarness({ blockCount: MAX_USER_BLOCKS - 1 });

    await expect(
      harness.service.block(
        { blockedUserId: "blocked-user-1", reason: "원치 않는 연락" },
        member,
      ),
    ).resolves.toEqual({
      id: "block-created",
      blockedUser: { id: "blocked-user-1", name: "차단 회원" },
      createdAt: createdAt.toISOString(),
    });
    expect(harness.findExisting).toHaveBeenCalledWith({
      where: {
        blockerId_blockedId: {
          blockerId: member.userId,
          blockedId: "blocked-user-1",
        },
      },
      select: { id: true },
    });
    expect(harness.count).toHaveBeenCalledWith({
      where: { blockerId: member.userId },
    });
    expect(harness.upsert).toHaveBeenCalledOnce();
    expect(harness.lockBlocker.mock.invocationCallOrder[0]).toBeLessThan(
      harness.findExisting.mock.invocationCallOrder[0]!,
    );
    expect(harness.findExisting.mock.invocationCallOrder[0]).toBeLessThan(
      harness.count.mock.invocationCallOrder[0]!,
    );
    expect(harness.count.mock.invocationCallOrder[0]).toBeLessThan(
      harness.upsert.mock.invocationCallOrder[0]!,
    );
  });

  it("updates an existing target at the limit without counting it as a new block", async () => {
    const harness = blockHarness({
      existing: true,
      blockCount: MAX_USER_BLOCKS,
    });

    await expect(
      harness.service.block(
        { blockedUserId: "blocked-user-1", reason: "변경된 사유" },
        member,
      ),
    ).resolves.toMatchObject({ id: "block-existing" });
    expect(harness.count).not.toHaveBeenCalled();
    expect(harness.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { reason: "변경된 사유" } }),
    );
  });

  it("rejects a new target at the limit with the stable conflict code", async () => {
    const harness = blockHarness({ blockCount: MAX_USER_BLOCKS });

    await expect(
      harness.service.block({ blockedUserId: "blocked-user-1" }, member),
    ).rejects.toMatchObject({
      status: 409,
      response: { error: { code: USER_BLOCK_LIMIT_REACHED_CODE } },
    });
    expect(harness.upsert).not.toHaveBeenCalled();
  });

  it("bounds the block list query at limit plus one", async () => {
    const harness = blockHarness();

    await expect(harness.service.blocks(member)).resolves.toEqual([]);
    expect(harness.findMany).toHaveBeenCalledWith({
      where: { blockerId: member.userId },
      orderBy: { createdAt: "desc" },
      take: MAX_USER_BLOCKS + 1,
      include: {
        blocked: { select: { id: true, name: true, avatarUrl: true } },
      },
    });
  });

  it("fails explicitly instead of truncating a legacy block-list overflow", async () => {
    const harness = blockHarness({
      listedBlocks: Array.from({ length: MAX_USER_BLOCKS + 1 }, () => ({})),
    });

    await expect(harness.service.blocks(member)).rejects.toMatchObject({
      status: 409,
      response: { error: { code: USER_BLOCK_LIST_OVERFLOW_CODE } },
    });
  });

  it("serializes concurrent new targets so the account cannot exceed the limit", async () => {
    const acquire = createExclusiveLock();
    const blockedIds = new Set(
      Array.from({ length: MAX_USER_BLOCKS - 1 }, (_, index) => `existing-${index}`),
    );
    const lockCalls = vi.fn();
    const prisma = {
      user: {
        findFirst: vi.fn(async (args: { where: { id: string } }) => ({
          id: args.where.id,
        })),
      },
      $transaction: vi.fn(
        async (
          callback: (tx: {
            $queryRaw: ReturnType<typeof vi.fn>;
            userBlock: {
              findUnique: ReturnType<typeof vi.fn>;
              count: ReturnType<typeof vi.fn>;
              upsert: ReturnType<typeof vi.fn>;
            };
          }) => Promise<unknown>,
        ) => {
          let release: (() => void) | undefined;
          const transaction = {
            $queryRaw: vi.fn(async () => {
              lockCalls();
              release = await acquire();
              return [{ id: member.userId }];
            }),
            userBlock: {
              findUnique: vi.fn(async (args: {
                where: { blockerId_blockedId: { blockedId: string } };
              }) =>
                blockedIds.has(args.where.blockerId_blockedId.blockedId)
                  ? { id: `block-${args.where.blockerId_blockedId.blockedId}` }
                  : null,
              ),
              count: vi.fn(async () => blockedIds.size),
              upsert: vi.fn(async (args: {
                create: { blockedId: string };
              }) => {
                blockedIds.add(args.create.blockedId);
                return {
                  id: `block-${args.create.blockedId}`,
                  blocked: { id: args.create.blockedId, name: "차단 회원" },
                  createdAt,
                };
              }),
            },
          };
          try {
            return await callback(transaction);
          } finally {
            release?.();
          }
        },
      ),
    } as unknown as PrismaService;
    const service = new SafetyService(prisma);

    const results = await Promise.allSettled([
      service.block({ blockedUserId: "candidate-a" }, member),
      service.block({ blockedUserId: "candidate-b" }, member),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      status: "rejected",
      reason: {
        status: 409,
        response: { error: { code: USER_BLOCK_LIMIT_REACHED_CODE } },
      },
    });
    expect(blockedIds.size).toBe(MAX_USER_BLOCKS);
    expect(lockCalls).toHaveBeenCalledTimes(2);
  });
});

describe("SafetyController member safety contract", () => {
  it("requires authentication and prevents caching for report and block APIs", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SafetyController)).toEqual([
      AccessTokenGuard,
    ]);

    for (const handler of [
      SafetyController.prototype.report,
      SafetyController.prototype.blocks,
      SafetyController.prototype.block,
      SafetyController.prototype.unblock,
    ]) {
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual([
        { name: "Cache-Control", value: "private, no-store" },
      ]);
    }
  });
});

describe("SafetyService admin reports", () => {
  it("rejects a non-admin before reading reports", async () => {
    const findMany = vi.fn();
    const service = new SafetyService({ report: { findMany } } as unknown as PrismaService);

    await expect(service.adminReports(member)).rejects.toMatchObject({ status: 403 });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("returns a bounded projection with one resolved target ID", async () => {
    const findMany = vi.fn().mockResolvedValue([reportRow()]);
    const service = new SafetyService({ report: { findMany } } as unknown as PrismaService);

    await expect(service.adminReports(admin)).resolves.toEqual([
      {
        id: "report-1",
        targetType: "POST",
        targetId: "post-1",
        reason: "SPAM",
        detail: "반복 광고입니다.",
        status: "OPEN",
        resolutionNote: null,
        reporter: { id: "member-1", name: "신고자" },
        resolver: null,
        createdAt: createdAt.toISOString(),
        resolvedAt: null,
        updatedAt: createdAt.toISOString(),
      },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 100,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      }),
    );
  });

  it("locks and audits one status transition atomically", async () => {
    const updated = reportRow({
      status: ReportStatus.RESOLVED,
      resolutionNote: "확인 완료",
      resolver: { id: admin.userId, name: "관리자" },
    });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      report: {
        findUnique: vi.fn().mockResolvedValue(reportRow()),
        update: vi.fn().mockResolvedValue(updated),
      },
      adminAuditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;

    const result = await new SafetyService(prisma).resolve(
      "report-1",
      { status: ReportStatus.RESOLVED, resolutionNote: "확인 완료" },
      admin,
    );

    expect(transaction.$queryRaw).toHaveBeenCalledOnce();
    expect(transaction.report.update).toHaveBeenCalledOnce();
    expect(transaction.adminAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: admin.userId,
        action: "REPORT_STATUS_CHANGED",
        before: { status: ReportStatus.OPEN },
        after: { status: ReportStatus.RESOLVED },
      }),
    });
    expect(result).toMatchObject({ id: "report-1", status: "RESOLVED" });
  });

  it("returns an identical retry without a second update or audit", async () => {
    const current = reportRow({ status: ReportStatus.IN_REVIEW });
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      report: {
        findUnique: vi.fn().mockResolvedValue(current),
        update: vi.fn(),
      },
      adminAuditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    } as unknown as PrismaService;

    await expect(
      new SafetyService(prisma).resolve(
        "report-1",
        { status: ReportStatus.IN_REVIEW },
        admin,
      ),
    ).resolves.toMatchObject({ status: "IN_REVIEW" });
    expect(transaction.report.update).not.toHaveBeenCalled();
    expect(transaction.adminAuditLog.create).not.toHaveBeenCalled();
  });

  it("rejects unsafe IDs before opening a transaction", async () => {
    const transaction = vi.fn();
    const service = new SafetyService({ $transaction: transaction } as unknown as PrismaService);

    await expect(
      service.resolve("../report", { status: ReportStatus.RESOLVED }, admin),
    ).rejects.toMatchObject({ status: 400 });
    expect(transaction).not.toHaveBeenCalled();
  });
});
