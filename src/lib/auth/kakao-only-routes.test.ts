import { describe, expect, it } from "vitest";
import { POST as google } from "@/app/api/auth/google/route";
import { POST as phoneRequest } from "@/app/api/auth/phone/request/route";
import { POST as phoneVerify } from "@/app/api/auth/phone/verify/route";
import { POST as emailRequest } from "@/app/api/auth/email/request/route";
import { POST as emailVerify } from "@/app/api/auth/email/verify/route";

describe("Kakao-only web authentication", () => {
  it.each([google, phoneRequest, phoneVerify, emailRequest, emailVerify])("retires each alternate credential endpoint", async (POST) => {
    const response = POST();
    expect(response.status).toBe(410);
    expect(await response.json()).toMatchObject({ error: { code: "LOGIN_PROVIDER_DISABLED" } });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.has("set-cookie")).toBe(false);
  });
});
