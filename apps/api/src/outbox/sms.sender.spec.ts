import { describe, expect, it, vi } from "vitest";

import type { ApiEnv } from "../config/env";
import { ConfiguredSmsSender } from "./sms.sender";

const baseEnv = {
  SMS_PROVIDER: "console",
  TWILIO_ACCOUNT_SID: undefined,
  TWILIO_AUTH_TOKEN: undefined,
  TWILIO_MESSAGING_SERVICE_SID: undefined,
  TWILIO_FROM_NUMBER: undefined,
} as unknown as ApiEnv;

describe("ConfiguredSmsSender", () => {
  it("keeps development delivery local and masks the destination", async () => {
    const sender = new ConfiguredSmsSender(baseEnv);
    await expect(
      sender.sendOtp({
        phoneNumber: "+821012345678",
        code: "123456",
        expiresAt: "2026-08-06T12:10:00.000Z",
        idempotencyKey: "auth-otp:challenge-12345678",
      }),
    ).resolves.toBeUndefined();
  });

  it("posts a generated code to Twilio Messaging with a service sid", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ sid: "SM123" }), { status: 201 }),
    );
    try {
      const sender = new ConfiguredSmsSender({
        ...baseEnv,
        SMS_PROVIDER: "twilio",
        TWILIO_ACCOUNT_SID: "AC12345678901234567890123456789012",
        TWILIO_AUTH_TOKEN: "secret-token",
        TWILIO_MESSAGING_SERVICE_SID: "MG12345678901234567890123456789012",
      } as unknown as ApiEnv);

      await sender.sendOtp({
        phoneNumber: "+821012345678",
        code: "123456",
        expiresAt: "2026-08-06T12:10:00.000Z",
        idempotencyKey: "auth-otp:challenge-12345678",
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(
        "https://api.twilio.com/2010-04-01/Accounts/AC12345678901234567890123456789012/Messages.json",
      );
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        "Content-Type": "application/x-www-form-urlencoded",
      });
      const form = init?.body as URLSearchParams;
      expect(form.get("To")).toBe("+821012345678");
      expect(form.get("MessagingServiceSid")).toBe(
        "MG12345678901234567890123456789012",
      );
      expect(form.get("Body")).toContain("123456");
    } finally {
      fetchMock.mockRestore();
    }
  });
});
