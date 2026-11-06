import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import {
  AccountDeletionStatus,
  ContentStatus,
  type Prisma,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type { RequestAccountDeletionInput } from "./account.contracts";

const REAUTH_WINDOW_MS = 10 * 60 * 1_000;
const DELETION_GRACE_DAYS = 7;
export const ACCOUNT_DELETION_FAILED_COOLDOWN_MS = 5 * 60 * 1_000;
export const ACCOUNT_DELETION_STALE_PROCESSING_MS = 15 * 60 * 1_000;

type ClaimedDeletion = {
  id: string;
  userId: string;
  status: AccountDeletionStatus;
  updatedAt: Date;
};

@Injectable()
export class AccountDeletionService {
  constructor(private readonly prisma: PrismaService) {}

  async request(
    input: RequestAccountDeletionInput,
    principal: AuthenticatedPrincipal,
  ) {
    const session = await this.prisma.authSession.findUnique({
      where: { id: principal.sessionId },
      select: {
        createdAt: true,
        user: { select: { email: true, role: true, status: true } },
      },
    });
    if (!session || session.user.status !== UserStatus.ACTIVE) {
      throw new ApiException(
        HttpStatus.UNAUTHORIZED,
        "INVALID_SESSION",
        "다시 로그인해 주세요.",
      );
    }
    if (Date.now() - session.createdAt.getTime() > REAUTH_WINDOW_MS) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "RECENT_AUTHENTICATION_REQUIRED",
        "계정 보호를 위해 로그아웃한 뒤 다시 로그인해 주세요.",
      );
    }
    if (session.user.role !== UserRole.MEMBER) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        "ACCOUNT_HANDOFF_REQUIRED",
        "리더 또는 관리자 계정은 담당 역할을 인계한 뒤 탈퇴할 수 있습니다.",
      );
    }

    const now = new Date();
    const scheduledFor = new Date(
      now.getTime() + DELETION_GRACE_DAYS * 86_400_000,
    );
    const result = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.accountDeletionRequest.findFirst({
        where: {
          userId: principal.userId,
          status: AccountDeletionStatus.REQUESTED,
        },
        orderBy: { requestedAt: "desc" },
      });
      if (existing) return existing;

      const request = await transaction.accountDeletionRequest.create({
        data: {
          userId: principal.userId,
          reason: input.reason ?? null,
          scheduledFor,
        },
      });
      await transaction.user.update({
        where: { id: principal.userId },
        data: { deletionRequestedAt: now },
      });
      await transaction.devicePushToken.updateMany({
        where: { userId: principal.userId, disabledAt: null },
        data: { disabledAt: now },
      });
      await transaction.authSession.updateMany({
        where: { userId: principal.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      if (session.user.email) {
        await transaction.outboxEvent.create({
          data: {
            type: "ACCOUNT_DELETION_REQUESTED",
            aggregateType: "AccountDeletionRequest",
            aggregateId: request.id,
            dedupKey: `account-deletion:${request.id}:requested`,
            payload: {
              email: session.user.email,
              scheduledFor: scheduledFor.toISOString(),
            },
          },
        });
      }
      return request;
    });
    return this.toResponse(result);
  }

  async current(principal: AuthenticatedPrincipal) {
    const request = await this.prisma.accountDeletionRequest.findFirst({
      where: {
        userId: principal.userId,
        status: {
          in: [
            AccountDeletionStatus.REQUESTED,
            AccountDeletionStatus.PROCESSING,
            AccountDeletionStatus.FAILED,
          ],
        },
      },
      orderBy: { requestedAt: "desc" },
    });
    return request ? this.toResponse(request) : null;
  }

  async cancel(principal: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async (transaction) => {
      const request = await transaction.accountDeletionRequest.findFirst({
        where: {
          userId: principal.userId,
          status: AccountDeletionStatus.REQUESTED,
        },
        orderBy: { requestedAt: "desc" },
      });
      if (request) {
        // This update takes the same row lock as processing. Recheck after any
        // wait so a worker's committed completion cannot be canceled.
        const canceled = await transaction.accountDeletionRequest.updateMany({
          where: {
            id: request.id,
            status: AccountDeletionStatus.REQUESTED,
            updatedAt: request.updatedAt,
          },
          data: { status: AccountDeletionStatus.CANCELED },
        });
        if (canceled.count === 1) {
          await transaction.user.update({
            where: { id: principal.userId },
            data: { deletionRequestedAt: null },
          });
          return { success: true as const };
        }
      }
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "DELETION_REQUEST_NOT_FOUND",
        "취소할 탈퇴 요청이 없습니다.",
      );
    });
  }

  async processNext() {
    let claimed: ClaimedDeletion | undefined;
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const rows = await transaction.$queryRaw<ClaimedDeletion[]>`
          SELECT "id", "user_id" AS "userId", "status", "updated_at" AS "updatedAt"
          FROM "account_deletion_requests"
          WHERE "scheduled_for" <= NOW()
            AND (
              "status" = 'REQUESTED'::"AccountDeletionStatus"
              OR (
                "status" = 'FAILED'::"AccountDeletionStatus"
                AND "updated_at" <= NOW() - ${ACCOUNT_DELETION_FAILED_COOLDOWN_MS} * INTERVAL '1 millisecond'
              )
              OR (
                "status" = 'PROCESSING'::"AccountDeletionStatus"
                AND "updated_at" <= NOW() - ${ACCOUNT_DELETION_STALE_PROCESSING_MS} * INTERVAL '1 millisecond'
              )
            )
          ORDER BY "scheduled_for" ASC, "id" ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED
        `;
        claimed = rows[0];
        if (!claimed) return false;
        // Keep the claim and all anonymization writes uncommitted under the
        // row lock. A crash rolls everything back to the retryable original row.
        await transaction.accountDeletionRequest.update({
          where: { id: claimed.id },
          data: { status: AccountDeletionStatus.PROCESSING },
        });
        await this.anonymize(transaction, claimed.id, claimed.userId);
        return true;
      });
    } catch (error) {
      if (!claimed) throw error;
      // The processing transaction has rolled back. Another worker or cancel
      // may have won since then, including after an ambiguous commit response.
      await this.prisma.accountDeletionRequest.updateMany({
        where: {
          id: claimed.id,
          status: claimed.status,
          updatedAt: claimed.updatedAt,
        },
        data: {
          status: AccountDeletionStatus.FAILED,
          failureCode: "ACCOUNT_DELETION_FAILED",
        },
      });
      return false;
    }
  }

  private async anonymize(
    transaction: Prisma.TransactionClient,
    requestId: string,
    userId: string,
  ) {
    const now = new Date();
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) throw new Error("ACCOUNT_DELETION_USER_NOT_FOUND");

    await transaction.postAttachment.deleteMany({
      where: { post: { userId } },
    });
    await transaction.reviewAttachment.deleteMany({
      where: { review: { userId } },
    });
    await transaction.chatAttachment.deleteMany({
      where: { message: { userId } },
    });
    await transaction.post.updateMany({
      where: { userId },
      data: {
        status: ContentStatus.DELETED,
        title: "삭제된 게시글",
        content: "작성자가 탈퇴하여 내용이 삭제되었습니다.",
      },
    });
    await transaction.comment.updateMany({
      where: { userId },
      data: {
        status: ContentStatus.DELETED,
        content: "작성자가 탈퇴하여 내용이 삭제되었습니다.",
      },
    });
    await transaction.review.updateMany({
      where: { userId },
      data: {
        status: ContentStatus.DELETED,
        content: "작성자가 탈퇴하여 내용이 삭제되었습니다.",
      },
    });
    await transaction.chatMessage.updateMany({
      where: { userId },
      data: { message: null, deletedAt: now },
    });
    await transaction.chatRoomMember.deleteMany({ where: { userId } });
    await transaction.clubMember.deleteMany({ where: { userId } });
    await transaction.friendship.deleteMany({
      where: { OR: [{ requesterId: userId }, { addresseeId: userId }] },
    });
    await transaction.userBlock.deleteMany({
      where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    });
    await transaction.notification.deleteMany({ where: { recipientId: userId } });
    await transaction.devicePushToken.deleteMany({ where: { userId } });
    await transaction.idempotencyRecord.deleteMany({ where: { userId } });
    await transaction.userInterest.deleteMany({ where: { userId } });
    await transaction.consentRecord.deleteMany({ where: { userId } });
    await transaction.authIdentity.deleteMany({ where: { userId } });
    await transaction.authSession.deleteMany({ where: { userId } });
    await transaction.emailVerification.deleteMany({
      where: user.email
        ? { OR: [{ userId }, { email: user.email }] }
        : { userId },
    });
    await transaction.phoneVerification.deleteMany({ where: { userId } });
    await transaction.user.update({
      where: { id: userId },
      data: {
        email: `deleted+${userId}@invalid.local`,
        phoneNumber: null,
        name: "탈퇴한 회원",
        birthYear: null,
        region: null,
        gender: null,
        avatarUrl: null,
        bio: null,
        status: UserStatus.WITHDRAWN,
        emailVerifiedAt: null,
        phoneVerifiedAt: null,
        onboardingCompletedAt: null,
        termsAgreedAt: null,
        marketingAgreedAt: null,
        lastLoginAt: null,
        deletionRequestedAt: null,
        anonymizedAt: now,
      },
    });
    await transaction.accountDeletionRequest.update({
      where: { id: requestId },
      data: {
        status: AccountDeletionStatus.COMPLETED,
        reason: null,
        completedAt: now,
        failureCode: null,
      },
    });
  }

  private toResponse(request: {
    id: string;
    status: AccountDeletionStatus;
    requestedAt: Date;
    scheduledFor: Date;
    completedAt: Date | null;
  }) {
    return {
      id: request.id,
      status: request.status,
      requestedAt: request.requestedAt.toISOString(),
      scheduledFor: request.scheduledFor.toISOString(),
      completedAt: request.completedAt?.toISOString() ?? null,
    };
  }
}
