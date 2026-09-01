import { describe, expect, it } from "vitest";

import { buildLeaderEventRequest } from "@/components/leader-event-form";
import {
  eventMutationResultSchema,
  leaderEventDetailSchema,
  managedClubsResponseSchema,
  parseLeaderEventId,
} from "@/lib/leader-events/contracts";

const values = {
  clubId: "club-operator-1",
  title: "  서울숲 천천히 걷기  ",
  description: "  무리하지 않고 서울숲을 함께 걸으며 대화하는 모임입니다.  ",
  locationName: "  서울숲 방문자센터  ",
  address: "  서울 성동구 뚝섬로 273  ",
  mapUrl: "https://map.example/meeting-place",
  startAt: "2026-08-20T10:00",
  endAt: "2026-08-20T12:00",
  registrationDeadline: "2026-08-19T18:00",
  capacity: "20",
  price: "5000",
  difficulty: "EASY" as const,
  supplies: "  편한 신발, 개인 물  ",
  approvalMode: "MANUAL" as const,
  publish: true,
};

const detail = {
  id: "event-managed-1",
  clubId: "club-operator-1",
  title: "서울숲 천천히 걷기",
  description: "무리하지 않고 서울숲을 함께 걸으며 대화하는 모임입니다.",
  coverImageUrl: null,
  locationName: "서울숲 방문자센터",
  address: "서울 성동구 뚝섬로 273",
  mapUrl: "https://map.example/meeting-place",
  startAt: "2026-08-20T01:00:00.000Z",
  endAt: "2026-08-20T03:00:00.000Z",
  registrationDeadline: "2026-08-19T09:00:00.000Z",
  capacity: 20,
  price: 5000,
  currency: "KRW",
  difficulty: "EASY",
  supplies: "편한 신발, 개인 물",
  approvalMode: "MANUAL",
  status: "DRAFT",
  club: {
    id: "club-operator-1",
    slug: "seoul-forest",
    title: "서울숲 산책 모임",
  },
  updatedAt: "2026-07-30T03:00:00.000Z",
} as const;

describe("leader event form contract", () => {
  it("normalizes a create form and converts local dates to ISO timestamps", () => {
    const parsed = buildLeaderEventRequest(values, "create");

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      clubId: "club-operator-1",
      title: "서울숲 천천히 걷기",
      capacity: 20,
      price: 5000,
      publish: true,
      supplies: "편한 신발, 개인 물",
    });
    expect(Date.parse(parsed.data.startAt ?? "")).toBe(
      new Date(values.startAt).getTime(),
    );
  });

  it("uses explicit nulls to clear optional edit fields without moving clubs", () => {
    const parsed = buildLeaderEventRequest(
      {
        ...values,
        mapUrl: "",
        endAt: "",
        registrationDeadline: "",
        supplies: "",
      },
      "edit",
    );

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data).toMatchObject({
      mapUrl: null,
      endAt: null,
      registrationDeadline: null,
      supplies: null,
    });
    expect(parsed.data).not.toHaveProperty("clubId");
    expect(parsed.data).not.toHaveProperty("publish");
  });

  it.each([
    [{ ...values, capacity: "" }, "정원"],
    [{ ...values, price: "-1" }, "참가비"],
    [{ ...values, mapUrl: "http://map.example/place" }, "지도 링크"],
    [{ ...values, endAt: "2026-08-20T09:00" }, "종료 일시"],
    [
      { ...values, registrationDeadline: "2026-08-21T10:00" },
      "신청 마감",
    ],
  ])("fails closed on invalid form input", (candidate, field) => {
    const parsed = buildLeaderEventRequest(candidate, "create");
    expect(parsed).toMatchObject({ success: false });
    if (!parsed.success) expect(parsed.message).toContain(field);
  });
});

describe("leader event response integrity", () => {
  it("accepts only complete private details and compact mutation results", () => {
    expect(leaderEventDetailSchema.parse(detail)).toEqual(detail);
    expect(
      leaderEventDetailSchema.parse({
        ...detail,
        coverImageUrl: "/images/events/walk.jpg",
      }).coverImageUrl,
    ).toBe("/images/events/walk.jpg");
    expect(
      eventMutationResultSchema.parse({
        ...detail,
        ignored: "removed",
      }),
    ).toEqual({
      id: detail.id,
      status: detail.status,
      updatedAt: detail.updatedAt,
    });
  });

  it("rejects malformed dates, status, club responses, and unsafe ids", () => {
    expect(
      leaderEventDetailSchema.safeParse({ ...detail, startAt: "tomorrow" })
        .success,
    ).toBe(false);
    expect(
      leaderEventDetailSchema.safeParse({
        ...detail,
        coverImageUrl: "/images/%2e%2e/private.jpg",
      }).success,
    ).toBe(false);
    expect(
      eventMutationResultSchema.safeParse({
        id: detail.id,
        status: "UNKNOWN",
        updatedAt: detail.updatedAt,
      }).success,
    ).toBe(false);
    expect(
      managedClubsResponseSchema.safeParse({
        data: [{ id: "../admin", slug: "bad", title: "Bad" }],
        page: { hasNextPage: false, nextCursor: null },
      }).success,
    ).toBe(false);
    expect(parseLeaderEventId("event-managed-1")).toBe("event-managed-1");
    expect(parseLeaderEventId("../admin")).toBeNull();
    expect(parseLeaderEventId(["event-1", "event-2"])).toBeNull();
  });
});
