import { describe, expect, it } from "vitest";

import { parseAdminReport } from "@/components/admin-panel";

const report = {
  id: "report-1",
  targetType: "POST",
  targetId: "post-1",
  reason: "SPAM",
  detail: "같은 광고를 반복해서 게시했습니다.",
  status: "OPEN",
  resolutionNote: null,
  reporter: { id: "user-1", name: "신고자" },
  resolver: null,
  createdAt: "2026-07-30T01:00:00.000Z",
  resolvedAt: null,
  updatedAt: "2026-07-30T01:00:00.000Z",
};

describe("admin report response integrity", () => {
  it("accepts the projected live API report", () => {
    expect(parseAdminReport(report)).toEqual(report);
  });

  it("fails closed for invalid enums, dates, or people", () => {
    expect(() => parseAdminReport({ ...report, status: "pending" })).toThrow();
    expect(() => parseAdminReport({ ...report, createdAt: "today" })).toThrow();
    expect(() => parseAdminReport({ ...report, reporter: { name: "이름만" } })).toThrow();
  });
});
