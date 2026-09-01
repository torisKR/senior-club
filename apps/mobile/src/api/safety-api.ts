import { ApiError } from '@/api/api-error';
import { getAuthenticatedHttpClient } from '@/auth/auth-session-manager';

export const REPORT_REASONS = [
  'SPAM',
  'ABUSE',
  'HARASSMENT',
  'MISINFORMATION',
  'INAPPROPRIATE',
  'OTHER',
] as const;

export const REPORT_TARGET_TYPES = [
  'USER',
  'POST',
  'COMMENT',
  'REVIEW',
  'CHAT_MESSAGE',
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number];
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export interface CreateReportInput {
  targetType: ReportTargetType;
  targetId: string;
  reason: ReportReason;
  detail?: string;
}

export interface CreatedReport {
  id: string;
  status: 'OPEN';
  createdAt: string;
}

export interface BlockedUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface UserBlock {
  id: string;
  blockedUser: BlockedUser;
  createdAt: string;
}

export interface CreateBlockInput {
  blockedUserId: string;
  reason?: string;
}

const SAFE_ENTITY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const UNSAFE_CONTROL_CHARACTER = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const SINGLE_LINE_CONTROL_CHARACTER = /[\r\n\t]/;
const REPORT_REASON_SET = new Set<ReportReason>(REPORT_REASONS);
const REPORT_TARGET_SET = new Set<ReportTargetType>(REPORT_TARGET_TYPES);
const MAX_BLOCKS_PER_ACCOUNT = 500;

function invalidResponse(path: string, reason: string): never {
  throw new ApiError({
    status: 0,
    code: 'INVALID_RESPONSE',
    message: `서버의 안전 기능 응답이 올바르지 않습니다. (${path}: ${reason})`,
  });
}

function strictRecord(
  value: unknown,
  expectedKeys: readonly string[],
  path: string,
) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return invalidResponse(path, '객체가 아닙니다');
  }
  const record = value as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => !expectedKeys.includes(key));
  if (unknownKey) return invalidResponse(path, `알 수 없는 ${unknownKey} 필드`);
  const missingKey = expectedKeys.find((key) => !Object.hasOwn(record, key));
  if (missingKey) return invalidResponse(path, `${missingKey} 필드 누락`);
  return record;
}

function entityId(value: unknown, path: string) {
  return typeof value === 'string' && SAFE_ENTITY_ID.test(value)
    ? value
    : invalidResponse(path, '식별자 형식 오류');
}

function requestEntityId(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SAFE_ENTITY_ID.test(value)) {
    throw new TypeError(`${label} 식별자가 올바르지 않습니다.`);
  }
  return value;
}

function assertExactRequestKeys(
  value: object,
  allowedKeys: readonly string[],
  requiredKeys: readonly string[],
  label: string,
) {
  const keys = Object.keys(value);
  const unknownKey = keys.find((key) => !allowedKeys.includes(key));
  if (unknownKey) {
    throw new TypeError(`${label}에 알 수 없는 ${unknownKey} 필드가 있습니다.`);
  }
  const missingKey = requiredKeys.find((key) => !Object.hasOwn(value, key));
  if (missingKey) {
    throw new TypeError(`${label}에 ${missingKey} 필드가 필요합니다.`);
  }
}

function isoDate(value: unknown, path: string) {
  if (typeof value !== 'string') return invalidResponse(path, '날짜 형식 오류');
  try {
    return new Date(value).toISOString() === value
      ? value
      : invalidResponse(path, '날짜 형식 오류');
  } catch {
    return invalidResponse(path, '날짜 형식 오류');
  }
}

function boundedText(value: unknown, path: string, maximumLength = 100) {
  if (
    typeof value !== 'string' ||
    value.length < 1 ||
    value.length > maximumLength ||
    value !== value.trim() ||
    UNSAFE_CONTROL_CHARACTER.test(value) ||
    SINGLE_LINE_CONTROL_CHARACTER.test(value)
  ) {
    return invalidResponse(path, '문자열 형식 오류');
  }
  return value;
}

function normalizeOptionalText(
  value: string | undefined,
  label: string,
  maximumLength: number,
) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (normalized.length < 2 || normalized.length > maximumLength) {
    throw new TypeError(`${label}은 2자 이상 ${maximumLength}자 이하여야 합니다.`);
  }
  if (UNSAFE_CONTROL_CHARACTER.test(normalized)) {
    throw new TypeError(`${label}에 사용할 수 없는 문자가 있습니다.`);
  }
  return normalized;
}

function avatarUrl(value: unknown, path: string) {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > 2_048) {
    return invalidResponse(path, '프로필 이미지 URL 형식 오류');
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password
      ? value
      : invalidResponse(path, '프로필 이미지 URL 형식 오류');
  } catch {
    return invalidResponse(path, '프로필 이미지 URL 형식 오류');
  }
}

function parseCreatedReport(value: unknown): CreatedReport {
  const report = strictRecord(value, ['id', 'status', 'createdAt'], 'report');
  if (report.status !== 'OPEN') return invalidResponse('report.status', '상태 오류');
  return {
    id: entityId(report.id, 'report.id'),
    status: report.status,
    createdAt: isoDate(report.createdAt, 'report.createdAt'),
  };
}

function parseUserBlock(value: unknown, includeAvatar: boolean, path: string): UserBlock {
  const block = strictRecord(value, ['id', 'blockedUser', 'createdAt'], path);
  const blockedUser = strictRecord(
    block.blockedUser,
    includeAvatar ? ['id', 'name', 'avatarUrl'] : ['id', 'name'],
    `${path}.blockedUser`,
  );
  return {
    id: entityId(block.id, `${path}.id`),
    blockedUser: {
      id: entityId(blockedUser.id, `${path}.blockedUser.id`),
      name: boundedText(blockedUser.name, `${path}.blockedUser.name`),
      avatarUrl: includeAvatar
        ? avatarUrl(blockedUser.avatarUrl, `${path}.blockedUser.avatarUrl`)
        : null,
    },
    createdAt: isoDate(block.createdAt, `${path}.createdAt`),
  };
}

function parseBlockList(value: unknown): UserBlock[] {
  if (!Array.isArray(value) || value.length > MAX_BLOCKS_PER_ACCOUNT) {
    return invalidResponse('blocks', '목록 크기 오류');
  }
  const blockIds = new Set<string>();
  const userIds = new Set<string>();
  let previousCreatedAt = Number.POSITIVE_INFINITY;
  return value.map((entry, index) => {
    const block = parseUserBlock(entry, true, `blocks[${index}]`);
    if (blockIds.has(block.id) || userIds.has(block.blockedUser.id)) {
      return invalidResponse(`blocks[${index}]`, '중복 차단 항목');
    }
    const createdAt = Date.parse(block.createdAt);
    if (createdAt > previousCreatedAt) {
      return invalidResponse(`blocks[${index}].createdAt`, '목록 정렬 오류');
    }
    blockIds.add(block.id);
    userIds.add(block.blockedUser.id);
    previousCreatedAt = createdAt;
    return block;
  });
}

function normalizeReportInput(input: CreateReportInput): CreateReportInput {
  assertExactRequestKeys(
    input,
    ['targetType', 'targetId', 'reason', 'detail'],
    ['targetType', 'targetId', 'reason'],
    '신고 요청',
  );
  if (!REPORT_TARGET_SET.has(input.targetType)) {
    throw new TypeError('신고 대상 유형이 올바르지 않습니다.');
  }
  if (!REPORT_REASON_SET.has(input.reason)) {
    throw new TypeError('신고 이유가 올바르지 않습니다.');
  }
  const detail = normalizeOptionalText(input.detail, '신고 상세 내용', 1_000);
  return {
    targetType: input.targetType,
    targetId: requestEntityId(input.targetId, '신고 대상'),
    reason: input.reason,
    ...(detail ? { detail } : {}),
  };
}

export const safetyApi = {
  async report(input: CreateReportInput, signal?: AbortSignal): Promise<CreatedReport> {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>('/v1/reports', {
      method: 'POST',
      auth: 'required',
      json: normalizeReportInput(input),
      signal,
    });
    return parseCreatedReport(response.body);
  },

  async blocks(signal?: AbortSignal): Promise<UserBlock[]> {
    const response = await getAuthenticatedHttpClient().requestJson<unknown>('/v1/me/blocks', {
      auth: 'required',
      signal,
    });
    return parseBlockList(response.body);
  },

  async block(input: CreateBlockInput, signal?: AbortSignal): Promise<UserBlock> {
    assertExactRequestKeys(
      input,
      ['blockedUserId', 'reason'],
      ['blockedUserId'],
      '차단 요청',
    );
    const reason = normalizeOptionalText(input.reason, '차단 사유', 500);
    const blockedUserId = requestEntityId(input.blockedUserId, '차단 회원');
    const response = await getAuthenticatedHttpClient().requestJson<unknown>('/v1/me/blocks', {
      method: 'POST',
      auth: 'required',
      json: {
        blockedUserId,
        ...(reason ? { reason } : {}),
      },
      signal,
    });
    const block = parseUserBlock(response.body, false, 'block');
    if (block.blockedUser.id !== blockedUserId) {
      return invalidResponse('block.blockedUser.id', '요청 회원과 일치하지 않습니다');
    }
    return block;
  },

  async unblock(blockedUserId: string, signal?: AbortSignal): Promise<void> {
    const id = requestEntityId(blockedUserId, '차단 해제 회원');
    const response = await getAuthenticatedHttpClient().requestJson<unknown>(
      `/v1/me/blocks/${encodeURIComponent(id)}`,
      { method: 'DELETE', auth: 'required', signal },
    );
    const body = strictRecord(response.body, ['success'], 'unblock');
    if (body.success !== true) invalidResponse('unblock.success', '성공 상태 오류');
  },
};
