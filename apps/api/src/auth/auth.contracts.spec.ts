import { describe, expect, it } from "vitest";

import { SessionClientType } from "../generated/prisma/client";
import { kakaoLoginSchema } from "./auth.contracts";

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
