import { describe, expect, it } from "vitest";

import { updateProfileSchema } from "./profile.contracts";

const validProfile = {
  name: "김 영희",
  region: "서울특별시 마포구",
  birthYear: 1962,
  interestSlugs: ["hiking", "photo"],
};

describe("updateProfileSchema", () => {
  it("normalizes profile text and accepts one to three unique slugs", () => {
    expect(
      updateProfileSchema.parse({
        ...validProfile,
        name: "  김   영희  ",
        region: "  서울특별시   마포구 ",
      }),
    ).toEqual(validProfile);
  });

  it("rejects duplicate, empty, and excessive interest selections", () => {
    expect(() =>
      updateProfileSchema.parse({
        ...validProfile,
        interestSlugs: ["hiking", "hiking"],
      }),
    ).toThrow();
    expect(() =>
      updateProfileSchema.parse({ ...validProfile, interestSlugs: [] }),
    ).toThrow();
    expect(() =>
      updateProfileSchema.parse({
        ...validProfile,
        interestSlugs: ["hiking", "photo", "history", "reading"],
      }),
    ).toThrow();
  });

  it("rejects unsafe text, implausible birth years, and unknown fields", () => {
    expect(() =>
      updateProfileSchema.parse({ ...validProfile, name: "<script>" }),
    ).toThrow();
    expect(() =>
      updateProfileSchema.parse({ ...validProfile, birthYear: 1899 }),
    ).toThrow();
    expect(() =>
      updateProfileSchema.parse({
        ...validProfile,
        birthYear: new Date().getUTCFullYear() - 17,
      }),
    ).toThrow();
    expect(() =>
      updateProfileSchema.parse({ ...validProfile, admin: true }),
    ).toThrow();
  });
});
