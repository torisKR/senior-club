import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  type AccountDeletionRequest,
  AccountDeletionStatus,
  ContentStatus,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { AccountDeletionService } from "./account-deletion.service";

const NOW = new Date("2026-09-30T00:00:00.000Z");
const principal: AuthenticatedPrincipal = {
  userId: "member-1",
  sessionId: "session-1",
  role: UserRole.MEMBER,
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

const CLAIM_SQL = `
  SELECT "id", "user_id" AS "userId", "status", "updated_at" AS "updatedAt"
  FROM "account_deletion_requests"
  WHERE "scheduled_for" <= NOW()
    AND (
      "status" = 'REQUESTED'::"AccountDeletionStatus"
      OR (
        "status" = 'FAILED'::"AccountDeletionStatus"
        AND "updated_at" <= NOW() - ? * INTERVAL '1 millisecond'
      )
      OR (
        "status" = 'PROCESSING'::"AccountDeletionStatus"
        AND "updated_at" <= NOW() - ? * INTERVAL '1 millisecond'
      )
    )
  ORDER BY "scheduled_for" ASC, "id" ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
`.replace(/\s+/g, " ").trim();

function createHarness(overrides: Partial<AccountDeletionRequest> = {}) {
  let state = {
    request: {
      id: "deletion-1",
      userId: principal.userId,
      status: AccountDeletionStatus.REQUESTED,
      reason: "private reason",
      requestedAt: new Date(NOW.getTime() - 7 * 86_400_000),
      scheduledFor: NOW,
      completedAt: null,
      failureCode: null,
      updatedAt: new Date(NOW.getTime() - 3_600_000),
      ...overrides,
    } as AccountDeletionRequest,
    user: {
      email: "member@example.com" as string | null,
      phoneNumber: "+821012345678" as string | null,
      name: "Member",
      status: UserStatus.ACTIVE as UserStatus,
      deletionRequestedAt: new Date(NOW.getTime() - 7 * 86_400_000) as Date | null,
      anonymizedAt: null as Date | null,
    },
    postContent: "private content",
    removed: new Set<string>(),
  };
  type State = typeof state;
  type RequestMutation = {
    where: { id: string; status?: AccountDeletionStatus; updatedAt?: Date };
    data: Partial<AccountDeletionRequest>;
  };
  const hooks: {
    beforeAnonymize?: () => Promise<void>;
    beforeUserUpdate?: () => Promise<void>;
    beforeFailureMark?: () => Promise<void>;
    beforeCancelUpdate?: () => Promise<void>;
    beforeCommit?: () => Promise<void>;
    missingUser?: boolean;
    loseCommitAcknowledgment?: boolean;
  } = {};
  let lock: { owner: symbol; released: ReturnType<typeof deferred> } | undefined;

  async function runTransaction<T>(callback: (client: ReturnType<typeof clientFor>) => Promise<T>) {
    const owner = Symbol("transaction");
    let draft: State | undefined;
    async function acquire() {
      while (lock && lock.owner !== owner) await lock.released.promise;
      if (!lock) lock = { owner, released: deferred() };
      draft ??= structuredClone(state);
    }
    const draftState = () => {
      if (!draft) throw new Error("write without row lock");
      return draft;
    };
    const transaction = clientFor(acquire, draftState, owner);
    transactions.push(transaction);
    try {
      const result = await callback(transaction);
      if (draft) {
        await hooks.beforeCommit?.();
        state = draft;
        if (hooks.loseCommitAcknowledgment) {
          hooks.loseCommitAcknowledgment = false;
          throw new Error("commit acknowledgment lost");
        }
      }
      return result;
    } finally {
      if (lock?.owner === owner) {
        const released = lock.released;
        lock = undefined;
        released.resolve();
      }
    }
  }

  function clientFor(acquire: () => Promise<void>, draftState: () => State, owner: symbol) {
    const remove = (model: string) => ({
      deleteMany: vi.fn(async (_args: unknown) => {
        draftState().removed.add(model);
        return { count: 1 };
      }),
    });
    return {
      // This simulator exercises interleavings and rollback without connecting
      // to a database. Pin the SQL separately; it does not emulate a SQL parser.
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: unknown[]) => {
        expect(strings.join("?").replace(/\s+/g, " ").trim()).toBe(CLAIM_SQL);
        expect(values).toEqual([300_000, 900_000]);
        if (lock && lock.owner !== owner) return [];
        const row = state.request;
        const age = Date.now() - row.updatedAt.getTime();
        const eligible = row.scheduledFor.getTime() <= Date.now() && (
          row.status === AccountDeletionStatus.REQUESTED ||
          (row.status === AccountDeletionStatus.FAILED && age >= 300_000) ||
          (row.status === AccountDeletionStatus.PROCESSING && age >= 900_000)
        );
        if (!eligible) return [];
        await acquire();
        return [structuredClone(draftState().request)];
      }),
      accountDeletionRequest: {
        findFirst: vi.fn(async () => state.request.status === AccountDeletionStatus.REQUESTED
          ? structuredClone(state.request) : null),
        update: vi.fn(async ({ data }: RequestMutation) => {
          await acquire();
          Object.assign(draftState().request, data, { updatedAt: new Date() });
          return structuredClone(draftState().request);
        }),
        updateMany: vi.fn(async ({ where, data }: RequestMutation) => {
          if (data.status === AccountDeletionStatus.CANCELED) await hooks.beforeCancelUpdate?.();
          await acquire();
          const row = draftState().request;
          if (row.id !== where.id || (where.status && row.status !== where.status) ||
            (where.updatedAt && row.updatedAt.getTime() !== where.updatedAt.getTime())) return { count: 0 };
          Object.assign(row, data, { updatedAt: new Date() });
          return { count: 1 };
        }),
      },
      user: {
        findUnique: vi.fn(async () => {
          await hooks.beforeAnonymize?.();
          return hooks.missingUser ? null : { email: draftState().user.email };
        }),
        update: vi.fn(async ({ data }: { data: Partial<State["user"]> }) => {
          await hooks.beforeUserUpdate?.();
          Object.assign(draftState().user, data);
          return draftState().user;
        }),
      },
      post: { updateMany: vi.fn(async ({ data }: { data: { content: string } }) => {
        draftState().postContent = data.content;
        return { count: 1 };
      }) },
      comment: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      review: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      chatMessage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      postAttachment: remove("postAttachment"),
      reviewAttachment: remove("reviewAttachment"),
      chatAttachment: remove("chatAttachment"),
      chatRoomMember: remove("chatRoomMember"),
      clubMember: remove("clubMember"),
      friendship: remove("friendship"),
      userBlock: remove("userBlock"),
      notification: remove("notification"),
      devicePushToken: remove("devicePushToken"),
      idempotencyRecord: remove("idempotencyRecord"),
      userInterest: remove("userInterest"),
      consentRecord: remove("consentRecord"),
      authIdentity: remove("authIdentity"),
      authSession: remove("authSession"),
      emailVerification: remove("emailVerification"),
      phoneVerification: remove("phoneVerification"),
    };
  }
  const transactions: Array<ReturnType<typeof clientFor>> = [];
  const failureMark = vi.fn(async (args: RequestMutation) => {
    await hooks.beforeFailureMark?.();
    return runTransaction((transaction) => transaction.accountDeletionRequest.updateMany(args));
  });
  const prisma = {
    $transaction: vi.fn(runTransaction),
    accountDeletionRequest: { updateMany: failureMark },
  };
  return {
    service: new AccountDeletionService(prisma as unknown as PrismaService),
    prisma, transactions, failureMark, hooks,
    updateRequest: (args: RequestMutation) => runTransaction((transaction) => transaction.accountDeletionRequest.updateMany(args)),
    state: () => structuredClone(state),
  };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("AccountDeletionService recovery", () => {
  it.each([AccountDeletionStatus.REQUESTED, AccountDeletionStatus.FAILED, AccountDeletionStatus.PROCESSING])(
    "atomically completes eligible %s and preserves the original grace schedule", async (status) => {
      const harness = createHarness({ status, failureCode: "legacy failure" });
      const original = harness.state().request;
      await expect(harness.service.processNext()).resolves.toBe(true);
      expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(harness.failureMark).not.toHaveBeenCalled();
      expect(harness.state().request).toMatchObject({
        status: AccountDeletionStatus.COMPLETED, reason: null, completedAt: NOW, failureCode: null,
        requestedAt: original.requestedAt, scheduledFor: original.scheduledFor,
      });
      expect(harness.state().user).toMatchObject({
        email: "deleted+member-1@invalid.local", phoneNumber: null, name: "탈퇴한 회원",
        status: UserStatus.WITHDRAWN, deletionRequestedAt: null, anonymizedAt: NOW,
      });
      expect(harness.state().removed).toEqual(new Set([
        "postAttachment", "reviewAttachment", "chatAttachment", "chatRoomMember", "clubMember",
        "friendship", "userBlock", "notification", "devicePushToken", "idempotencyRecord",
        "userInterest", "consentRecord", "authIdentity", "authSession", "emailVerification", "phoneVerification",
      ]));
      const transaction = harness.transactions[0]!;
      expect(transaction.post.updateMany).toHaveBeenCalledWith({
        where: { userId: principal.userId },
        data: {
          status: ContentStatus.DELETED,
          title: "삭제된 게시글",
          content: "작성자가 탈퇴하여 내용이 삭제되었습니다.",
        },
      });
      for (const model of [transaction.comment, transaction.review]) {
        expect(model.updateMany).toHaveBeenCalledWith({
          where: { userId: principal.userId },
          data: { status: ContentStatus.DELETED, content: "작성자가 탈퇴하여 내용이 삭제되었습니다." },
        });
      }
      expect(transaction.chatMessage.updateMany).toHaveBeenCalledWith({
        where: { userId: principal.userId }, data: { message: null, deletedAt: NOW },
      });
      expect(transaction.emailVerification.deleteMany).toHaveBeenCalledWith({
        where: { OR: [{ userId: principal.userId }, { email: "member@example.com" }] },
      });
      expect(transaction.user.update).toHaveBeenCalledWith({
        where: { id: principal.userId },
        data: {
          email: "deleted+member-1@invalid.local", phoneNumber: null, name: "탈퇴한 회원",
          birthYear: null, region: null, gender: null, avatarUrl: null, bio: null,
          status: UserStatus.WITHDRAWN, emailVerifiedAt: null, phoneVerifiedAt: null,
          onboardingCompletedAt: null, termsAgreedAt: null, marketingAgreedAt: null,
          lastLoginAt: null, deletionRequestedAt: null, anonymizedAt: NOW,
        },
      });
    },
  );

  it.each([AccountDeletionStatus.REQUESTED, AccountDeletionStatus.FAILED, AccountDeletionStatus.PROCESSING])(
    "never processes future-scheduled %s, even if its timestamp is old", async (status) => {
      const harness = createHarness({ status, scheduledFor: new Date(NOW.getTime() + 1) });
      const original = harness.state();
      await expect(harness.service.processNext()).resolves.toBe(false);
      expect(harness.state()).toEqual(original);
      expect(harness.transactions[0]!.user.findUnique).not.toHaveBeenCalled();
      expect(harness.failureMark).not.toHaveBeenCalled();
    },
  );

  it.each([AccountDeletionStatus.COMPLETED, AccountDeletionStatus.CANCELED])(
    "never reselects terminal %s", async (status) => {
      const harness = createHarness({ status });
      const original = harness.state();
      await expect(harness.service.processNext()).resolves.toBe(false);
      await expect(harness.service.processNext()).resolves.toBe(false);
      expect(harness.state()).toEqual(original);
      expect(harness.failureMark).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: AccountDeletionStatus.FAILED, delay: 300_000 },
    { status: AccountDeletionStatus.PROCESSING, delay: 900_000 },
  ])("waits for the exact $status recovery boundary", async ({ status, delay }) => {
    const harness = createHarness({ status, updatedAt: new Date(NOW.getTime() - delay + 1) });
    await expect(harness.service.processNext()).resolves.toBe(false);
    vi.setSystemTime(new Date(NOW.getTime() + 1));
    await expect(harness.service.processNext()).resolves.toBe(true);
  });

  it.each([AccountDeletionStatus.REQUESTED, AccountDeletionStatus.FAILED, AccountDeletionStatus.PROCESSING])(
    "rolls back partial anonymization of %s and marks only the original row version failed", async (status) => {
      const harness = createHarness({ status });
      const original = harness.state();
      const unsafe = Object.assign(new Error("token=secret phone=+821012345678"), { name: "Member private name" });
      harness.hooks.beforeUserUpdate = async () => { throw unsafe; };
      await expect(harness.service.processNext()).resolves.toBe(false);
      const after = harness.state();
      expect(after.user).toEqual(original.user);
      expect(after.postContent).toEqual(original.postContent);
      expect(after.removed.size).toBe(0);
      expect(after.request).toMatchObject({
        status: AccountDeletionStatus.FAILED, failureCode: "ACCOUNT_DELETION_FAILED",
        updatedAt: NOW, scheduledFor: original.request.scheduledFor, completedAt: null,
      });
      expect(harness.failureMark).toHaveBeenCalledWith({
        where: { id: original.request.id, status, updatedAt: original.request.updatedAt },
        data: { status: AccountDeletionStatus.FAILED, failureCode: "ACCOUNT_DELETION_FAILED" },
      });
      delete harness.hooks.beforeUserUpdate;
      await expect(harness.service.processNext()).resolves.toBe(false);
      vi.setSystemTime(new Date(NOW.getTime() + 300_000));
      await expect(harness.service.processNext()).resolves.toBe(true);
    },
  );

  it("recovers after a crash at commit and unavailable failure marking", async () => {
    const harness = createHarness();
    const original = harness.state();
    harness.hooks.beforeCommit = async () => { throw new Error("connection lost before commit"); };
    harness.hooks.beforeFailureMark = async () => { throw new Error("connection unavailable"); };
    await expect(harness.service.processNext()).rejects.toThrow("connection unavailable");
    expect(harness.state()).toEqual(original);
    delete harness.hooks.beforeCommit;
    delete harness.hooks.beforeFailureMark;
    await expect(harness.service.processNext()).resolves.toBe(true);
    expect(harness.state().request.status).toBe(AccountDeletionStatus.COMPLETED);
  });

  it("does not overwrite a successful commit when its acknowledgment is lost", async () => {
    const harness = createHarness();
    harness.hooks.loseCommitAcknowledgment = true;
    await expect(harness.service.processNext()).resolves.toBe(false);
    expect(harness.state().request).toMatchObject({ status: AccountDeletionStatus.COMPLETED, failureCode: null });
    expect(harness.state().user.status).toBe(UserStatus.WITHDRAWN);
  });

  it("does not leave PROCESSING when the user lookup unexpectedly returns no row", async () => {
    const harness = createHarness();
    harness.hooks.missingUser = true;
    await expect(harness.service.processNext()).resolves.toBe(false);
    expect(harness.state().request.status).toBe(AccountDeletionStatus.FAILED);
    expect(harness.state().removed.size).toBe(0);
  });

  it("skips a locked row across independent service instances until atomic commit", async () => {
    const harness = createHarness({ status: AccountDeletionStatus.PROCESSING });
    const entered = deferred();
    const release = deferred();
    harness.hooks.beforeAnonymize = async () => { entered.resolve(); await release.promise; };
    const first = harness.service.processNext();
    await entered.promise;
    expect(harness.state().user.status).toBe(UserStatus.ACTIVE);
    const second = new AccountDeletionService(harness.prisma as unknown as PrismaService);
    await expect(second.processNext()).resolves.toBe(false);
    release.resolve();
    await expect(first).resolves.toBe(true);
    await expect(second.processNext()).resolves.toBe(false);
    expect(harness.state().request.status).toBe(AccountDeletionStatus.COMPLETED);
  });

  it.each(["complete", "cancel", "newer failure"])(
    "does not let a delayed failure overwrite concurrent %s", async (winner) => {
      const harness = createHarness({
        status: winner === "newer failure" ? AccountDeletionStatus.FAILED : AccountDeletionStatus.REQUESTED,
      });
      const marking = deferred();
      const releaseMark = deferred();
      harness.hooks.beforeUserUpdate = async () => { throw new Error("temporary failure"); };
      harness.hooks.beforeFailureMark = async () => { marking.resolve(); await releaseMark.promise; };
      const failing = harness.service.processNext();
      await marking.promise;
      delete harness.hooks.beforeUserUpdate;
      if (winner === "cancel") {
        await harness.service.cancel(principal);
      } else if (winner === "complete") {
        await harness.service.processNext();
      } else {
        // A newer failed attempt has the same status, so updatedAt is essential.
        await harness.updateRequest({
          where: { id: "deletion-1" },
          data: { status: AccountDeletionStatus.FAILED, failureCode: "NEWER_ATTEMPT" },
        });
      }
      const won = harness.state();
      releaseMark.resolve();
      await expect(failing).resolves.toBe(false);
      expect(harness.state()).toEqual(won);
    },
  );
});

describe("AccountDeletionService request grace period", () => {
  it.each([false, true])("preserves the seven-day schedule when an existing request is %s", async (exists) => {
    const scheduledFor = new Date(NOW.getTime() + 7 * 86_400_000);
    const existing = {
      id: "deletion-1", status: AccountDeletionStatus.REQUESTED,
      requestedAt: new Date(NOW.getTime() - 86_400_000),
      scheduledFor: new Date(scheduledFor.getTime() - 86_400_000), completedAt: null,
    };
    const transaction = {
      accountDeletionRequest: {
        findFirst: vi.fn().mockResolvedValue(exists ? existing : null),
        create: vi.fn(async ({ data }: { data: { scheduledFor: Date } }) => ({
          ...existing, requestedAt: NOW, scheduledFor: data.scheduledFor,
        })),
      },
      user: { update: vi.fn().mockResolvedValue({}) },
      devicePushToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      authSession: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      outboxEvent: { create: vi.fn().mockResolvedValue({}) },
    };
    const prisma = {
      authSession: { findUnique: vi.fn().mockResolvedValue({
        createdAt: NOW, user: { email: "member@example.com", role: UserRole.MEMBER, status: UserStatus.ACTIVE },
      }) },
      $transaction: vi.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => callback(transaction)),
    };
    const service = new AccountDeletionService(prisma as unknown as PrismaService);
    const result = await service.request({ confirmation: "계정 삭제" }, principal);
    expect(result.scheduledFor).toBe((exists ? existing.scheduledFor : scheduledFor).toISOString());
    if (exists) {
      expect(transaction.accountDeletionRequest.create).not.toHaveBeenCalled();
    } else {
      expect(transaction.accountDeletionRequest.create).toHaveBeenCalledWith({
        data: { userId: principal.userId, reason: null, scheduledFor },
      });
      expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
        where: { userId: principal.userId, revokedAt: null }, data: { revokedAt: NOW },
      });
      expect(transaction.devicePushToken.updateMany).toHaveBeenCalledWith({
        where: { userId: principal.userId, disabledAt: null }, data: { disabledAt: NOW },
      });
    }
  });
});

describe("AccountDeletionService cancellation", () => {
  it("cancels first and prevents anonymization", async () => {
    const harness = createHarness();
    await expect(harness.service.cancel(principal)).resolves.toEqual({ success: true });
    await expect(harness.service.processNext()).resolves.toBe(false);
    expect(harness.state().request.status).toBe(AccountDeletionStatus.CANCELED);
    expect(harness.state().user).toMatchObject({ status: UserStatus.ACTIVE, deletionRequestedAt: null });
  });

  it("rolls back cancellation if clearing the user's deletion flag fails", async () => {
    const harness = createHarness();
    const original = harness.state();
    harness.hooks.beforeUserUpdate = async () => { throw new Error("database unavailable"); };
    await expect(harness.service.cancel(principal)).rejects.toThrow("database unavailable");
    expect(harness.state()).toEqual(original);
    delete harness.hooks.beforeUserUpdate;
    await expect(harness.service.processNext()).resolves.toBe(true);
  });

  it("waits for processing and cannot overwrite its completion", async () => {
    const harness = createHarness();
    const entered = deferred();
    const release = deferred();
    const cancelStarted = deferred();
    harness.hooks.beforeAnonymize = async () => { entered.resolve(); await release.promise; };
    harness.hooks.beforeCancelUpdate = async () => { cancelStarted.resolve(); };
    const processing = harness.service.processNext();
    await entered.promise;
    const cancellation = expect(harness.service.cancel(principal)).rejects.toMatchObject({
      response: { error: { code: "DELETION_REQUEST_NOT_FOUND" } },
    });
    await cancelStarted.promise;
    release.resolve();
    await expect(processing).resolves.toBe(true);
    await cancellation;
    expect(harness.state().request.status).toBe(AccountDeletionStatus.COMPLETED);
    expect(harness.transactions[1]!.user.update).not.toHaveBeenCalled();
  });

  it.each([AccountDeletionStatus.FAILED, AccountDeletionStatus.PROCESSING, AccountDeletionStatus.COMPLETED, AccountDeletionStatus.CANCELED])(
    "does not cancel %s or clear the user's deletion flag", async (status) => {
      const harness = createHarness({ status });
      const original = harness.state();
      await expect(harness.service.cancel(principal)).rejects.toMatchObject({
        response: { error: { code: "DELETION_REQUEST_NOT_FOUND" } },
      });
      expect(harness.state()).toEqual(original);
    },
  );
});
