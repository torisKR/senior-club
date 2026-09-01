import "server-only";

import { z } from "zod";

import { ApiHttpError, createJsonApiClient } from "@/lib/api";

export const PUBLIC_CLUB_REVALIDATE_SECONDS = 120;
export const PUBLIC_CLUB_SITEMAP_MAX_PAGES = 4;

const safeSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const safePathIdentifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const safeCursorSchema = z
  .string()
  .min(8)
  .max(500)
  .refine(
    (value) => value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value),
    "커뮤니티 목록 위치가 올바르지 않습니다.",
  );

function isSafeLocalPath(value: string) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("?") ||
    value.includes("#")
  ) {
    return false;
  }
  try {
    return !value.split("/").some((segment) => {
      let decoded = segment;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const next = decodeURIComponent(decoded);
        if (
          next === "." ||
          next === ".." ||
          /[\\\u0000-\u001f\u007f]/.test(next)
        ) {
          return true;
        }
        if (next === decoded) break;
        decoded = next;
      }
      return false;
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

const apiClubNextEventSchema = z.object({
  id: safePathIdentifierSchema,
  title: z.string().trim().min(1).max(300),
  locationName: z.string().trim().min(1).max(300),
  startAt: z.string().datetime({ offset: true }),
  status: z.enum(["PUBLISHED", "CLOSED"]),
});

const apiPublicClubSchema = z.object({
  id: z.string().min(1).max(128),
  slug: safeSlugSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(20_000),
  region: z.string().trim().min(1).max(100).nullable(),
  // The current API may omit this field. Keeping it optional lets the web
  // safely consume it when the public DTO gains the existing DB field.
  coverImageUrl: safeImageUrlSchema.nullable().optional(),
  interest: z.object({
    id: z.string().min(1).max(128),
    slug: safeSlugSchema,
    name: z.string().trim().min(1).max(100),
    icon: z.string().trim().min(1).max(100),
  }),
  leaderName: z.string().trim().min(1).max(100),
  memberCount: z.number().int().nonnegative(),
  upcomingEventCount: z.number().int().nonnegative(),
  pastEventCount: z.number().int().nonnegative(),
  nextEvent: apiClubNextEventSchema.nullable(),
});

const apiPublicClubCatalogSchema = z.object({
  data: z.array(apiPublicClubSchema),
  page: z
    .object({
      nextCursor: safeCursorSchema.nullable(),
      hasNextPage: z.boolean(),
    })
    .superRefine((page, context) => {
      if (page.hasNextPage !== Boolean(page.nextCursor)) {
        context.addIssue({
          code: "custom",
          message: "커뮤니티 페이지 정보가 서로 일치하지 않습니다.",
        });
      }
    }),
});

const normalizedSearchText = z
  .string()
  .trim()
  .transform((value) => value.replace(/\s+/g, " "));

const publicClubCatalogOptionsSchema = z
  .object({
    limit: z.number().int().min(1).max(50).default(20),
    cursor: safeCursorSchema.optional(),
    category: safeSlugSchema.optional(),
    region: normalizedSearchText.pipe(z.string().min(1).max(80)).optional(),
    q: normalizedSearchText.pipe(z.string().min(2).max(80)).optional(),
  })
  .strict();

type ApiPublicClub = z.infer<typeof apiPublicClubSchema>;

export type PublicClubNextEvent = {
  id: string;
  title: string;
  locationName: string;
  startAt: string;
  dateLabel: string;
  status: "PUBLISHED" | "CLOSED";
};

export type PublicClub = {
  id: string;
  slug: string;
  title: string;
  description: string;
  region: string | null;
  image?: string;
  interest: {
    id: string;
    slug: string;
    name: string;
    icon: string;
  };
  leaderName: string;
  memberCount: number;
  upcomingEventCount: number;
  pastEventCount: number;
  nextEvent: PublicClubNextEvent | null;
};

export type PublicClubCatalogOptions = {
  limit?: number;
  cursor?: string;
  category?: string;
  region?: string;
  q?: string;
};

export type PublicClubCatalog = {
  clubs: PublicClub[];
  nextCursor: string | null;
  hasNextPage: boolean;
};

function formatKoreanDateTime(startAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(startAt));
}

export function isSafePublicClubCursor(value: unknown): value is string {
  return safeCursorSchema.safeParse(value).success;
}

export function isSafePublicClubSlug(value: unknown): value is string {
  return safeSlugSchema.safeParse(value).success;
}

export function mapApiClubToPublicClub(input: unknown): PublicClub {
  const club: ApiPublicClub = apiPublicClubSchema.parse(input);
  return {
    id: club.id,
    slug: club.slug,
    title: club.title,
    description: club.description,
    region: club.region,
    ...(club.coverImageUrl ? { image: club.coverImageUrl } : {}),
    interest: {
      id: club.interest.id,
      slug: club.interest.slug,
      name: club.interest.name,
      icon: club.interest.icon,
    },
    leaderName: club.leaderName,
    memberCount: club.memberCount,
    upcomingEventCount: club.upcomingEventCount,
    pastEventCount: club.pastEventCount,
    nextEvent: club.nextEvent
      ? {
          ...club.nextEvent,
          dateLabel: formatKoreanDateTime(club.nextEvent.startAt),
        }
      : null,
  };
}

export async function getPublicClubCatalog(
  options: PublicClubCatalogOptions = {},
): Promise<PublicClubCatalog> {
  const query = publicClubCatalogOptionsSchema.parse(options);
  const parameters = new URLSearchParams({ limit: String(query.limit) });
  if (query.cursor) parameters.set("cursor", query.cursor);
  if (query.category) parameters.set("category", query.category);
  if (query.region) parameters.set("region", query.region);
  if (query.q) parameters.set("q", query.q);

  const payload = await createJsonApiClient().get<unknown>(
    `/v1/clubs?${parameters.toString()}`,
    {
      cache: "force-cache",
      next: { revalidate: PUBLIC_CLUB_REVALIDATE_SECONDS },
    },
  );
  const parsed = apiPublicClubCatalogSchema.parse(payload);
  return {
    clubs: parsed.data.map(mapApiClubToPublicClub),
    nextCursor: parsed.page.nextCursor,
    hasNextPage: parsed.page.hasNextPage,
  };
}

export async function getPublicClub(slug: string): Promise<PublicClub | null> {
  if (!isSafePublicClubSlug(slug)) return null;
  try {
    const payload = await createJsonApiClient().get<unknown>(
      `/v1/clubs/${encodeURIComponent(slug)}`,
      {
        cache: "force-cache",
        next: { revalidate: PUBLIC_CLUB_REVALIDATE_SECONDS },
      },
    );
    return mapApiClubToPublicClub(payload);
  } catch (error) {
    if (error instanceof ApiHttpError && error.status === 404) return null;
    throw error;
  }
}

export async function getPublicClubsForSitemap(): Promise<PublicClub[]> {
  const clubs = new Map<string, PublicClub>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < PUBLIC_CLUB_SITEMAP_MAX_PAGES; page += 1) {
    const catalog = await getPublicClubCatalog({ limit: 50, cursor });
    catalog.clubs.forEach((club) => clubs.set(club.slug, club));
    if (!catalog.hasNextPage || !catalog.nextCursor) {
      return [...clubs.values()];
    }
    if (seenCursors.has(catalog.nextCursor)) {
      throw new Error("커뮤니티 API가 반복되는 페이지 커서를 반환했습니다.");
    }
    seenCursors.add(catalog.nextCursor);
    cursor = catalog.nextCursor;
  }

  // A sitemap may contain a verified subset. Stop at the explicit MVP budget
  // instead of making an unbounded sequence of API requests during rebuilds.
  return [...clubs.values()];
}
