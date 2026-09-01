import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Optional,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { TokenService } from "../auth/token.service";
import type { ApiEnv } from "../config/env";
import { API_ENV } from "../config/env.module";
import {
  AttendanceStatus,
  EventMemberStatus,
  EventStatus,
  NotificationType,
  OutboxStatus,
  UserStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EMAIL_SENDER, type EmailSender } from "./email.sender";
import { PUSH_SENDER, type PushSender } from "./push.sender";
import { SMS_SENDER, type SmsSender } from "./sms.sender";

const otpPayloadSchema = z.object({
  challengeId: z.string(),
  email: z.email(),
  sealedCode: z.string(),
  expiresAt: z.iso.datetime(),
});

const applicationPayloadSchema = z.object({
  notificationId: z.string(),
  recipientUserId: z.string(),
  email: z.email().nullable().optional(),
  eventId: z.string(),
  eventTitle: z.string().min(1).max(300),
  status: z.string(),
});

const accountDeletionPayloadSchema = z.object({
  email: z.email().nullable().optional(),
  scheduledFor: z.iso.datetime(),
});

const phoneOtpPayloadSchema = z.object({
  challengeId: z.string(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{9,14}$/),
  sealedCode: z.string(),
  expiresAt: z.iso.datetime(),
});

const reviewRequestPayloadSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(128),
  })
  .strict();

const reviewRequestNotificationPayloadSchema = z
  .object({
    applicationId: z.string().trim().min(1).max(128),
    eventId: z.string().trim().min(1).max(128),
    sourceDedupKey: z.string().trim().min(1).max(200),
  })
  .strict();

type ReviewRequestPreparation =
  | { kind: "skip" }
  | { kind: "reschedule"; availableAt: Date }
  | {
      kind: "send";
      notificationId: string;
      userId: string;
      eventId: string;
      eventTitle: string;
    };

const reviewRequestEventStatuses = new Set<EventStatus>([
  EventStatus.PUBLISHED,
  EventStatus.CLOSED,
  EventStatus.COMPLETED,
]);

type ClaimedOutboxEvent = {
  id: string;
  type: string;
  dedupKey: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
};

export const OUTBOX_PROCESSING_LOCK_TIMEOUT_MS = 5 * 60 * 1_000;
export const OUTBOX_LEASE_CLEANUP_INTERVAL_MS = 5 * 60 * 1_000;
export const OUTBOX_BATCH_SIZE = 25;

@Injectable()
export class OutboxWorker
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly workerId = `api-${process.pid}-${randomUUID()}`;
  private interval: NodeJS.Timeout | null = null;
  private draining = false;
  private lastLeaseCleanupAt: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    @Inject(EMAIL_SENDER) private readonly email: EmailSender,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Optional() @Inject(SMS_SENDER) private readonly sms?: SmsSender,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.OUTBOX_WORKER_ENABLED) return;
    this.interval = setInterval(
      () => this.scheduleDrain(),
      this.env.OUTBOX_POLL_INTERVAL_MS,
    );
    this.interval.unref();
    this.scheduleDrain();
  }

  onApplicationShutdown() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  async drainOnce() {
    if (this.draining) return 0;
    this.draining = true;
    try {
      const events = await this.claimBatch(OUTBOX_BATCH_SIZE);
      for (const event of events) {
        await this.processOne(event);
      }
      return events.length;
    } finally {
      this.draining = false;
    }
  }

  private scheduleDrain() {
    void this.drainOnce().catch((error: unknown) => {
      this.logger.error(
        `Outbox drain failed: ${this.safeError(error)}`,
      );
    });
  }

  private async claimBatch(limit: number): Promise<ClaimedOutboxEvent[]> {
    const observedAt = Date.now();
    const shouldCleanStaleTerminalLeases =
      this.lastLeaseCleanupAt === null ||
      observedAt - this.lastLeaseCleanupAt >=
        OUTBOX_LEASE_CLEANUP_INTERVAL_MS;

    const events = await this.prisma.$transaction(async (transaction) => {
      const staleBefore = new Date(
        observedAt - OUTBOX_PROCESSING_LOCK_TIMEOUT_MS,
      );

      // A crashed worker may have consumed its final attempt. Release that
      // stale lease as terminal FAILED instead of leaving it PROCESSING forever.
      // This maintenance update is deliberately throttled: the regular claim
      // query already reclaims retryable leases on every poll.
      if (shouldCleanStaleTerminalLeases) {
        await transaction.$executeRaw`
          UPDATE "outbox_events"
          SET "status" = 'FAILED'::"OutboxStatus",
              "locked_at" = NULL,
              "locked_by" = NULL,
              "last_error" = 'Processing lock expired after maximum attempts',
              "updated_at" = NOW()
          WHERE "status" = 'PROCESSING'::"OutboxStatus"
            AND "locked_at" <= ${staleBefore}
            AND "attempts" >= "max_attempts"
        `;
      }

      const rows = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "outbox_events"
        WHERE (
            (
              "status" IN ('PENDING'::"OutboxStatus", 'FAILED'::"OutboxStatus")
              AND "available_at" <= NOW()
            )
            OR (
              "status" = 'PROCESSING'::"OutboxStatus"
              AND "locked_at" <= ${staleBefore}
            )
          )
          AND "attempts" < "max_attempts"
        ORDER BY "created_at" ASC
        LIMIT ${limit}
        FOR UPDATE SKIP LOCKED
      `;
      const ids = rows.map((row) => row.id);
      if (ids.length === 0) return [];

      await transaction.outboxEvent.updateMany({
        where: { id: { in: ids } },
        data: {
          status: OutboxStatus.PROCESSING,
          attempts: { increment: 1 },
          lockedAt: new Date(),
          lockedBy: this.workerId,
        },
      });
      return transaction.outboxEvent.findMany({
        where: { id: { in: ids }, lockedBy: this.workerId },
        select: {
          id: true,
          type: true,
          dedupKey: true,
          payload: true,
          attempts: true,
          maxAttempts: true,
        },
        orderBy: { createdAt: "asc" },
      });
    });

    if (shouldCleanStaleTerminalLeases) {
      this.lastLeaseCleanupAt = observedAt;
    }
    return events;
  }

  private async processOne(event: ClaimedOutboxEvent) {
    try {
      if (event.type === "AUTH_OTP_REQUESTED") {
        const payload = otpPayloadSchema.parse(event.payload);
        if (new Date(payload.expiresAt).getTime() <= Date.now()) {
          this.logger.warn(`Expired OTP outbox event ${event.id} was discarded`);
        } else {
          await this.email.sendOtp({
            email: payload.email,
            code: this.tokens.openOtp(payload.sealedCode),
            expiresAt: payload.expiresAt,
            idempotencyKey: event.dedupKey,
          });
        }
      } else if (event.type === "AUTH_PHONE_OTP_REQUESTED") {
        const payload = phoneOtpPayloadSchema.parse(event.payload);
        if (new Date(payload.expiresAt).getTime() <= Date.now()) {
          this.logger.warn(`Expired phone OTP outbox event ${event.id} was discarded`);
        } else if (!this.sms) {
          throw new Error("SMS sender is not configured");
        } else {
          await this.sms.sendOtp({
            phoneNumber: payload.phoneNumber,
            code: this.tokens.openOtp(payload.sealedCode),
            expiresAt: payload.expiresAt,
            idempotencyKey: event.dedupKey,
          });
        }
      } else if (event.type === "EVENT_APPLICATION_EMAIL") {
        const payload = applicationPayloadSchema.parse(event.payload);
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { userId: payload.recipientUserId },
          select: { emailEventUpdates: true },
        });
        if (payload.email && (preference?.emailEventUpdates ?? true)) {
          await this.email.sendApplicationUpdate({
            email: payload.email,
            eventTitle: payload.eventTitle,
            status: payload.status,
            idempotencyKey: event.dedupKey,
          });
        }
      } else if (event.type === "EVENT_APPLICATION_PUSH") {
        const payload = applicationPayloadSchema.parse(event.payload);
        await this.push.sendApplicationUpdate({
          userId: payload.recipientUserId,
          eventId: payload.eventId,
          eventTitle: payload.eventTitle,
          status: payload.status,
        });
      } else if (event.type === "EVENT_APPLICATION_CHANGED") {
        // Backward compatibility for events queued before delivery channels
        // were split. New events always use independent email/push retries.
        const payload = applicationPayloadSchema.parse(event.payload);
        const preference = await this.prisma.notificationPreference.findUnique({
          where: { userId: payload.recipientUserId },
          select: { emailEventUpdates: true },
        });
        if (payload.email && (preference?.emailEventUpdates ?? true)) {
          await this.email.sendApplicationUpdate({
            email: payload.email,
            eventTitle: payload.eventTitle,
            status: payload.status,
            idempotencyKey: event.dedupKey,
          });
        }
        await this.push.sendApplicationUpdate({
          userId: payload.recipientUserId,
          eventId: payload.eventId,
          eventTitle: payload.eventTitle,
          status: payload.status,
        });
      } else if (event.type === "EVENT_REVIEW_REQUEST_READY") {
        const payload = reviewRequestPayloadSchema.parse(event.payload);
        const preparation = await this.prepareReviewRequest(
          payload.applicationId,
          event.dedupKey,
        );
        if (preparation.kind === "reschedule") {
          await this.reschedule(event, preparation.availableAt);
          return;
        }
        if (preparation.kind === "send") {
          await this.push.sendReviewRequest({
            notificationId: preparation.notificationId,
            userId: preparation.userId,
            eventId: preparation.eventId,
            eventTitle: preparation.eventTitle,
          });
        }
      } else if (event.type === "ACCOUNT_DELETION_REQUESTED") {
        const payload = accountDeletionPayloadSchema.parse(event.payload);
        if (payload.email) {
          await this.email.sendAccountDeletionRequested({
            email: payload.email,
            scheduledFor: payload.scheduledFor,
            idempotencyKey: event.dedupKey,
          });
        }
      } else {
        throw new Error(`Unsupported outbox event type: ${event.type}`);
      }

      const result = await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: OutboxStatus.PROCESSING,
          lockedBy: this.workerId,
        },
        data: {
          status: OutboxStatus.PROCESSED,
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      if (result.count === 0) {
        this.logger.warn(`Outbox event ${event.id} lost its processing lease`);
      }
    } catch (error) {
      // Attempts are incremented atomically when a row is claimed, so crashes
      // and provider failures are both bounded by maxAttempts.
      const attempts = event.attempts;
      const backoffSeconds = Math.min(2 ** attempts * 15, 3_600);
      await this.prisma.outboxEvent.updateMany({
        where: {
          id: event.id,
          status: OutboxStatus.PROCESSING,
          lockedBy: this.workerId,
        },
        data: {
          status: OutboxStatus.FAILED,
          availableAt: new Date(Date.now() + backoffSeconds * 1_000),
          lockedAt: null,
          lockedBy: null,
          lastError: this.safeError(error),
        },
      });
      this.logger.warn(`Outbox event ${event.id} failed (attempt ${attempts})`);
    }
  }

  private async prepareReviewRequest(
    applicationId: string,
    sourceDedupKey: string,
  ): Promise<ReviewRequestPreparation> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "event_members" WHERE "id" = ${applicationId} FOR UPDATE
      `;
      const application = await transaction.eventMember.findUnique({
        where: { id: applicationId },
        select: {
          id: true,
          eventId: true,
          userId: true,
          status: true,
          attendance: true,
          user: { select: { status: true } },
          event: {
            select: {
              id: true,
              title: true,
              status: true,
              startAt: true,
              endAt: true,
            },
          },
        },
      });
      if (
        !application ||
        application.status !== EventMemberStatus.APPROVED ||
        application.attendance !== AttendanceStatus.ATTENDED ||
        application.user.status !== UserStatus.ACTIVE ||
        !reviewRequestEventStatuses.has(application.event.status)
      ) {
        return { kind: "skip" };
      }

      const reviewsOpenAt = application.event.endAt ?? application.event.startAt;
      if (reviewsOpenAt > new Date()) {
        return { kind: "reschedule", availableAt: reviewsOpenAt };
      }

      const existingReview = await transaction.review.findUnique({
        where: {
          eventId_userId: {
            eventId: application.eventId,
            userId: application.userId,
          },
        },
        select: { id: true },
      });
      if (existingReview) return { kind: "skip" };

      const link = `/reviews/new?eventId=${application.eventId}`;
      const legacyNotification = await transaction.notification.findFirst({
        where: {
          recipientId: application.userId,
          type: NotificationType.REVIEW_REQUEST,
          link,
        },
        select: { id: true, payload: true },
      });
      const notificationId =
        legacyNotification?.id ?? `review-request:${application.id}`;
      if (legacyNotification) {
        const previousPayload = reviewRequestNotificationPayloadSchema.safeParse(
          legacyNotification.payload,
        );
        if (
          previousPayload.success &&
          previousPayload.data.sourceDedupKey !== sourceDedupKey
        ) {
          return { kind: "skip" };
        }
        if (!previousPayload.success) {
          await transaction.notification.update({
            where: { id: legacyNotification.id },
            data: {
              payload: {
                applicationId: application.id,
                eventId: application.eventId,
                sourceDedupKey,
              },
            },
            select: { id: true },
          });
        }
      } else {
        await transaction.notification.upsert({
          where: { id: notificationId },
          update: {},
          create: {
            id: notificationId,
            recipientId: application.userId,
            type: NotificationType.REVIEW_REQUEST,
            title: "모임 후기를 남겨주세요",
            body: application.event.title,
            link,
            payload: {
              applicationId: application.id,
              eventId: application.eventId,
              sourceDedupKey,
            },
          },
          select: { id: true },
        });
      }
      return {
        kind: "send",
        notificationId,
        userId: application.userId,
        eventId: application.eventId,
        eventTitle: application.event.title,
      };
    });
  }

  private async reschedule(event: ClaimedOutboxEvent, availableAt: Date) {
    const result = await this.prisma.outboxEvent.updateMany({
      where: {
        id: event.id,
        status: OutboxStatus.PROCESSING,
        lockedBy: this.workerId,
      },
      data: {
        status: OutboxStatus.PENDING,
        availableAt,
        attempts: { decrement: 1 },
        lockedAt: null,
        lockedBy: null,
        lastError: null,
      },
    });
    if (result.count === 0) {
      this.logger.warn(`Outbox event ${event.id} lost its processing lease`);
    }
  }

  private safeError(error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return message.replace(/[\r\n\t]+/g, " ").slice(0, 1_000);
  }
}
