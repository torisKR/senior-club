import { HttpStatus, Injectable } from "@nestjs/common";

import type { AuthenticatedPrincipal } from "../auth/auth.contracts";
import { ApiException } from "../common/http/api.exception";
import {
  ReportStatus,
  ReportTargetType,
  UserRole,
  UserStatus,
} from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import type {
  CreateBlockInput,
  CreateReportInput,
  ResolveReportInput,
} from "./safety.contracts";
import {
  MAX_USER_BLOCKS,
  USER_BLOCK_LIMIT_REACHED_CODE,
  USER_BLOCK_LIST_OVERFLOW_CODE,
} from "./safety.contracts";

type ReportTarget = {
  reportedUserId?: string;
  postId?: string;
  commentId?: string;
  reviewId?: string;
  chatMessageId?: string;
};

type ResolvedReportTarget = {
  ownerUserId: string;
  reference: ReportTarget;
};

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  async report(input: CreateReportInput, principal: AuthenticatedPrincipal) {
    const resolvedTarget = await this.resolveTarget(input, principal);
    if (resolvedTarget.ownerUserId === principal.userId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "CANNOT_REPORT_SELF",
        "본인은 신고할 수 없습니다.",
      );
    }
    const target = resolvedTarget.reference;
    return this.prisma.$transaction(async (transaction) => {
      // A reporter-scoped row lock makes duplicate lookup + creation atomic even
      // when two identical requests arrive before either report is committed.
      await transaction.$queryRaw`
        SELECT "id" FROM "users" WHERE "id" = ${principal.userId} FOR UPDATE
      `;
      const duplicate = await transaction.report.findFirst({
        where: {
          reporterId: principal.userId,
          status: { in: [ReportStatus.OPEN, ReportStatus.IN_REVIEW] },
          ...target,
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ApiException(
          HttpStatus.CONFLICT,
          "REPORT_ALREADY_OPEN",
          "이미 접수된 신고입니다.",
        );
      }
      const report = await transaction.report.create({
        data: {
          reporterId: principal.userId,
          targetType: input.targetType,
          reason: input.reason,
          detail: input.detail ?? null,
          ...target,
        },
        select: { id: true, status: true, createdAt: true },
      });
      return { ...report, createdAt: report.createdAt.toISOString() };
    });
  }

  async block(input: CreateBlockInput, principal: AuthenticatedPrincipal) {
    if (input.blockedUserId === principal.userId) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "CANNOT_BLOCK_SELF",
        "본인은 차단할 수 없습니다.",
      );
    }
    const target = await this.prisma.user.findFirst({
      where: { id: input.blockedUserId, status: UserStatus.ACTIVE },
      select: { id: true },
    });
    if (!target) {
      throw new ApiException(
        HttpStatus.NOT_FOUND,
        "USER_NOT_FOUND",
        "회원을 찾을 수 없습니다.",
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      // Serialize all block mutations for one account. Without this lock two
      // requests can both observe 499 rows and create a 501st row together.
      await transaction.$queryRaw`
        SELECT "id" FROM "users" WHERE "id" = ${principal.userId} FOR UPDATE
      `;
      const existing = await transaction.userBlock.findUnique({
        where: {
          blockerId_blockedId: {
            blockerId: principal.userId,
            blockedId: input.blockedUserId,
          },
        },
        select: { id: true },
      });
      if (!existing) {
        const blockCount = await transaction.userBlock.count({
          where: { blockerId: principal.userId },
        });
        if (blockCount >= MAX_USER_BLOCKS) {
          throw new ApiException(
            HttpStatus.CONFLICT,
            USER_BLOCK_LIMIT_REACHED_CODE,
            `차단은 최대 ${MAX_USER_BLOCKS}명까지 설정할 수 있습니다.`,
          );
        }
      }
      const block = await transaction.userBlock.upsert({
        where: {
          blockerId_blockedId: {
            blockerId: principal.userId,
            blockedId: input.blockedUserId,
          },
        },
        update: { reason: input.reason ?? null },
        create: {
          blockerId: principal.userId,
          blockedId: input.blockedUserId,
          reason: input.reason ?? null,
        },
        include: { blocked: { select: { id: true, name: true } } },
      });
      return {
        id: block.id,
        blockedUser: block.blocked,
        createdAt: block.createdAt.toISOString(),
      };
    });
  }

  async unblock(blockedUserId: string, principal: AuthenticatedPrincipal) {
    await this.prisma.userBlock.deleteMany({
      where: { blockerId: principal.userId, blockedId: blockedUserId },
    });
    return { success: true as const };
  }

  async blocks(principal: AuthenticatedPrincipal) {
    const blocks = await this.prisma.userBlock.findMany({
      where: { blockerId: principal.userId },
      orderBy: { createdAt: "desc" },
      take: MAX_USER_BLOCKS + 1,
      include: { blocked: { select: { id: true, name: true, avatarUrl: true } } },
    });
    if (blocks.length > MAX_USER_BLOCKS) {
      throw new ApiException(
        HttpStatus.CONFLICT,
        USER_BLOCK_LIST_OVERFLOW_CODE,
        `차단 목록이 허용된 최대 ${MAX_USER_BLOCKS}명을 초과했습니다.`,
      );
    }
    return blocks.map((block) => ({
      id: block.id,
      blockedUser: block.blocked,
      createdAt: block.createdAt.toISOString(),
    }));
  }

  async adminReports(principal: AuthenticatedPrincipal) {
    this.assertAdmin(principal);
    const reports = await this.prisma.report.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 100,
      select: {
        id: true,
        targetType: true,
        reportedUserId: true,
        postId: true,
        commentId: true,
        reviewId: true,
        chatMessageId: true,
        reason: true,
        detail: true,
        status: true,
        resolutionNote: true,
        createdAt: true,
        resolvedAt: true,
        updatedAt: true,
        reporter: { select: { id: true, name: true } },
        resolver: { select: { id: true, name: true } },
      },
    });
    return reports.map((report) => this.toAdminReport(report));
  }

  async resolve(
    id: string,
    input: ResolveReportInput,
    principal: AuthenticatedPrincipal,
  ) {
    this.assertAdmin(principal);
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/.test(id)) {
      throw new ApiException(
        HttpStatus.BAD_REQUEST,
        "INVALID_REPORT_ID",
        "신고 식별자가 올바르지 않습니다.",
      );
    }
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw`
        SELECT "id" FROM "reports" WHERE "id" = ${id} FOR UPDATE
      `;
      const current = await transaction.report.findUnique({
        where: { id },
        select: {
          id: true,
          targetType: true,
          reportedUserId: true,
          postId: true,
          commentId: true,
          reviewId: true,
          chatMessageId: true,
          reason: true,
          detail: true,
          status: true,
          resolutionNote: true,
          createdAt: true,
          resolvedAt: true,
          updatedAt: true,
          reporter: { select: { id: true, name: true } },
          resolver: { select: { id: true, name: true } },
        },
      });
      if (!current) {
        throw new ApiException(
          HttpStatus.NOT_FOUND,
          "REPORT_NOT_FOUND",
          "신고를 찾을 수 없습니다.",
        );
      }
      if (
        current.status === input.status &&
        current.resolutionNote === (input.resolutionNote ?? null)
      ) {
        return this.toAdminReport(current);
      }

      const report = await transaction.report.update({
        where: { id },
        data: {
          status: input.status,
          resolverId: principal.userId,
          resolutionNote: input.resolutionNote ?? null,
          resolvedAt:
            input.status === ReportStatus.IN_REVIEW ? null : new Date(),
        },
        select: {
          id: true,
          targetType: true,
          reportedUserId: true,
          postId: true,
          commentId: true,
          reviewId: true,
          chatMessageId: true,
          reason: true,
          detail: true,
          status: true,
          resolutionNote: true,
          createdAt: true,
          resolvedAt: true,
          updatedAt: true,
          reporter: { select: { id: true, name: true } },
          resolver: { select: { id: true, name: true } },
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          actorId: principal.userId,
          action: "REPORT_STATUS_CHANGED",
          targetType: "Report",
          targetId: id,
          before: { status: current.status },
          after: { status: input.status },
        },
      });
      return this.toAdminReport(report);
    });
  }

  private toAdminReport(report: {
    id: string;
    targetType: ReportTargetType;
    reportedUserId: string | null;
    postId: string | null;
    commentId: string | null;
    reviewId: string | null;
    chatMessageId: string | null;
    reason: string;
    detail: string | null;
    status: ReportStatus;
    resolutionNote: string | null;
    createdAt: Date;
    resolvedAt: Date | null;
    updatedAt: Date;
    reporter: { id: string; name: string };
    resolver: { id: string; name: string } | null;
  }) {
    const targetId =
      report.reportedUserId ??
      report.postId ??
      report.commentId ??
      report.reviewId ??
      report.chatMessageId;
    return {
      id: report.id,
      targetType: report.targetType,
      targetId,
      reason: report.reason,
      detail: report.detail,
      status: report.status,
      resolutionNote: report.resolutionNote,
      reporter: report.reporter,
      resolver: report.resolver,
      createdAt: report.createdAt.toISOString(),
      resolvedAt: report.resolvedAt?.toISOString() ?? null,
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private async resolveTarget(
    input: CreateReportInput,
    principal: AuthenticatedPrincipal,
  ): Promise<ResolvedReportTarget> {
    switch (input.targetType) {
      case ReportTargetType.USER: {
        const user = await this.prisma.user.findUnique({
          where: { id: input.targetId },
          select: { id: true },
        });
        if (!user) return this.targetNotFound();
        return {
          ownerUserId: user.id,
          reference: { reportedUserId: user.id },
        };
      }
      case ReportTargetType.POST: {
        const post = await this.prisma.post.findUnique({
          where: { id: input.targetId },
          select: { id: true, userId: true },
        });
        if (!post) return this.targetNotFound();
        return {
          ownerUserId: post.userId,
          reference: { postId: post.id },
        };
      }
      case ReportTargetType.COMMENT: {
        const comment = await this.prisma.comment.findUnique({
          where: { id: input.targetId },
          select: { id: true, userId: true },
        });
        if (!comment) return this.targetNotFound();
        return {
          ownerUserId: comment.userId,
          reference: { commentId: comment.id },
        };
      }
      case ReportTargetType.REVIEW: {
        const review = await this.prisma.review.findUnique({
          where: { id: input.targetId },
          select: { id: true, userId: true },
        });
        if (!review) return this.targetNotFound();
        return {
          ownerUserId: review.userId,
          reference: { reviewId: review.id },
        };
      }
      case ReportTargetType.CHAT_MESSAGE: {
        const message = await this.prisma.chatMessage.findUnique({
          where: { id: input.targetId },
          select: { id: true, userId: true, roomId: true },
        });
        if (!message) return this.targetNotFound();
        const membership = await this.prisma.chatRoomMember.findUnique({
          where: {
            roomId_userId: { roomId: message.roomId, userId: principal.userId },
          },
          select: { leftAt: true },
        });
        if (!membership || membership.leftAt) {
          throw new ApiException(
            HttpStatus.FORBIDDEN,
            "CHAT_MEMBERSHIP_REQUIRED",
            "참여 중인 채팅방의 메시지만 신고할 수 있습니다.",
          );
        }
        return {
          ownerUserId: message.userId,
          reference: { chatMessageId: message.id },
        };
      }
    }
  }

  private targetNotFound(): never {
    throw new ApiException(
      HttpStatus.NOT_FOUND,
      "REPORT_TARGET_NOT_FOUND",
      "신고 대상을 찾을 수 없습니다.",
    );
  }

  private assertAdmin(principal: AuthenticatedPrincipal) {
    if (principal.role !== UserRole.ADMIN) {
      throw new ApiException(
        HttpStatus.FORBIDDEN,
        "ADMIN_REQUIRED",
        "관리자 권한이 필요합니다.",
      );
    }
  }
}
