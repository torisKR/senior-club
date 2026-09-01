import { NextResponse } from "next/server";

import { apiErrorResponse, backendApi } from "@/lib/auth/bff";

const PUBLIC_INTEREST_CACHE_CONTROL =
  "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400";

export async function GET() {
  try {
    const result = await backendApi().get("/v1/interests");
    return NextResponse.json(result, {
      headers: { "Cache-Control": PUBLIC_INTEREST_CACHE_CONTROL },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
