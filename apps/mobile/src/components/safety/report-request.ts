import type {
  CreateReportInput,
  ReportReason,
  ReportTargetType,
} from '@/api/safety-api';

export type ContentReportTargetType = Exclude<ReportTargetType, 'USER'>;
export type SafetyReportKind = 'content' | 'user';

export interface BuildSafetyReportInput {
  kind: SafetyReportKind;
  contentTargetType: ContentReportTargetType;
  contentTargetId: string;
  authorUserId: string;
  reason: ReportReason;
  detail?: string;
}

export function buildSafetyReportInput({
  kind,
  contentTargetType,
  contentTargetId,
  authorUserId,
  reason,
  detail,
}: BuildSafetyReportInput): CreateReportInput {
  return {
    targetType: kind === 'user' ? 'USER' : contentTargetType,
    targetId: kind === 'user' ? authorUserId : contentTargetId,
    reason,
    ...(detail ? { detail } : {}),
  };
}

export function safetyReportSuccessMessage(
  kind: SafetyReportKind,
  targetLabel: string,
  authorName: string,
) {
  return kind === 'user'
    ? `${authorName} 님에 대한 사용자 신고를 접수했습니다. 운영진이 확인하겠습니다.`
    : `${targetLabel} 콘텐츠 신고를 접수했습니다. 운영진이 확인하겠습니다.`;
}

export function safetyReportDuplicateMessage(
  kind: SafetyReportKind,
  authorName: string,
) {
  return kind === 'user'
    ? `${authorName} 님에 대한 사용자 신고가 이미 접수되어 확인 중입니다.`
    : '이 콘텐츠 신고가 이미 접수되어 확인 중입니다.';
}
