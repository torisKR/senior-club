import { describe, expect, it } from "vitest";

import {
  ApprovalMode,
  AttendanceStatus,
  EventDifficulty,
  EventMemberStatus,
} from "../generated/prisma/client";
import {
  applicationDecisionSchema,
  attendanceUpdateSchema,
  createEventSchema,
  eventListQuerySchema,
  leaderApplicationListQuerySchema,
  managedClubListQuerySchema,
  managedEventListQuerySchema,
  updateEventSchema,
} from "./events.contracts";

const validEventInput = {
  clubId: "club-1",
  title: "  북한산   둘레길 걷기  ",
  description: "천천히 걸으며 북한산 풍경을 함께 감상합니다.",
  coverImageUrl: "https://cdn.example.com/events/walk.jpg",
  locationName: "  북한산   안내소  ",
  address: "서울특별시 은평구 진관동",
  mapUrl: "https://map.example.com/place/1",
  startAt: "2099-08-01T09:00:00+09:00",
  endAt: "2099-08-01T12:00:00+09:00",
  registrationDeadline: "2099-07-31T18:00:00+09:00",
  capacity: 20,
  price: 10_000,
  difficulty: EventDifficulty.EASY,
  supplies: "물, 모자",
  approvalMode: ApprovalMode.MANUAL,
  publish: true,
};

describe("event management contracts", () => {
  it("accepts a complete strict create body and normalizes short labels", () => {
    expect(createEventSchema.parse(validEventInput)).toMatchObject({
      clubId: "club-1",
      title: "북한산 둘레길 걷기",
      locationName: "북한산 안내소",
      capacity: 20,
      publish: true,
    });
    expect(
      createEventSchema.parse({ ...validEventInput, publish: undefined }).publish,
    ).toBe(false);
  });

  it("rejects unsafe URLs, impossible dates, numeric bounds, and unknown keys", () => {
    expect(() =>
      createEventSchema.parse({
        ...validEventInput,
        coverImageUrl: "http://cdn.example.com/event.jpg",
      }),
    ).toThrow();
    expect(() =>
      createEventSchema.parse({
        ...validEventInput,
        endAt: validEventInput.startAt,
      }),
    ).toThrow();
    expect(() =>
      createEventSchema.parse({
        ...validEventInput,
        registrationDeadline: "2099-08-02T00:00:00+09:00",
      }),
    ).toThrow();
    expect(() =>
      createEventSchema.parse({ ...validEventInput, capacity: 501 }),
    ).toThrow();
    expect(() =>
      createEventSchema.parse({ ...validEventInput, status: "PUBLISHED" }),
    ).toThrow();
  });

  it("accepts a non-empty partial update but not immutable or empty input", () => {
    expect(updateEventSchema.parse({ endAt: null, supplies: null })).toEqual({
      endAt: null,
      supplies: null,
    });
    expect(() => updateEventSchema.parse({})).toThrow();
    expect(() => updateEventSchema.parse({ clubId: "club-2" })).toThrow();
    expect(() => updateEventSchema.parse({ publish: true })).toThrow();
  });
});

describe("eventListQuerySchema", () => {
  it("keeps the mobile-compatible upcoming view as the default", () => {
    expect(eventListQuerySchema.parse({})).toMatchObject({
      limit: 20,
      view: "upcoming",
    });
  });

  it.each(["upcoming", "past", "all"] as const)(
    "accepts the public %s catalog view",
    (view) => {
      expect(eventListQuerySchema.parse({ view }).view).toBe(view);
    },
  );

  it("rejects unpublished catalog views and unknown query parameters", () => {
    expect(() => eventListQuerySchema.parse({ view: "drafts" })).toThrow();
    expect(() => eventListQuerySchema.parse({ status: "DRAFT" })).toThrow();
  });
});

describe("attendanceUpdateSchema", () => {
  it("accepts only the two leader-settable attendance states", () => {
    expect(
      attendanceUpdateSchema.parse({
        attendance: AttendanceStatus.ATTENDED,
        reason: "현장 출석 확인",
      }),
    ).toEqual({
      attendance: AttendanceStatus.ATTENDED,
      reason: "현장 출석 확인",
    });
    expect(
      attendanceUpdateSchema.parse({ attendance: AttendanceStatus.NO_SHOW }),
    ).toEqual({ attendance: AttendanceStatus.NO_SHOW });
  });

  it("rejects unchecked state, short reasons, and unknown input", () => {
    expect(() =>
      attendanceUpdateSchema.parse({
        attendance: AttendanceStatus.NOT_CHECKED,
      }),
    ).toThrow();
    expect(() =>
      attendanceUpdateSchema.parse({
        attendance: AttendanceStatus.ATTENDED,
        reason: "짧",
      }),
    ).toThrow();
    expect(() =>
      attendanceUpdateSchema.parse({
        attendance: AttendanceStatus.ATTENDED,
        userId: "member-1",
      }),
    ).toThrow();
  });
});

describe("applicationDecisionSchema", () => {
  it("accepts approval without a reason", () => {
    expect(
      applicationDecisionSchema.parse({ status: EventMemberStatus.APPROVED }),
    ).toEqual({ status: EventMemberStatus.APPROVED });
  });

  it("requires a meaningful rejection reason", () => {
    expect(() =>
      applicationDecisionSchema.parse({ status: EventMemberStatus.REJECTED }),
    ).toThrow();
    expect(
      applicationDecisionSchema.parse({
        status: EventMemberStatus.REJECTED,
        reason: "일정 확인 필요",
      }),
    ).toEqual({
      status: EventMemberStatus.REJECTED,
      reason: "일정 확인 필요",
    });
  });
});

describe("leader pagination contracts", () => {
  it("keeps upcoming as the bounded default and accepts the attendance view", () => {
    expect(managedEventListQuerySchema.parse({})).toEqual({
      limit: 20,
      view: "upcoming",
    });
    expect(
      managedEventListQuerySchema.parse({ view: "attendance" }),
    ).toEqual({ limit: 20, view: "attendance" });
    expect(
      managedEventListQuerySchema.parse({ view: "drafts" }),
    ).toEqual({ limit: 20, view: "drafts" });
    expect(leaderApplicationListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(managedClubListQuerySchema.parse({})).toEqual({ limit: 50 });
    expect(
      leaderApplicationListQuerySchema.parse({
        limit: "100",
        cursor: "opaque-cursor",
      }),
    ).toEqual({ limit: 100, cursor: "opaque-cursor" });
  });

  it("rejects oversized pages and unknown filters", () => {
    expect(() => managedEventListQuerySchema.parse({ limit: 51 })).toThrow();
    expect(() =>
      leaderApplicationListQuerySchema.parse({ limit: 101 }),
    ).toThrow();
    expect(() => managedClubListQuerySchema.parse({ limit: 101 })).toThrow();
    expect(() =>
      managedEventListQuerySchema.parse({ status: "PUBLISHED" }),
    ).toThrow();
    expect(() =>
      managedEventListQuerySchema.parse({ view: "completed" }),
    ).toThrow();
  });
});
