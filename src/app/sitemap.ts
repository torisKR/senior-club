import type { MetadataRoute } from "next";

import { getPublicClubsForSitemap } from "@/lib/clubs/server";
import { getEffectiveEventStatus } from "@/lib/event-status";
import { getPublicEventsForSitemap } from "@/lib/events/server";
import { getSiteUrl } from "@/lib/site-url";
import type { PublicClub } from "@/lib/clubs/server";
import type { Event } from "@/lib/types";

const STATIC_PUBLIC_ROUTES = [
  { path: "", changeFrequency: "daily", priority: 1 },
  { path: "/clubs", changeFrequency: "daily", priority: 0.9 },
  { path: "/events", changeFrequency: "daily", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
  { path: "/account-deletion", changeFrequency: "yearly", priority: 0.4 },
] as const;

export function createPublicSitemap(
  baseUrl = getSiteUrl(),
  now: Date = new Date(),
  events: readonly Event[] = [],
  clubs: ReadonlyArray<Pick<PublicClub, "slug">> = [],
): MetadataRoute.Sitemap {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const staticPages: MetadataRoute.Sitemap = STATIC_PUBLIC_ROUTES.map((route) => ({
    url: `${normalizedBaseUrl}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
  const eventPages: MetadataRoute.Sitemap = events.map((event) => {
    const effectiveStatus = getEffectiveEventStatus(event, now);
    return {
      url: `${normalizedBaseUrl}/events/${event.id}`,
      changeFrequency:
        effectiveStatus === "completed" || effectiveStatus === "cancelled"
          ? "yearly"
          : "weekly",
      priority: effectiveStatus === "recruiting" ? 0.8 : 0.55,
    };
  });
  const clubPages: MetadataRoute.Sitemap = clubs.map((club) => ({
    url: `${normalizedBaseUrl}/clubs/${club.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticPages, ...clubPages, ...eventPages];
}

export const revalidate = 3_600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [events, clubs] = await Promise.all([
    getPublicEventsForSitemap().catch(() => []),
    getPublicClubsForSitemap().catch(() => []),
  ]);
  // Each catalog fails closed independently: one unavailable API never
  // publishes fixtures and does not erase URLs verified by the other API.
  return createPublicSitemap(getSiteUrl(), new Date(), events, clubs);
}
