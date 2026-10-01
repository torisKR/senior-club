import {
  AttendanceStatus,
  EventMemberStatus,
  EventStatus,
  OutboxStatus,
  UserStatus,
} from "../generated/prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { TokenService } from "../auth/token.service";
import type { ApiEnv } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { EmailSender } from "./email.sender";
import { DisabledChannelError } from "./disabled-channel.error";
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_LEASE_CLEANUP_INTERVAL_MS,
  OUTBOX_PROCESSING_LOCK_TIMEOUT_MS,
  OutboxWorker,
} from "./outbox.worker";
import type { PushSender } from "./push.sender";

const NOW = new Date("2026-07-29T12:00:00.000Z");

function createHarness(
  sendError?: Error,
  type = "ACCOUNT_DELETION_REQUESTED",
  payload: unknown = {
    email: "member@example.com",
    scheduledFor: "2026-08-05T00:00:00.000Z",
  },
) {
  const claimedEvent = {
    id: "outbox-1",
    type,
    dedupKey: "account-deletion:request-1:requested",
    payload,
    attempts: 2,
    maxAttempts: 5,
  };
  const transaction = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{ id: claimedEvent.id }]),
    outboxEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([claimedEvent]),
    },
  };
  const finalUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const preferenceLookup = vi.fn().mockResolvedValue({ emailEventUpdates: true });
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    outboxEvent: { updateMany: finalUpdate },
    notificationPreference: { findUnique: preferenceLookup },
  } as unknown as PrismaService;
  const email = {
    sendOtp: vi.fn().mockResolvedValue(undefined),
    sendApplicationUpdate: vi.fn().mockResolvedValue(undefined),
    sendAccountDeletionRequested: sendError
      ? vi.fn().mockRejectedValue(sendError)
      : vi.fn().mockResolvedValue(undefined),
  } satisfies EmailSender;
  const push = {
    sendApplicationUpdate: vi.fn().mockResolvedValue(undefined),
    sendReviewRequest: vi.fn().mockResolvedValue(undefined),
  } satisfies PushSender;
  const tokens = {
    openOtp: vi.fn().mockReturnValue("123456"),
  } as unknown as TokenService;
  const env = {
    OUTBOX_WORKER_ENABLED: false,
    OUTBOX_POLL_INTERVAL_MS: 5_000,
    ACCOUNT_DELETION_POLL_INTERVAL_MS: 300_000,
  } as unknown as ApiEnv;

  return {
    worker: new OutboxWorker(prisma, tokens, email, push, env),
    transaction,
    finalUpdate,
    email,
    push,
    preferenceLookup,
    claimedEvent,
    tokens,
  };
}

describe("OutboxWorker", () => {
  it("reclaims a five-minute stale lease and forwards its dedup key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const harness = createHarness();

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      const terminalSql = Array.from(
        harness.transaction.$executeRaw.mock.calls[0]![0] as TemplateStringsArray,
      ).join(" ");
      expect(terminalSql).toContain('"attempts" >= "max_attempts"');

      const claimCall = harness.transaction.$queryRaw.mock.calls[0]!;
      const claimSql = Array.from(
        claimCall[0] as TemplateStringsArray,
      ).join(" ");
      expect(claimSql).toContain("'PROCESSING'::\"OutboxStatus\"");
      expect(claimCall[1]).toEqual(
        new Date(NOW.getTime() - OUTBOX_PROCESSING_LOCK_TIMEOUT_MS),
      );
      expect(claimCall[2]).toBe(OUTBOX_BATCH_SIZE);
      expect(
        harness.transaction.outboxEvent.updateMany.mock.calls[0]![0],
      ).toMatchObject({
        data: {
          status: OutboxStatus.PROCESSING,
          attempts: { increment: 1 },
        },
      });
      expect(harness.email.sendAccountDeletionRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          idempotencyKey: "account-deletion:request-1:requested",
        }),
      );
      expect(harness.finalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: OutboxStatus.PROCESSING,
            lockedBy: expect.stringMatching(/^api-\d+-/),
          }),
          data: expect.objectContaining({ status: OutboxStatus.PROCESSED }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("throttles terminal stale-lease maintenance to one update per interval", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const harness = createHarness();

      await harness.worker.drainOnce();
      await harness.worker.drainOnce();
      expect(harness.transaction.$executeRaw).toHaveBeenCalledTimes(1);

      vi.setSystemTime(
        new Date(NOW.getTime() + OUTBOX_LEASE_CLEANUP_INTERVAL_MS),
      );
      await harness.worker.drainOnce();
      expect(harness.transaction.$executeRaw).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not double-increment an attempt when provider delivery fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const harness = createHarness(new Error("provider unavailable"));

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      const failureUpdate = harness.finalUpdate.mock.calls[0]![0];
      expect(failureUpdate.data).toMatchObject({
        status: OutboxStatus.FAILED,
        availableAt: new Date(NOW.getTime() + 60_000),
      });
      expect(failureUpdate.data).not.toHaveProperty("attempts");
      expect(failureUpdate.where).toMatchObject({
        status: OutboxStatus.PROCESSING,
        lockedBy: expect.stringMatching(/^api-\d+-/),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("records an explicit terminal failure for a disabled outbound provider", async () => {
    const harness = createHarness(new DisabledChannelError("EMAIL_PROVIDER"));
    await expect(harness.worker.drainOnce()).resolves.toBe(1);
    expect(harness.finalUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OutboxStatus.FAILED, attempts: 5, lastError: "EMAIL_PROVIDER=disabled: delivery unavailable" }) }));
  });

  it.each(["AUTH_OTP_REQUESTED", "AUTH_PHONE_OTP_REQUESTED"])("retires legacy %s without decrypting or delivering OTP", async (type) => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const harness = createHarness(undefined, type);

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      expect(harness.email.sendOtp).not.toHaveBeenCalled();
      expect(harness.tokens.openOtp).not.toHaveBeenCalled();
      expect(harness.finalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OutboxStatus.FAILED, attempts: 5, lastError: "AUTH_PROVIDER=disabled: delivery unavailable" }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

const applicationPayload = {
  notificationId: "notification-1",
  recipientUserId: "member-1",
  email: "member@example.com",
  eventId: "event-1",
  eventTitle: "봄날 사진 산책",
  status: "APPROVED",
};

function createApplicationUpdateHarness(
  emailError?: Error,
  pushError?: Error,
  type = "EVENT_APPLICATION_CHANGED",
) {
  const harness = createHarness(undefined, type, { ...applicationPayload });
  harness.claimedEvent.dedupKey = "application:application-1:APPROVED";
  if (emailError) harness.email.sendApplicationUpdate.mockRejectedValue(emailError);
  if (pushError) harness.push.sendApplicationUpdate.mockRejectedValue(pushError);
  return harness;
}

describe("OutboxWorker legacy application delivery", () => {
  it.each([
    { emailDisabled: false, pushDisabled: false },
    { emailDisabled: true, pushDisabled: false },
    { emailDisabled: false, pushDisabled: true },
    { emailDisabled: true, pushDisabled: true },
  ])(
    "isolates disabled channels (email=$emailDisabled, push=$pushDisabled)",
    async ({ emailDisabled, pushDisabled }) => {
      const harness = createApplicationUpdateHarness(
        emailDisabled ? new DisabledChannelError("EMAIL_PROVIDER") : undefined,
        pushDisabled ? new DisabledChannelError("PUSH_PROVIDER") : undefined,
      );

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      expect(harness.email.sendApplicationUpdate).toHaveBeenCalledExactlyOnceWith({
        email: applicationPayload.email,
        eventTitle: applicationPayload.eventTitle,
        status: applicationPayload.status,
        idempotencyKey: harness.claimedEvent.dedupKey,
      });
      expect(harness.push.sendApplicationUpdate).toHaveBeenCalledExactlyOnceWith({
        userId: applicationPayload.recipientUserId,
        eventId: applicationPayload.eventId,
        eventTitle: applicationPayload.eventTitle,
        status: applicationPayload.status,
      });
      expect(harness.finalUpdate).toHaveBeenCalledOnce();
      const update = harness.finalUpdate.mock.calls[0]![0];
      expect(update.where).toEqual({
        id: harness.claimedEvent.id,
        status: OutboxStatus.PROCESSING,
        lockedBy: expect.stringMatching(/^api-\d+-/),
      });
      expect(update.data).toMatchObject({ lockedAt: null, lockedBy: null });
      if (emailDisabled && pushDisabled) {
        expect(update.data).toMatchObject({
          status: OutboxStatus.FAILED,
          attempts: harness.claimedEvent.maxAttempts,
          lastError: "EMAIL_PROVIDER=disabled: delivery unavailable",
        });
        expect(update.data).not.toHaveProperty("processedAt");
      } else {
        expect(update.data).toMatchObject({
          status: OutboxStatus.PROCESSED,
          lastError: null,
          processedAt: expect.any(Date),
        });
        expect(update.data).not.toHaveProperty("attempts");
      }
    },
  );

  it.each([
    { failedChannel: "push", otherDisabled: true },
    { failedChannel: "email", otherDisabled: true },
    { failedChannel: "push", otherDisabled: false },
    { failedChannel: "email", otherDisabled: false },
  ] as const)(
    "retries $failedChannel provider failures when the other channel disabled=$otherDisabled",
    async ({ failedChannel, otherDisabled }) => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        const providerError = new Error(`${failedChannel} provider unavailable`);
        const harness = createApplicationUpdateHarness(
          failedChannel === "email"
            ? providerError
            : otherDisabled
              ? new DisabledChannelError("EMAIL_PROVIDER")
              : undefined,
          failedChannel === "push"
            ? providerError
            : otherDisabled
              ? new DisabledChannelError("PUSH_PROVIDER")
              : undefined,
        );

        await expect(harness.worker.drainOnce()).resolves.toBe(1);

        expect(harness.email.sendApplicationUpdate).toHaveBeenCalledOnce();
        expect(harness.push.sendApplicationUpdate).toHaveBeenCalledOnce();
        const update = harness.finalUpdate.mock.calls[0]![0];
        expect(update.data).toMatchObject({
          status: OutboxStatus.FAILED,
          availableAt: new Date(NOW.getTime() + 60_000),
          lastError: providerError.message,
          lockedAt: null,
          lockedBy: null,
        });
        expect(update.data).not.toHaveProperty("attempts");
        expect(update.data).not.toHaveProperty("processedAt");

        const retryingSender = failedChannel === "email"
          ? harness.email.sendApplicationUpdate
          : harness.push.sendApplicationUpdate;
        retryingSender.mockResolvedValue(undefined);
        harness.claimedEvent.attempts += 1;
        vi.setSystemTime(new Date(NOW.getTime() + 60_000));

        await expect(harness.worker.drainOnce()).resolves.toBe(1);

        expect(harness.finalUpdate).toHaveBeenCalledTimes(2);
        expect(harness.finalUpdate.mock.calls[1]![0].data).toMatchObject({
          status: OutboxStatus.PROCESSED,
          lastError: null,
        });
        expect(harness.transaction.outboxEvent.updateMany).toHaveBeenCalledTimes(2);
        for (const [claim] of harness.transaction.outboxEvent.updateMany.mock.calls) {
          expect(claim.data.attempts).toEqual({ increment: 1 });
        }
        expect(harness.email.sendApplicationUpdate.mock.calls[1]![0]).toMatchObject({
          idempotencyKey: harness.claimedEvent.dedupKey,
        });
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    { reason: "no email address", noEmail: true, pushDisabled: false },
    { reason: "email opt-out", noEmail: false, pushDisabled: false },
    { reason: "no email address", noEmail: true, pushDisabled: true },
    { reason: "email opt-out", noEmail: false, pushDisabled: true },
  ])(
    "respects $reason with push disabled=$pushDisabled",
    async ({ noEmail, pushDisabled }) => {
      const harness = createApplicationUpdateHarness(
        new DisabledChannelError("EMAIL_PROVIDER"),
        pushDisabled ? new DisabledChannelError("PUSH_PROVIDER") : undefined,
      );
      if (noEmail) {
        harness.claimedEvent.payload = { ...applicationPayload, email: null };
      } else {
        harness.preferenceLookup.mockResolvedValue({ emailEventUpdates: false });
      }

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      expect(harness.email.sendApplicationUpdate).not.toHaveBeenCalled();
      expect(harness.push.sendApplicationUpdate).toHaveBeenCalledOnce();
      const update = harness.finalUpdate.mock.calls[0]![0];
      if (pushDisabled) {
        expect(update.data).toMatchObject({
          status: OutboxStatus.FAILED,
          attempts: harness.claimedEvent.maxAttempts,
          lastError: "PUSH_PROVIDER=disabled: delivery unavailable",
        });
      } else {
        expect(update.data).toMatchObject({
          status: OutboxStatus.PROCESSED,
          lastError: null,
        });
      }
    },
  );

  it.each(["EVENT_APPLICATION_EMAIL", "EVENT_APPLICATION_PUSH"])(
    "keeps split %s failures independent and terminal when disabled",
    async (type) => {
      const emailOnly = type === "EVENT_APPLICATION_EMAIL";
      const harness = createApplicationUpdateHarness(
        emailOnly ? new DisabledChannelError("EMAIL_PROVIDER") : undefined,
        emailOnly ? undefined : new DisabledChannelError("PUSH_PROVIDER"),
        type,
      );

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      expect(harness.email.sendApplicationUpdate).toHaveBeenCalledTimes(emailOnly ? 1 : 0);
      expect(harness.push.sendApplicationUpdate).toHaveBeenCalledTimes(emailOnly ? 0 : 1);
      expect(harness.finalUpdate.mock.calls[0]![0].data).toMatchObject({
        status: OutboxStatus.FAILED,
        attempts: harness.claimedEvent.maxAttempts,
        lastError: `${emailOnly ? "EMAIL" : "PUSH"}_PROVIDER=disabled: delivery unavailable`,
      });
    },
  );
});

function createReviewRequestHarness(
  options: {
    payload?: unknown;
    attendance?: AttendanceStatus;
    memberStatus?: EventMemberStatus;
    userStatus?: UserStatus;
    eventStatus?: EventStatus;
    endAt?: Date | null;
    existingReview?: boolean;
    dedupKey?: string;
    existingNotification?: { id: string; payload: unknown };
  } = {},
) {
  const applicationId = "application-review-1";
  const claimedEvent = {
    id: "outbox-review-1",
    type: "EVENT_REVIEW_REQUEST_READY",
    dedupKey:
      options.dedupKey ??
      `review-request:${applicationId}:ready:2026-07-30T04:00:00.000Z`,
    payload: options.payload ?? { applicationId },
    attempts: 1,
    maxAttempts: 8,
  };
  const claimTransaction = {
    $executeRaw: vi.fn().mockResolvedValue(0),
    $queryRaw: vi.fn().mockResolvedValue([{ id: claimedEvent.id }]),
    outboxEvent: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      findMany: vi.fn().mockResolvedValue([claimedEvent]),
    },
  };
  const application = {
    id: applicationId,
    eventId: "event-review-1",
    userId: "member-review-1",
    status: options.memberStatus ?? EventMemberStatus.APPROVED,
    attendance: options.attendance ?? AttendanceStatus.ATTENDED,
    user: { status: options.userStatus ?? UserStatus.ACTIVE },
    event: {
      id: "event-review-1",
      title: "봄날 사진 산책",
      status: options.eventStatus ?? EventStatus.COMPLETED,
      startAt: new Date("2026-07-29T10:00:00.000Z"),
      endAt:
        options.endAt === undefined
          ? new Date("2026-07-29T11:00:00.000Z")
          : options.endAt,
    },
  };
  const notificationUpsert = vi
    .fn()
    .mockResolvedValue({ id: `review-request:${applicationId}` });
  const deliveryTransaction = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: applicationId }]),
    eventMember: { findUnique: vi.fn().mockResolvedValue(application) },
    review: {
      findUnique: vi
        .fn()
        .mockResolvedValue(options.existingReview ? { id: "review-1" } : null),
    },
    notification: {
      findFirst: vi.fn().mockResolvedValue(options.existingNotification ?? null),
      upsert: notificationUpsert,
      update: vi.fn().mockResolvedValue({ id: "legacy-review-notification" }),
    },
  };
  let transactionCount = 0;
  const transaction = vi.fn(
    async (
      callback: (
        client: typeof claimTransaction | typeof deliveryTransaction,
      ) => Promise<unknown>,
    ) => {
      transactionCount += 1;
      return callback(
        transactionCount === 1 ? claimTransaction : deliveryTransaction,
      );
    },
  );
  const finalUpdate = vi.fn().mockResolvedValue({ count: 1 });
  const prisma = {
    $transaction: transaction,
    outboxEvent: { updateMany: finalUpdate },
  } as unknown as PrismaService;
  const push = {
    sendApplicationUpdate: vi.fn().mockResolvedValue(undefined),
    sendReviewRequest: vi.fn().mockResolvedValue(undefined),
  } satisfies PushSender;
  const email = {
    sendOtp: vi.fn().mockResolvedValue(undefined),
    sendApplicationUpdate: vi.fn().mockResolvedValue(undefined),
    sendAccountDeletionRequested: vi.fn().mockResolvedValue(undefined),
  } satisfies EmailSender;
  const tokens = { openOtp: vi.fn() } as unknown as TokenService;
  const env = {
    OUTBOX_WORKER_ENABLED: false,
    OUTBOX_POLL_INTERVAL_MS: 5_000,
  } as unknown as ApiEnv;

  return {
    worker: new OutboxWorker(prisma, tokens, email, push, env),
    transaction,
    claimTransaction,
    deliveryTransaction,
    finalUpdate,
    push,
    application,
  };
}

describe("OutboxWorker review requests", () => {
  it("revalidates eligibility, upserts one in-app notification, and sends push", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const harness = createReviewRequestHarness();

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      expect(harness.transaction).toHaveBeenCalledTimes(2);
      expect(harness.deliveryTransaction.$queryRaw).toHaveBeenCalledOnce();
      expect(
        harness.deliveryTransaction.eventMember.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: harness.application.id },
        select: expect.objectContaining({
          status: true,
          attendance: true,
          user: { select: { status: true } },
        }),
      });
      expect(harness.deliveryTransaction.notification.upsert).toHaveBeenCalledWith({
        where: { id: `review-request:${harness.application.id}` },
        update: {},
        create: expect.objectContaining({
          id: `review-request:${harness.application.id}`,
          recipientId: harness.application.userId,
          type: "REVIEW_REQUEST",
          link: `/reviews/new?eventId=${harness.application.eventId}`,
        }),
        select: { id: true },
      });
      expect(harness.push.sendReviewRequest).toHaveBeenCalledWith({
        notificationId: `review-request:${harness.application.id}`,
        userId: harness.application.userId,
        eventId: harness.application.eventId,
        eventTitle: harness.application.event.title,
      });
      expect(harness.finalUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: OutboxStatus.PROCESSED }),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    { label: "no-show", attendance: AttendanceStatus.NO_SHOW },
    { label: "unapproved", memberStatus: EventMemberStatus.CANCELED },
    { label: "inactive user", userStatus: UserStatus.SUSPENDED },
    { label: "canceled event", eventStatus: EventStatus.CANCELED },
    { label: "existing review", existingReview: true },
  ])("discards a permanently ineligible $label request", async (options) => {
    const harness = createReviewRequestHarness(options);

    await expect(harness.worker.drainOnce()).resolves.toBe(1);

    expect(harness.push.sendReviewRequest).not.toHaveBeenCalled();
    expect(harness.deliveryTransaction.notification.upsert).not.toHaveBeenCalled();
    expect(harness.finalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.PROCESSED }),
      }),
    );
  });

  it("reschedules without consuming an attempt when the event end moves", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    try {
      const movedEnd = new Date("2026-07-29T13:00:00.000Z");
      const harness = createReviewRequestHarness({ endAt: movedEnd });

      await expect(harness.worker.drainOnce()).resolves.toBe(1);

      expect(harness.push.sendReviewRequest).not.toHaveBeenCalled();
      expect(harness.finalUpdate).toHaveBeenCalledOnce();
      expect(harness.finalUpdate).toHaveBeenCalledWith({
        where: {
          id: "outbox-review-1",
          status: OutboxStatus.PROCESSING,
          lockedBy: expect.stringMatching(/^api-\d+-/),
        },
        data: {
          status: OutboxStatus.PENDING,
          availableAt: movedEnd,
          attempts: { decrement: 1 },
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects extra payload fields before reading private application data", async () => {
    const harness = createReviewRequestHarness({
      payload: { applicationId: "application-review-1", eventTitle: "spoof" },
    });

    await expect(harness.worker.drainOnce()).resolves.toBe(1);

    expect(harness.transaction).toHaveBeenCalledOnce();
    expect(harness.deliveryTransaction.eventMember.findUnique).not.toHaveBeenCalled();
    expect(harness.push.sendReviewRequest).not.toHaveBeenCalled();
    expect(harness.finalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.FAILED }),
      }),
    );
  });

  it("reuses a legacy in-app notification instead of creating a duplicate", async () => {
    const harness = createReviewRequestHarness({
      existingNotification: {
        id: "legacy-review-notification",
        payload: null,
      },
    });

    await harness.worker.drainOnce();

    expect(harness.deliveryTransaction.notification.upsert).not.toHaveBeenCalled();
    expect(harness.deliveryTransaction.notification.update).toHaveBeenCalledWith({
      where: { id: "legacy-review-notification" },
      data: {
        payload: {
          applicationId: harness.application.id,
          eventId: harness.application.eventId,
          sourceDedupKey:
            `review-request:${harness.application.id}:ready:2026-07-30T04:00:00.000Z`,
        },
      },
      select: { id: true },
    });
    expect(harness.push.sendReviewRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: "legacy-review-notification",
      }),
    );
  });

  it("retries push for the same attendance version without duplicating the notification", async () => {
    const dedupKey =
      "review-request:application-review-1:ready:2026-07-30T04:00:00.000Z";
    const harness = createReviewRequestHarness({
      dedupKey,
      existingNotification: {
        id: "review-request:application-review-1",
        payload: {
          applicationId: "application-review-1",
          eventId: "event-review-1",
          sourceDedupKey: dedupKey,
        },
      },
    });

    await harness.worker.drainOnce();

    expect(harness.deliveryTransaction.notification.upsert).not.toHaveBeenCalled();
    expect(harness.deliveryTransaction.notification.update).not.toHaveBeenCalled();
    expect(harness.push.sendReviewRequest).toHaveBeenCalledOnce();
  });

  it("suppresses push from a later attendance version after one request was created", async () => {
    const priorDedupKey =
      "review-request:application-review-1:ready:2026-07-30T04:00:00.000Z";
    const harness = createReviewRequestHarness({
      dedupKey:
        "review-request:application-review-1:ready:2026-07-30T05:00:00.000Z",
      existingNotification: {
        id: "review-request:application-review-1",
        payload: {
          applicationId: "application-review-1",
          eventId: "event-review-1",
          sourceDedupKey: priorDedupKey,
        },
      },
    });

    await harness.worker.drainOnce();

    expect(harness.push.sendReviewRequest).not.toHaveBeenCalled();
    expect(harness.deliveryTransaction.notification.upsert).not.toHaveBeenCalled();
    expect(harness.deliveryTransaction.notification.update).not.toHaveBeenCalled();
    expect(harness.finalUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: OutboxStatus.PROCESSED }),
      }),
    );
  });
});
