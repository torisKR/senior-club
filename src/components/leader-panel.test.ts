import { describe, expect, it } from "vitest";

import {
  attendanceFailureTitle,
  attendanceRecovery,
  canDecideApplication,
  canMarkAttendance,
  managedEventsApiPath,
  parseAttendanceUpdate,
} from "@/components/leader-panel";

const START_AT = "2026-07-30T03:00:00.000Z";
const START_MS = Date.parse(START_AT);

describe("leader attendance visibility", () => {
  it("allows application decisions only for pending published applications before start", () => {
    expect(
      canDecideApplication("PENDING", "PUBLISHED", START_AT, START_MS - 1),
    ).toBe(true);
    expect(
      canDecideApplication("PENDING", "PUBLISHED", START_AT, START_MS),
    ).toBe(false);
    expect(
      canDecideApplication("APPROVED", "PUBLISHED", START_AT, START_MS - 1),
    ).toBe(false);
    expect(
      canDecideApplication("PENDING", "CLOSED", START_AT, START_MS - 1),
    ).toBe(false);
  });

  it("exposes attendance only for approved applications at or after start", () => {
    expect(canMarkAttendance("APPROVED", "attendance", START_AT, START_MS)).toBe(true);
    expect(canMarkAttendance("APPROVED", "attendance", START_AT, START_MS + 1)).toBe(true);
    expect(canMarkAttendance("APPROVED", "attendance", START_AT, START_MS - 1)).toBe(false);
    expect(canMarkAttendance("PENDING", "attendance", START_AT, START_MS + 1)).toBe(false);
    expect(canMarkAttendance("APPROVED", "upcoming", START_AT, START_MS + 1)).toBe(false);
    expect(canMarkAttendance("APPROVED", "attendance", "not-a-date", START_MS)).toBe(false);
  });
});

describe("leader attendance response integrity", () => {
  const update = {
    id: "application-1",
    attendance: "ATTENDED",
    checkedInAt: "2026-07-30T03:05:00.000Z",
    updatedAt: "2026-07-30T03:05:00.000Z",
  } as const;

  it("accepts only a complete update for the requested application", () => {
    expect(parseAttendanceUpdate(update, "application-1")).toEqual(update);
    expect(
      parseAttendanceUpdate(
        { ...update, attendance: "NO_SHOW", checkedInAt: null },
        "application-1",
      ),
    ).toEqual({ ...update, attendance: "NO_SHOW", checkedInAt: null });
  });

  it("rejects mismatched or malformed responses before local state can change", () => {
    expect(parseAttendanceUpdate(update, "application-2")).toBeNull();
    expect(
      parseAttendanceUpdate({ ...update, attendance: "NOT_CHECKED" }, "application-1"),
    ).toBeNull();
    expect(
      parseAttendanceUpdate({ ...update, updatedAt: "invalid" }, "application-1"),
    ).toBeNull();
    expect(
      parseAttendanceUpdate({ ...update, checkedInAt: undefined }, "application-1"),
    ).toBeNull();
  });
});

describe("leader attendance recovery and catalogs", () => {
  it("reloads authoritative state for permission/conflict errors and retries transient failures", () => {
    expect(attendanceRecovery(403)).toBe("reload");
    expect(attendanceRecovery(409)).toBe("reload");
    expect(attendanceRecovery(502)).toBe("retry");
    expect(attendanceRecovery(null)).toBe("retry");
    expect(attendanceFailureTitle(403)).toBe("출석 처리 권한을 확인해 주세요");
    expect(attendanceFailureTitle(409)).toBe("현재 신청 상태와 맞지 않습니다");
    expect(attendanceFailureTitle(502)).toBe("출석 처리를 완료하지 못했습니다");
  });

  it("keeps upcoming and attendance requests explicit and cursor-safe", () => {
    expect(managedEventsApiPath("upcoming")).toBe(
      "/api/leader/events?limit=50&view=upcoming",
    );
    expect(managedEventsApiPath("attendance", "opaque/+ cursor")).toBe(
      "/api/leader/events?limit=50&view=attendance&cursor=opaque%2F%2B+cursor",
    );
    expect(managedEventsApiPath("drafts", "draft_cursor-123")).toBe(
      "/api/leader/events?limit=50&view=drafts&cursor=draft_cursor-123",
    );
  });
});
