import { describe, expect, it } from "vitest";

import { SessionClientType } from "../generated/prisma/client";
import { googleLoginSchema, kakaoLoginSchema } from "./auth.contracts";

describe("kakaoLoginSchema", () => {
  it("accepts a bounded access token and defaults the client type", () => {
    expect(
      kakaoLoginSchema.parse({
        accessToken: "kakao-access-token",
        termsAccepted: true,
        privacyAccepted: true,
      }),
    ).toEqual({
      accessToken: "kakao-access-token",
      clientType: SessionClientType.WEB,
      termsAccepted: true,
      privacyAccepted: true,
    });
  });

  it.each([
    {},
    { accessToken: "" },
    { accessToken: "x".repeat(4_097) },
    { accessToken: "token", unknown: true },
    { accessToken: "token", termsAccepted: false, privacyAccepted: true },
  ])("rejects invalid input %#", (input) => {
    expect(kakaoLoginSchema.safeParse(input).success).toBe(false);
  });
});

describe("googleLoginSchema", () => {
  it("accepts an idToken or accessToken and defaults the client type", () => {
    expect(
      googleLoginSchema.parse({
        idToken: "google-id-token",
        termsAccepted: true,
        privacyAccepted: true,
      }),
    ).toEqual({
      idToken: "google-id-token",
      clientType: SessionClientType.WEB,
      termsAccepted: true,
      privacyAccepted: true,
    });

    expect(
      googleLoginSchema.parse({
        accessToken: "google-access-token",
        termsAccepted: true,
        privacyAccepted: true,
      }),
    ).toEqual({
      accessToken: "google-access-token",
      clientType: SessionClientType.WEB,
      termsAccepted: true,
      privacyAccepted: true,
    });
  });

  it.each([
    {},
    { idToken: "" },
    { accessToken: "" },
    { idToken: "x".repeat(8_193) },
    { accessToken: "x".repeat(4_097) },
    { idToken: "token", termsAccepted: false, privacyAccepted: true },
    { accessToken: "token", termsAccepted: true, privacyAccepted: false },
  ])("rejects invalid google login input %#", (input) => {
    expect(googleLoginSchema.safeParse(input).success).toBe(false);
  });
});
