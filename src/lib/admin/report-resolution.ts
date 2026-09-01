import { ApiHttpError } from "@/lib/api";

const ALLOWED_KEYS = new Set(["status", "resolutionNote"]);
const ALLOWED_STATUSES = new Set(["IN_REVIEW", "RESOLVED", "DISMISSED"]);

export function parseReportResolution(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiHttpError(400, "신고 처리 내용을 확인해 주세요.", "INVALID_REPORT_RESOLUTION");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) {
    throw new ApiHttpError(400, "지원하지 않는 신고 처리 항목입니다.", "INVALID_REPORT_RESOLUTION");
  }
  if (typeof record.status !== "string" || !ALLOWED_STATUSES.has(record.status)) {
    throw new ApiHttpError(400, "신고 처리 상태를 확인해 주세요.", "INVALID_REPORT_STATUS");
  }
  if (
    record.resolutionNote !== undefined &&
    (typeof record.resolutionNote !== "string" ||
      record.resolutionNote.trim().length < 2 ||
      record.resolutionNote.trim().length > 1_000)
  ) {
    throw new ApiHttpError(400, "처리 메모는 2~1000자로 입력해 주세요.", "INVALID_RESOLUTION_NOTE");
  }
  return {
    status: record.status,
    ...(typeof record.resolutionNote === "string"
      ? { resolutionNote: record.resolutionNote.trim() }
      : {}),
  };
}
