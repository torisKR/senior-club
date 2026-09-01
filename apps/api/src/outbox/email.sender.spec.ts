import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiEnv } from "../config/env";
import { ConfiguredEmailSender } from "./email.sender";

describe("ConfiguredEmailSender", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const env = {
    EMAIL_PROVIDER: "resend",
    EMAIL_FROM: "시니어클럽 <no-reply@example.com>",
    RESEND_API_KEY: "resend-test-key",
  } as unknown as ApiEnv;

  beforeEach(() => {
    fetchMock.mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the outbox dedup key to Resend for every email type", async () => {
    const sender = new ConfiguredEmailSender(env);
    const expectedKeys = [
      "auth-otp:challenge-1",
      "application:member-1:APPROVED:email",
      "account-deletion:request-1:requested",
    ];

    await sender.sendOtp({
      email: "member@example.com",
      code: "123456",
      expiresAt: "2026-07-29T12:10:00.000Z",
      idempotencyKey: expectedKeys[0]!,
    });
    await sender.sendApplicationUpdate({
      email: "member@example.com",
      eventTitle: "북한산 둘레길",
      status: "APPROVED",
      idempotencyKey: expectedKeys[1]!,
    });
    await sender.sendAccountDeletionRequested({
      email: "member@example.com",
      scheduledFor: "2026-08-05T00:00:00.000Z",
      idempotencyKey: expectedKeys[2]!,
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    fetchMock.mock.calls.forEach(([, init], index) => {
      expect(new Headers(init?.headers).get("Idempotency-Key")).toBe(
        expectedKeys[index],
      );
    });
  });

  it("rejects unsafe provider idempotency keys before making a request", async () => {
    const sender = new ConfiguredEmailSender(env);

    await expect(
      sender.sendOtp({
        email: "member@example.com",
        code: "123456",
        expiresAt: "2026-07-29T12:10:00.000Z",
        idempotencyKey: "unsafe\nheader",
      }),
    ).rejects.toThrow("Invalid Resend idempotency key");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
