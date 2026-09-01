import { HomeDashboard } from "@/components/home-dashboard";
import { JsonLd } from "@/components/json-ld";
import {
  SITE_DESCRIPTION,
  createClubListJsonLd,
  createEventListJsonLd,
  createOrganizationJsonLd,
  createPublicPageMetadata,
  createWebSiteJsonLd,
} from "@/lib/seo";
import { getPublicEventCatalog } from "@/lib/events/server";
import { getPublicClubCatalog } from "@/lib/clubs/server";
import { getHomeFeaturedEvents } from "@/lib/home-featured-events";

export const revalidate = 120;

export const metadata = createPublicPageMetadata({
  title: "시니어클럽 | 같은 관심사로 이어지는 시니어 모임",
  description: SITE_DESCRIPTION,
  path: "/",
  includeBrandInTitle: false,
});

export default async function HomePage() {
  const [catalogEvents, catalogClubs] = await Promise.all([
    getPublicEventCatalog({ view: "upcoming" })
      .then((catalog) => catalog.events)
      .catch(() => null),
    getPublicClubCatalog({ limit: 6 })
      .then((catalog) => catalog.clubs)
      .catch(() => null),
  ]);
  const featuredEvents = catalogEvents
    ? getHomeFeaturedEvents(catalogEvents)
    : null;

  return (
    <>
      <JsonLd data={createWebSiteJsonLd()} />
      <JsonLd data={createOrganizationJsonLd()} />
      {featuredEvents && featuredEvents.length > 0 ? (
        <JsonLd data={createEventListJsonLd(featuredEvents)} />
      ) : null}
      {catalogClubs ? <JsonLd data={createClubListJsonLd(catalogClubs)} /> : null}
      <HomeDashboard
        catalogClubs={catalogClubs}
        catalogEvents={catalogEvents}
        featuredCatalogEvents={featuredEvents}
      />
    </>
  );
}
