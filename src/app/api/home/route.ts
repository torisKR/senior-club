import { NextResponse } from "next/server";

/**
 * The early prototype returned a fabricated user and fixture event IDs here.
 * No production client consumes this route; retire it explicitly instead of
 * allowing those records to be mistaken for authenticated API data.
 */
export function GET() {
  return NextResponse.json(
    {
      error: {
        code: "ENDPOINT_RETIRED",
        message: "홈 화면은 공개 모임 API와 로그인 사용자 API를 사용합니다.",
      },
    },
    {
      status: 410,
      headers: {
        "Cache-Control": "private, no-store",
        Deprecation: "true",
        Link: '</>; rel="alternate"',
      },
    },
  );
}
