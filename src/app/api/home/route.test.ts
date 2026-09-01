import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/home/route";

describe("GET /api/home", () => {
  it("fixture 사용자와 모임을 반환하지 않고 명시적으로 종료한다", async () => {
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(410);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("deprecation")).toBe("true");
    expect(body).toEqual({
      error: {
        code: "ENDPOINT_RETIRED",
        message: "홈 화면은 공개 모임 API와 로그인 사용자 API를 사용합니다.",
      },
    });
  });
});
