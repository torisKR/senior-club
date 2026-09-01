import { describe, expect, it } from "vitest";

import { clubListQuerySchema, clubSlugSchema } from "./clubs.contracts";

describe("clubListQuerySchema", () => {
  it("uses a bounded default and normalizes public filters", () => {
    expect(clubListQuerySchema.parse({})).toEqual({ limit: 20 });
    expect(
      clubListQuerySchema.parse({
        limit: "50",
        category: "rail-travel",
        region: "  서울특별시   마포구 ",
        q: "  천천히   걷기 ",
        cursor: "opaque-cursor",
      }),
    ).toEqual({
      limit: 50,
      category: "rail-travel",
      region: "서울특별시 마포구",
      q: "천천히 걷기",
      cursor: "opaque-cursor",
    });
  });

  it("rejects expensive, malformed, or unknown query input", () => {
    expect(() => clubListQuerySchema.parse({ limit: 51 })).toThrow();
    expect(() => clubListQuerySchema.parse({ q: "숲" })).toThrow();
    expect(() =>
      clubListQuerySchema.parse({ category: "../private" }),
    ).toThrow();
    expect(() => clubListQuerySchema.parse({ status: "ARCHIVED" })).toThrow();
  });
});

describe("clubSlugSchema", () => {
  it.each(["slow-hiking", "photo2", "rail-travel-60"])(
    "accepts the canonical public slug %s",
    (slug) => {
      expect(clubSlugSchema.parse(slug)).toBe(slug);
    },
  );

  it.each(["Slow-Hiking", "slow_hiking", "-slow", "slow-"])(
    "rejects the non-canonical slug %s",
    (slug) => {
      expect(() => clubSlugSchema.parse(slug)).toThrow();
    },
  );
});

