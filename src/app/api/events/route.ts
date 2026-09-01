import { type NextRequest, NextResponse } from "next/server";

import { INTERESTS } from "@/lib/data";
import {
  getPublicEventCatalog,
  type PublicEventView,
} from "@/lib/events/server";
import type { InterestId } from "@/lib/types";

const PUBLIC_CATALOG_CACHE_CONTROL =
  "public, max-age=30, s-maxage=120, stale-while-revalidate=300";
const EVENT_VIEWS = new Set<PublicEventView>(["upcoming", "past", "all"]);

function resolveCategory(value: string | null): InterestId | undefined {
  if (!value) return undefined;
  const normalized = value.trim().toLocaleLowerCase("ko-KR");
  return INTERESTS.find(
    (interest) =>
      interest.id === normalized ||
      interest.label.toLocaleLowerCase("ko-KR") === normalized,
  )?.id;
}

function error(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const rawCategory = searchParams.get("category");
  const category = resolveCategory(rawCategory);
  const region = searchParams.get("region")?.trim();
  const query = searchParams.get("q")?.trim();
  const rawView = searchParams.get("view");
  const legacyStatus = searchParams.get("status");
  const legacyView =
    legacyStatus === "recruiting"
      ? "upcoming"
      : legacyStatus === "completed"
        ? "past"
        : undefined;
  const view = (rawView ?? legacyView ?? "upcoming") as PublicEventView;
  const parsedLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);

  if (rawCategory && !category) {
    return error("INVALID_CATEGORY", "알 수 없는 관심사입니다.", 400);
  }
  if (rawView && !EVENT_VIEWS.has(view)) {
    return error("INVALID_VIEW", "알 수 없는 모임 보기 방식입니다.", 400);
  }
  if (legacyStatus && !legacyView) {
    return error(
      "INVALID_STATUS",
      "status 대신 view=upcoming|past|all을 사용해 주세요.",
      400,
    );
  }
  if (query && (query.length < 2 || query.length > 80)) {
    return error("INVALID_QUERY", "검색어는 2~80자로 입력해 주세요.", 400);
  }
  if (region && region.length > 80) {
    return error("INVALID_REGION", "지역은 80자 이내로 입력해 주세요.", 400);
  }

  const limit = Number.isFinite(parsedLimit)
    ? Math.min(50, Math.max(1, parsedLimit))
    : 50;

  try {
    const catalog = await getPublicEventCatalog({
      view,
      limit,
      ...(category ? { category } : {}),
      ...(region ? { region } : {}),
      ...(query ? { q: query } : {}),
    });
    return NextResponse.json(
      {
        data: catalog.events,
        page: {
          nextCursor: catalog.nextCursor,
          hasNextPage: catalog.hasNextPage,
        },
        meta: {
          limit,
          filters: {
            category: category ?? null,
            region: region ?? null,
            q: query ?? null,
            view,
          },
          source: "backend",
        },
      },
      { headers: { "Cache-Control": PUBLIC_CATALOG_CACHE_CONTROL } },
    );
  } catch {
    return error(
      "UPSTREAM_UNAVAILABLE",
      "모임 목록을 불러오지 못했습니다. 잠시 뒤 다시 시도해 주세요.",
      503,
    );
  }
}
