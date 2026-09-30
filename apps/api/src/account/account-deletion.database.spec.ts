import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { databaseTestUrl } from "../../scripts/database-qa.mjs";
import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import {
  AccountDeletionStatus,
  AttachmentType,
  AuthProvider,
  ConsentDocumentType,
  ContentStatus,
  DevicePlatform,
  EventDifficulty,
  Gender,
  NotificationType,
  PrismaClient,
  SessionClientType,
  UserRole,
  UserStatus,
  VerificationPurpose,
} from "../generated/prisma/client";
import type { PrismaService } from "../prisma/prisma.service";
import { AccountDeletionService } from "./account-deletion.service";

// Validate before constructing any adapter/client. A normal unit run skips all
// tests, and DATABASE_URL alone never enables fixture writes or cleanup.
const databaseUrl = databaseTestUrl();
const describeWithDatabase = databaseUrl ? describe : describe.skip;
const MINUTE = 60_000;
const eligible = [
  { status: AccountDeletionStatus.REQUESTED, age: 0 },
  { status: AccountDeletionStatus.FAILED, age: 6 * MINUTE },
  { status: AccountDeletionStatus.PROCESSING, age: 16 * MINUTE },
];
const excluded = [
  { label: "FAILED inside the five-minute cooldown", status: AccountDeletionStatus.FAILED, age: 4 * MINUTE, future: false },
  { label: "PROCESSING inside the fifteen-minute lease", status: AccountDeletionStatus.PROCESSING, age: 14 * MINUTE, future: false },
  ...eligible.map(({ status }) => ({ label: `future ${status}`, status, age: 60 * MINUTE, future: true })),
  ...[AccountDeletionStatus.COMPLETED, AccountDeletionStatus.CANCELED].map((status) => ({
    label: `terminal ${status}`, status, age: 60 * MINUTE, future: false,
  })),
];

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function bounded<T>(promise: Promise<T>, label: string, milliseconds = 2_500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Timed out: ${label}`)), milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describeWithDatabase("AccountDeletionService PostgreSQL recovery and row locks", () => {
  const prefix = `deletion-qa-${randomUUID()}`;
  const workerApplication = `${prefix}-worker`;
  const cancelApplication = `${prefix}-cancel`;
  const peerId = `${prefix}-peer`;
  const interestId = `${prefix}-interest`;
  const clubId = `${prefix}-club`;
  const eventId = `${prefix}-event`;
  const roomId = `${prefix}-room`;
  const ownedUsers = new Set<string>();
  const unlinkedVerifications = new Set<string>();
  let sequence = 0;
  let prisma: PrismaClient;
  let service: AccountDeletionService;

  const asService = (client: unknown) => new AccountDeletionService(client as PrismaService);
  const principal = (userId: string): AuthenticatedPrincipal => ({
    userId, sessionId: `${userId}-session`, role: UserRole.MEMBER,
  });
  const client = (applicationName: string) => new PrismaClient({
    adapter: new PrismaPg({
      connectionString: databaseUrl!, application_name: applicationName,
      max: 4, connectionTimeoutMillis: 2_000, statement_timeout: 5_000,
    }),
    transactionOptions: { maxWait: 2_000, timeout: 10_000 },
  });

  async function databaseNow() {
    const [row] = await prisma.$queryRaw<Array<{ now: Date }>>`SELECT clock_timestamp() AS now`;
    if (!row) throw new Error("PostgreSQL clock missing");
    return row.now;
  }

  beforeAll(async () => {
    prisma = client(workerApplication);
    service = asService(prisma);
    // processNext is a global queue consumer. Refuse an existing due queue
    // instead of processing or deleting another suite's fixtures.
    const [queue] = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count FROM account_deletion_requests
      WHERE scheduled_for <= NOW() AND status IN ('REQUESTED', 'FAILED', 'PROCESSING')
    `;
    expect(queue?.count).toBe(0n);
    const now = await databaseNow();
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({ data: { id: peerId, name: "삭제 회귀 테스트 동료" } });
      await transaction.interest.create({ data: {
        id: interestId, slug: interestId, name: interestId, icon: "test",
      } });
      await transaction.club.create({ data: {
        id: clubId, interestId, leaderId: peerId, slug: clubId,
        title: "삭제 회귀 테스트 모임", description: "격리된 테스트 모임",
      } });
      await transaction.event.create({ data: {
        id: eventId, clubId, creatorId: peerId, title: "삭제 회귀 테스트 행사",
        description: "격리된 테스트 행사", locationName: "테스트", address: "테스트",
        startAt: now, capacity: 10, difficulty: EventDifficulty.EASY,
      } });
      await transaction.chatRoom.create({ data: { id: roomId, eventId } });
    });
  });

  async function cleanupFixtures() {
    const userId = { in: [...ownedUsers] };
    await prisma.$transaction(async (transaction) => {
      await transaction.comment.deleteMany({ where: { userId } });
      await transaction.post.deleteMany({ where: { userId } });
      await transaction.review.deleteMany({ where: { userId } });
      await transaction.chatMessage.deleteMany({ where: { userId } });
      await transaction.chatRoomMember.deleteMany({ where: { userId } });
      await transaction.clubMember.deleteMany({ where: { userId } });
      await transaction.emailVerification.deleteMany({ where: { id: { in: [...unlinkedVerifications] } } });
      // All other fixture relations, including requests, cascade from our IDs.
      await transaction.user.deleteMany({ where: { id: userId } });
    });
    ownedUsers.clear();
    unlinkedVerifications.clear();
  }

  afterAll(async () => {
    if (!prisma) return;
    try {
      await cleanupFixtures();
      await prisma.chatRoom.deleteMany({ where: { id: roomId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
      await prisma.club.deleteMany({ where: { id: clubId } });
      await prisma.interest.deleteMany({ where: { id: interestId } });
      await prisma.user.deleteMany({ where: { id: peerId } });
    } finally {
      await prisma.$disconnect();
    }
  });

  type FixtureOptions = { status: AccountDeletionStatus; age: number; future?: boolean; rich?: boolean };
  async function createFixture({ status, age, future = false, rich = false }: FixtureOptions) {
    const userId = `${prefix}-${++sequence}`;
    const requestId = `${userId}-request`;
    const email = `${userId}@seniorclub.test`;
    const phoneNumber = `qa-phone-${userId}`;
    const now = await databaseNow();
    const requestedAt = new Date(now.getTime() - 8 * 86_400_000);
    const scheduledFor = new Date(now.getTime() + (future ? 60 * MINUTE : -MINUTE));
    ownedUsers.add(userId);
    await prisma.user.create({ data: {
      id: userId, email, phoneNumber, name: "개인정보 회귀 테스트 회원",
      birthYear: 1957, region: "비공개 지역", gender: Gender.OTHER,
      avatarUrl: `https://media.invalid/${userId}/portrait`, bio: "비공개 자기소개",
      emailVerifiedAt: requestedAt, phoneVerifiedAt: requestedAt,
      onboardingCompletedAt: requestedAt, termsAgreedAt: requestedAt,
      marketingAgreedAt: requestedAt, lastLoginAt: requestedAt, deletionRequestedAt: requestedAt,
    } });
    if (rich) {
      const postId = `${userId}-post`;
      const reviewId = `${userId}-review`;
      const messageId = `${userId}-message`;
      await prisma.post.create({ data: {
        id: postId, userId, clubId, title: "비공개 게시글 제목", content: "비공개 게시글 본문",
        attachments: { create: { id: `${postId}-attachment`, type: AttachmentType.IMAGE, url: `https://media.invalid/${postId}` } },
      } });
      await prisma.comment.create({ data: { id: `${userId}-comment`, userId, postId, content: "비공개 댓글" } });
      await prisma.review.create({ data: {
        id: reviewId, userId, eventId, rating: 4, content: "비공개 후기 본문",
        attachments: { create: { id: `${reviewId}-attachment`, url: `https://media.invalid/${reviewId}` } },
      } });
      await prisma.chatMessage.create({ data: {
        id: messageId, userId, roomId, message: "비공개 대화",
        attachments: { create: { id: `${messageId}-attachment`, type: AttachmentType.FILE, url: `https://media.invalid/${messageId}` } },
      } });
      await prisma.chatRoomMember.create({ data: { userId, roomId } });
      await prisma.clubMember.create({ data: { id: `${userId}-membership`, userId, clubId } });
      await prisma.friendship.create({ data: {
        id: `${userId}-friendship`, requesterId: userId, addresseeId: peerId, pairKey: `${userId}:${peerId}`,
      } });
      await prisma.userBlock.create({ data: { id: `${userId}-block`, blockerId: peerId, blockedId: userId } });
      await prisma.notification.create({ data: {
        id: `${userId}-notification`, recipientId: userId, type: NotificationType.SYSTEM,
        title: "비공개 알림", body: "비공개 알림 내용",
      } });
      await prisma.devicePushToken.create({ data: {
        id: `${userId}-push`, userId, token: `${userId}-push-secret`, platform: DevicePlatform.ANDROID,
      } });
      await prisma.idempotencyRecord.create({ data: {
        id: `${userId}-idempotency`, userId, route: "/qa", key: "qa-key",
        requestHash: "qa-hash", responseBody: { private: "개인 응답" }, expiresAt: now,
      } });
      await prisma.userInterest.create({ data: { userId, interestId } });
      await prisma.consentRecord.create({ data: {
        id: `${userId}-consent`, userId, documentType: ConsentDocumentType.TERMS,
        version: "qa", granted: true, source: "qa",
      } });
      await prisma.authIdentity.create({ data: {
        id: `${userId}-identity`, userId, provider: AuthProvider.EMAIL,
        providerAccountId: email, passwordHash: `${userId}-password-secret`,
      } });
      await prisma.authSession.create({ data: {
        id: `${userId}-session`, userId, refreshTokenHash: `${userId}-refresh-secret`,
        clientType: SessionClientType.ANDROID, expiresAt: now,
      } });
      const unlinkedId = `${userId}-unlinked-verification`;
      unlinkedVerifications.add(unlinkedId);
      await prisma.emailVerification.createMany({ data: [
        { id: `${userId}-verification`, userId, email, purpose: VerificationPurpose.EMAIL_VERIFICATION, codeHash: "private-code", expiresAt: now },
        { id: unlinkedId, email, purpose: VerificationPurpose.LOGIN, codeHash: "unlinked-private-code", expiresAt: now },
      ] });
      await prisma.phoneVerification.create({ data: {
        id: `${userId}-phone-verification`, userId, phoneNumber, purpose: VerificationPurpose.LOGIN,
        codeHash: "private-phone-code", expiresAt: now,
      } });
    }
    // Explicit timestamps avoid wall-clock sleeps and satisfy the DB schedule
    // constraint. The request is created last, after all private fixture data.
    await prisma.accountDeletionRequest.create({ data: {
      id: requestId, userId, status, reason: "비공개 탈퇴 사유", requestedAt, scheduledFor,
      updatedAt: new Date(now.getTime() - age),
      completedAt: status === AccountDeletionStatus.COMPLETED ? now : null,
      failureCode: status === AccountDeletionStatus.FAILED ? "PREVIOUS_FAILURE" : null,
    } });
    return { userId, requestId, email, scheduledFor };
  }

  type Fixture = Awaited<ReturnType<typeof createFixture>>;
  async function withFixture(options: FixtureOptions, run: (fixture: Fixture) => Promise<void>) {
    try {
      await run(await createFixture(options));
    } finally {
      await cleanupFixtures();
    }
  }

  async function privateSnapshot({ userId, email }: Fixture) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: {
      posts: { include: { attachments: true } }, comments: true,
      reviews: { include: { attachments: true } }, chatMessages: { include: { attachments: true } },
      chatMemberships: true, clubMemberships: true,
      requestedFriendships: true, receivedFriendships: true, initiatedBlocks: true, receivedBlocks: true,
      notifications: true, devicePushTokens: true, idempotencyRecords: true,
      interests: true, consentRecords: true, authIdentities: true, authSessions: true, phoneVerifications: true,
    } });
    const emailVerifications = await prisma.emailVerification.findMany({ where: { email }, orderBy: { id: "asc" } });
    return { user, emailVerifications };
  }

  const readRequest = ({ requestId }: Fixture) => prisma.accountDeletionRequest.findUniqueOrThrow({ where: { id: requestId } });

  async function expectCompleted(fixture: Fixture, rich = false) {
    expect(await readRequest(fixture)).toMatchObject({
      status: AccountDeletionStatus.COMPLETED, reason: null, failureCode: null,
      scheduledFor: fixture.scheduledFor, completedAt: expect.any(Date),
    });
    const { user, emailVerifications } = await privateSnapshot(fixture);
    expect(user).toMatchObject({
      email: `deleted+${fixture.userId}@invalid.local`, name: "탈퇴한 회원", status: UserStatus.WITHDRAWN,
      phoneNumber: null, birthYear: null, region: null, gender: null, avatarUrl: null, bio: null,
      emailVerifiedAt: null, phoneVerifiedAt: null, onboardingCompletedAt: null,
      termsAgreedAt: null, marketingAgreedAt: null, lastLoginAt: null,
      deletionRequestedAt: null, anonymizedAt: expect.any(Date),
    });
    expect(emailVerifications).toEqual([]);
    for (const rows of [user.chatMemberships, user.clubMemberships, user.requestedFriendships,
      user.receivedFriendships, user.initiatedBlocks, user.receivedBlocks, user.notifications,
      user.devicePushTokens, user.idempotencyRecords, user.interests, user.consentRecords,
      user.authIdentities, user.authSessions, user.phoneVerifications]) {
      expect(rows).toEqual([]);
    }
    if (rich) {
      const deletedContent = "작성자가 탈퇴하여 내용이 삭제되었습니다.";
      expect(user.posts).toMatchObject([{ status: ContentStatus.DELETED, title: "삭제된 게시글", content: deletedContent, attachments: [] }]);
      expect(user.comments).toMatchObject([{ status: ContentStatus.DELETED, content: deletedContent }]);
      expect(user.reviews).toMatchObject([{ status: ContentStatus.DELETED, content: deletedContent, attachments: [] }]);
      expect(user.chatMessages).toMatchObject([{ message: null, deletedAt: expect.any(Date), attachments: [] }]);
    }
  }

  // Query extensions delegate each user query to Prisma's actual transaction.
  // Only after a real read/write may a barrier pause it or an injected throw
  // trigger rollback; raw SQL, all other writes and commit/rollback stay real.
  function instrumentUser(userId: string, hooks: { afterRead?: () => Promise<void>; afterWrite?: () => Promise<void> }) {
    return asService(prisma.$extends({ query: { user: {
      async findUnique({ args, query }) {
        const result = await query(args);
        if (args.where.id === userId) await hooks.afterRead?.();
        return result;
      },
      async update({ args, query }) {
        const result = await query(args);
        if (args.where.id === userId && args.data.anonymizedAt) await hooks.afterWrite?.();
        return result;
      },
    } } }));
  }

  it.each(eligible)("commits anonymization for due $status", async (candidate) => {
    await withFixture({ ...candidate, rich: true }, async (fixture) => {
      await expect(service.processNext()).resolves.toBe(true);
      await expectCompleted(fixture, true);
      const committed = await readRequest(fixture);
      await expect(service.processNext()).resolves.toBe(false);
      expect(await readRequest(fixture)).toEqual(committed);
    });
  });

  it.each(excluded)("excludes $label without changing private data or the request", async (candidate) => {
    await withFixture(candidate, async (fixture) => {
      const original = await privateSnapshot(fixture);
      const request = await readRequest(fixture);
      await expect(service.processNext()).resolves.toBe(false);
      expect(await privateSnapshot(fixture)).toEqual(original);
      expect(await readRequest(fixture)).toEqual(request);
    });
  });

  it.each(eligible)("rolls back actual anonymization writes for $status and preserves its schedule", async (candidate) => {
    await withFixture({ ...candidate, rich: true }, async (fixture) => {
      const original = await privateSnapshot(fixture);
      const request = await readRequest(fixture);
      let writes = 0;
      const failing = instrumentUser(fixture.userId, { afterWrite: async () => {
        writes += 1;
        throw new Error("private-token=qa-secret private-name=회귀회원");
      } });
      await expect(failing.processNext()).resolves.toBe(false);
      expect(writes).toBe(1);
      expect(await privateSnapshot(fixture)).toEqual(original);
      const failed = await readRequest(fixture);
      expect(failed).toEqual({
        ...request, status: AccountDeletionStatus.FAILED, failureCode: "ACCOUNT_DELETION_FAILED",
        updatedAt: expect.any(Date),
      });
      expect(failed.updatedAt.getTime()).toBeGreaterThanOrEqual(request.updatedAt.getTime());
      await expect(service.processNext()).resolves.toBe(false);
      expect(await readRequest(fixture)).toEqual(failed);
      expect(await privateSnapshot(fixture)).toEqual(original);
      // Age only this fixture's retry timestamp in PostgreSQL, then retry with
      // the uninstrumented service. Never wait five minutes or change its due date.
      const now = await databaseNow();
      await prisma.accountDeletionRequest.update({ where: { id: fixture.requestId }, data: {
        updatedAt: new Date(now.getTime() - 6 * MINUTE),
      } });
      await expect(service.processNext()).resolves.toBe(true);
      await expectCompleted(fixture, true);
    });
  });

  it.each(eligible)("SKIP LOCKED lets a concurrent worker return without processing locked $status twice", async (candidate) => {
    await withFixture(candidate, async (fixture) => {
      const entered = deferred();
      const release = deferred();
      let reads = 0;
      const firstService = instrumentUser(fixture.userId, { afterRead: async () => {
        reads += 1;
        entered.resolve();
        await bounded(release.promise, "release worker row lock", 8_000);
      } });
      const processing = firstService.processNext();
      // Attach rejection handlers before awaiting barriers, including when a
      // SQL failure prevents the transaction from reaching its user read.
      const settled: Promise<unknown>[] = [Promise.allSettled([processing])];
      try {
        await bounded(entered.promise, "worker acquired the request row");
        expect(await readRequest(fixture)).toMatchObject({ status: candidate.status });
        expect((await privateSnapshot(fixture)).user.status).toBe(UserStatus.ACTIVE);
        const competing = instrumentUser(fixture.userId, { afterRead: async () => {
          reads += 1;
        } }).processNext();
        settled.push(Promise.allSettled([competing]));
        await expect(bounded(competing, "SKIP LOCKED competitor")).resolves.toBe(false);
        expect(reads).toBe(1);
        release.resolve();
        await expect(bounded(processing, "worker commit")).resolves.toBe(true);
        await expectCompleted(fixture);
        await expect(service.processNext()).resolves.toBe(false);
        expect(reads).toBe(1);
      } finally {
        release.resolve();
        await Promise.all(settled);
      }
    });
  });

  async function waitForCancellationLock() {
    const retries = new AbortController();
    try {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [row] = await prisma.$queryRaw<Array<{ blocked: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity AS waiter
            WHERE waiter.application_name = ${cancelApplication}
              AND waiter.state = 'active' AND waiter.wait_event_type = 'Lock'
              AND waiter.query ILIKE '%UPDATE%account_deletion_requests%'
              AND EXISTS (
                SELECT 1 FROM pg_stat_activity AS holder
                WHERE holder.pid = ANY(pg_blocking_pids(waiter.pid))
                  AND holder.application_name = ${workerApplication}
              )
          ) AS blocked
        `;
        if (row?.blocked) return;
        await delay(20, undefined, { signal: retries.signal });
      }
      throw new Error("Cancellation never waited on the worker's PostgreSQL row lock");
    } finally {
      retries.abort();
    }
  }

  it("a cancellation waiting on the real row lock cannot overwrite committed completion", async () => {
    await withFixture(eligible[0]!, async (fixture) => {
      const entered = deferred();
      const release = deferred();
      const cancelClient = client(cancelApplication);
      const processing = instrumentUser(fixture.userId, { afterRead: async () => {
        entered.resolve();
        await bounded(release.promise, "release cancellation row lock", 8_000);
      } }).processNext();
      const settled: Promise<unknown>[] = [Promise.allSettled([processing])];
      try {
        await bounded(entered.promise, "worker acquired the cancellation target");
        // The uncommitted PROCESSING update is invisible to cancellation. Its
        // SELECT sees REQUESTED and its CAS UPDATE must wait, then recheck.
        expect(await readRequest(fixture)).toMatchObject({ status: AccountDeletionStatus.REQUESTED });
        const cancellation = asService(cancelClient).cancel(principal(fixture.userId));
        const cancellationResult = Promise.allSettled([cancellation]);
        settled.push(cancellationResult);
        await waitForCancellationLock();
        release.resolve();
        await expect(bounded(processing, "commit before cancellation")).resolves.toBe(true);
        expect(await bounded(cancellationResult, "cancellation CAS after commit")).toMatchObject([{
          status: "rejected", reason: { status: 404, response: { error: { code: "DELETION_REQUEST_NOT_FOUND" } } },
        }]);
        await expectCompleted(fixture);
      } finally {
        release.resolve();
        try { await Promise.all(settled); } finally { await cancelClient.$disconnect(); }
      }
    });
  });

  it("a cancellation committed first excludes its request and preserves private data", async () => {
    await withFixture({ ...eligible[0]!, rich: true }, async (fixture) => {
      const original = await privateSnapshot(fixture);
      const request = await readRequest(fixture);
      await expect(service.cancel(principal(fixture.userId))).resolves.toEqual({ success: true });
      await expect(service.processNext()).resolves.toBe(false);
      const after = await privateSnapshot(fixture);
      expect(after).toEqual({ ...original, user: {
        ...original.user, deletionRequestedAt: null, updatedAt: expect.any(Date),
      } });
      expect(await readRequest(fixture)).toEqual({
        ...request, status: AccountDeletionStatus.CANCELED, updatedAt: expect.any(Date),
      });
    });
  });
});
