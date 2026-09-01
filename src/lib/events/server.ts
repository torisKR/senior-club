import "server-only";

import { z } from "zod";

import {
  ApiHttpError,
  createJsonApiClient,
} from "@/lib/api";
import { INTERESTS } from "@/lib/data";
import type {
  Event,
  EventDifficulty,
  EventStatus,
  InterestId,
} from "@/lib/types";

export type PublicEventView = "upcoming" | "past" | "all";

const PUBLIC_EVENT_CURSOR_PATTERN = /^[A-Za-z0-9_-]{8,500}$/;

const SUPPORTED_INTERESTS = new Set<string>(
  INTERESTS.map((interest) => interest.id),
);

function isSafeLocalPath(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return false;
  try {
    return !value.split("/").some((segment) => {
      const decoded = decodeURIComponent(segment);
      return decoded === "." || decoded === ".." || /[\\\u0000-\u001f\u007f]/.test(decoded);
    });
  } catch {
    return false;
  }
}

function isSafeHttpsUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

const safeImageUrlSchema = z.string().trim().max(2_048).refine(
  (value) => isSafeLocalPath(value) || isSafeHttpsUrl(value),
  "이미지 URL은 안전한 로컬 경로 또는 HTTPS URL이어야 합니다.",
);

const safeExternalUrlSchema = z.string().trim().max(2_048).refine(
  isSafeHttpsUrl,
  "외부 링크는 HTTPS URL이어야 합니다.",
);

const apiEventCardSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(300),
  description: z.string(),
  coverImageUrl: safeImageUrlSchema.nullable(),
  locationName: z.string().min(1),
  address: z.string().min(1),
  mapUrl: safeExternalUrlSchema.nullable(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }).nullable(),
  registrationDeadline: z.string().datetime({ offset: true }).nullable(),
  capacity: z.number().int().positive(),
  participantCount: z.number().int().nonnegative(),
  remainingCapacity: z.number().int().nonnegative(),
  price: z.number().int().nonnegative(),
  currency: z.literal("KRW"),
  difficulty: z.enum(["EASY", "MODERATE", "HARD"]),
  supplies: z.string().nullable(),
  approvalMode: z.enum(["AUTO", "MANUAL"]),
  status: z.enum(["PUBLISHED", "CLOSED", "COMPLETED", "CANCELED"]),
  club: z.object({
    id: z.string().min(1),
    slug: z.string().min(1),
    title: z.string().min(1),
    region: z.string().nullable(),
    interest: z.object({
      slug: z.string().min(1),
      name: z.string().min(1),
      icon: z.string().min(1),
    }),
    leaderName: z.string().min(1),
  }),
});

const apiEventCatalogSchema = z.object({
  data: z.array(apiEventCardSchema),
  page: z.object({
    nextCursor: z.string().nullable(),
    hasNextPage: z.boolean(),
  }),
});

type ApiEventCard = z.infer<typeof apiEventCardSchema>;

const DIFFICULTY: Record<ApiEventCard["difficulty"], EventDifficulty> = {
  EASY: "쉬움",
  MODERATE: "보통",
  HARD: "도전",
};

const STATUS: Record<ApiEventCard["status"], EventStatus> = {
  PUBLISHED: "recruiting",
  CLOSED: "closed",
  COMPLETED: "completed",
  CANCELED: "cancelled",
};

function formatKoreanDate(startAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Seoul",
  }).format(new Date(startAt));
}

function splitAddress(address: string, clubRegion: string | null) {
  const parts = address.trim().split(/\s+/);
  const region = clubRegion?.trim() || parts[0] || "";
  const district =
    parts.find((part, index) => index > 0 && /(?:시|군|구)$/.test(part)) ?? "";
  return { region, district };
}

function splitSupplies(supplies: string | null) {
  if (!supplies) return [];
  return supplies
    .split(/[\n,·]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mapApiEventToWebEvent(input: unknown): Event {
  const event = apiEventCardSchema.parse(input);
  if (!SUPPORTED_INTERESTS.has(event.club.interest.slug)) {
    throw new Error(
      `지원하지 않는 관심사 slug입니다: ${event.club.interest.slug}`,
    );
  }
  const { region, district } = splitAddress(event.address, event.club.region);

  return {
    id: event.id,
    clubId: event.club.id,
    clubSlug: event.club.slug,
    clubTitle: event.club.title,
    title: event.title,
    description: event.description,
    category: event.club.interest.slug as InterestId,
    relatedInterests: [],
    location: event.locationName,
    address: event.address,
    region,
    district,
    date: formatKoreanDate(event.startAt),
    startAt: event.startAt,
    ...(event.endAt ? { endAt: event.endAt } : {}),
    ...(event.registrationDeadline
      ? { registrationDeadline: event.registrationDeadline }
      : {}),
    capacity: event.capacity,
    participantCount: event.participantCount,
    currentMembers: event.participantCount,
    price: event.price,
    difficulty: DIFFICULTY[event.difficulty],
    preparations: splitSupplies(event.supplies),
    ...(event.coverImageUrl ? { image: event.coverImageUrl } : {}),
    ...(event.mapUrl ? { mapUrl: event.mapUrl } : {}),
    leaderName: event.club.leaderName,
    status: STATUS[event.status],
  };
}

export type PublicEventCatalogOptions = {
  view?: PublicEventView;
  category?: string;
  region?: string;
  q?: string;
  limit?: number;
  cursor?: string;
};

export type PublicEventCatalog = {
  events: Event[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

export function parsePublicEventCursor(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return PUBLIC_EVENT_CURSOR_PATTERN.test(value) ? value : undefined;
}

export async function getPublicEventCatalog({
  view = "upcoming",
  category,
  region,
  q,
  limit = 50,
  cursor,
}: PublicEventCatalogOptions = {}): Promise<PublicEventCatalog> {
  const parameters = new URLSearchParams({
    view,
    limit: String(Math.min(50, Math.max(1, limit))),
  });
  if (category) parameters.set("category", category);
  if (region) parameters.set("region", region);
  if (q) parameters.set("q", q);
  if (cursor) {
    const safeCursor = parsePublicEventCursor(cursor);
    if (!safeCursor) throw new Error("모임 목록 위치 정보가 올바르지 않습니다.");
    parameters.set("cursor", safeCursor);
  }

  const payload = await createJsonApiClient().get<unknown>(
    `/v1/events?${parameters.toString()}`,
    {
      cache: "force-cache",
      next: { revalidate: 120 },
    },
  );
  const parsed = apiEventCatalogSchema.parse(payload);
  return {
    events: parsed.data.map(mapApiEventToWebEvent),
    nextCursor: parsed.page.nextCursor,
    hasNextPage: parsed.page.hasNextPage,
  };
}

export async function getPublicEvent(id: string): Promise<Event | null> {
  if (!/^[A-Za-z0-9._:-]{1,128}$/.test(id)) return null;
  try {
    const payload = await createJsonApiClient().get<unknown>(
      `/v1/events/${encodeURIComponent(id)}`,
      {
        cache: "force-cache",
        next: { revalidate: 120 },
      },
    );
    return mapApiEventToWebEvent(payload);
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return null;
    throw error;
  }
}

const SITEMAP_EVENT_VIEWS = ["upcoming", "past"] as const;
const SITEMAP_PAGES_PER_VIEW = 2;

/**
 * Keeps sitemap regeneration bounded to four API calls (two current/future
 * pages and two recent-past pages). This avoids walking an unbounded event
 * history on every regeneration while retaining the URLs users are most
 * likely to search for.
 */
export async function getPublicEventsForSitemap(
  fetchCatalog: (
    options: PublicEventCatalogOptions,
  ) => Promise<PublicEventCatalog> = getPublicEventCatalog,
): Promise<Event[]> {
  const viewPages = await Promise.all(
    SITEMAP_EVENT_VIEWS.map(async (view) => {
      const events: Event[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;

      for (let page = 0; page < SITEMAP_PAGES_PER_VIEW; page += 1) {
        const catalog = await fetchCatalog({
          view,
          limit: 50,
          cursor,
        });
        events.push(...catalog.events);
        if (!catalog.hasNextPage) break;
        if (!catalog.nextCursor) {
          throw new Error("모임 API의 페이지 정보가 일치하지 않습니다.");
        }
        if (seenCursors.has(catalog.nextCursor)) {
          throw new Error("모임 API가 반복되는 페이지 커서를 반환했습니다.");
        }
        seenCursors.add(catalog.nextCursor);
        cursor = catalog.nextCursor;
      }

      return events;
    }),
  );

  return [...new Map(viewPages.flat().map((event) => [event.id, event])).values()];
}
