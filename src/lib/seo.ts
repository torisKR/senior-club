import type { Metadata } from "next";

import {
  getEffectiveEventStatus,
  isEventRegistrationOpen,
  isUpcomingEvent,
} from "@/lib/event-status";
import type { Event } from "@/lib/types";
import { getSiteUrl } from "@/lib/site-url";

export const SITE_NAME = "시니어클럽";
export const SITE_ALTERNATE_NAME = "Senior Club";
export const SITE_DESCRIPTION =
  "관심사가 같은 시니어가 가까운 모임에서 만나 활동하고, 다음 약속과 관계를 이어가는 목적 중심 커뮤니티입니다.";
export const SITE_KEYWORDS: string[] = [
  "시니어클럽",
  "시니어 커뮤니티",
  "시니어 모임",
  "중장년 커뮤니티",
  "60대 모임",
  "서울 시니어 모임",
  "시니어 취미",
  "등산 모임",
  "사진 모임",
  "문화 모임",
];

export const DEFAULT_SOCIAL_IMAGE = "/images/club-senior-hero.jpg";

export function truncateMetadataDescription(
  value: string,
  maximumLength = 160,
): string {
  const normalized = value.normalize("NFC").replace(/\s+/gu, " ").trim();
  const characters = Array.from(normalized);
  if (characters.length <= maximumLength) return normalized;

  const candidate = characters.slice(0, maximumLength - 1).join("").trimEnd();
  const lastSpace = candidate.lastIndexOf(" ");
  const cutoff = lastSpace >= Math.floor(maximumLength * 0.65)
    ? lastSpace
    : candidate.length;
  return `${candidate.slice(0, cutoff).trimEnd()}…`;
}

type PageMetadataOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
  includeBrandInTitle?: boolean;
};

export function absoluteUrl(path: string, baseUrl = getSiteUrl()): string {
  const normalizedBase = `${baseUrl.replace(/\/+$/, "")}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, normalizedBase).toString();
}

export function createPublicPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_SOCIAL_IMAGE,
  includeBrandInTitle = true,
}: PageMetadataOptions): Metadata {
  const fullTitle = includeBrandInTitle ? `${title} | ${SITE_NAME}` : title;
  const canonicalUrl = absoluteUrl(path);
  const socialImage = absoluteUrl(image);
  const normalizedDescription = truncateMetadataDescription(description);

  return {
    title: { absolute: fullTitle },
    description: normalizedDescription,
    keywords: SITE_KEYWORDS,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: fullTitle,
      description: normalizedDescription,
      url: canonicalUrl,
      siteName: SITE_NAME,
      locale: "ko_KR",
      type: "website",
      images: [
        {
          url: socialImage,
          alt: `${SITE_NAME}에서 관심사가 같은 사람들과 모임을 갖는 모습`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: normalizedDescription,
      images: [socialImage],
    },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

/**
 * Keeps an operational policy URL directly accessible while preventing an
 * unfinished draft from being indexed or treated as authoritative evidence.
 */
export function createDraftPolicyPageMetadata(
  options: PageMetadataOptions,
): Metadata {
  return {
    ...createPublicPageMetadata(options),
    robots: {
      index: false,
      follow: true,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    },
  };
}

export const PRIVATE_ROUTE_METADATA: Metadata = {
  robots: {
    index: false,
    follow: false,
    noarchive: true,
    noimageindex: true,
    nosnippet: true,
  },
};

export function createNoIndexPageMetadata({
  title,
  description,
}: Pick<PageMetadataOptions, "title" | "description">): Metadata {
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    robots: PRIVATE_ROUTE_METADATA.robots,
  };
}

export function createNoIndexFollowPageMetadata({
  title,
  description,
}: Pick<PageMetadataOptions, "title" | "description">): Metadata {
  return {
    title: { absolute: `${title} | ${SITE_NAME}` },
    description,
    robots: {
      index: false,
      follow: true,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    },
  };
}

export function createOrganizationJsonLd(baseUrl = getSiteUrl()) {
  const siteUrl = absoluteUrl("/", baseUrl);

  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}#organization`,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    url: siteUrl,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/images/senior-club-mark-v3.png", baseUrl),
      width: 512,
      height: 512,
    },
    description: SITE_DESCRIPTION,
    areaServed: {
      "@type": "Country",
      name: "대한민국",
    },
  };
}

export function createWebSiteJsonLd(baseUrl = getSiteUrl()) {
  const siteUrl = absoluteUrl("/", baseUrl);

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}#website`,
    url: siteUrl,
    name: SITE_NAME,
    alternateName: SITE_ALTERNATE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "ko-KR",
    publisher: {
      "@id": `${siteUrl}#organization`,
    },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${absoluteUrl("/events", baseUrl)}?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function createAboutPageJsonLd(baseUrl = getSiteUrl()) {
  const pageUrl = absoluteUrl("/about", baseUrl);

  return {
    "@context": "https://schema.org",
    "@type": "AboutPage",
    "@id": `${pageUrl}#about`,
    url: pageUrl,
    name: `${SITE_NAME} 서비스 안내`,
    description: SITE_DESCRIPTION,
    inLanguage: "ko-KR",
    mainEntity: {
      "@id": `${absoluteUrl("/", baseUrl)}#organization`,
    },
  };
}

export function createFaqPageJsonLd(
  entries: ReadonlyArray<{ question: string; answer: string }>,
) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}

function eventStatusUrl(status: Event["status"]): string {
  if (status === "cancelled") return "https://schema.org/EventCancelled";
  return "https://schema.org/EventScheduled";
}

export function createEventJsonLd(
  event: Event,
  baseUrl = getSiteUrl(),
  now: Date = new Date(),
) {
  const eventUrl = absoluteUrl(`/events/${event.id}`, baseUrl);
  const participantCount = event.participantCount ?? event.currentMembers ?? 0;
  const effectiveStatus = getEffectiveEventStatus(event, now);
  const isAvailable = isEventRegistrationOpen(event, now);
  const isFull = participantCount >= event.capacity;
  const offerAvailability = isAvailable
    ? "https://schema.org/InStock"
    : isFull && isUpcomingEvent(event, now)
      ? "https://schema.org/SoldOut"
      : null;

  return {
    "@context": "https://schema.org",
    "@type": "Event",
    "@id": `${eventUrl}#event`,
    name: event.title,
    description: event.description,
    url: eventUrl,
    ...(event.image
      ? { image: [absoluteUrl(event.image, baseUrl)] }
      : {}),
    startDate: event.startAt,
    ...(event.endAt ? { endDate: event.endAt } : {}),
    eventStatus: eventStatusUrl(effectiveStatus),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: {
      "@type": "Place",
      name: event.location,
      address: {
        "@type": "PostalAddress",
        streetAddress: event.address,
        addressLocality: event.district,
        addressRegion: event.region,
        addressCountry: "KR",
      },
    },
    organizer: {
      "@type": "Organization",
      "@id": `${absoluteUrl("/", baseUrl)}#organization`,
      name: SITE_NAME,
      url: absoluteUrl("/", baseUrl),
    },
    maximumAttendeeCapacity: event.capacity,
    remainingAttendeeCapacity: Math.max(event.capacity - participantCount, 0),
    offers: {
      "@type": "Offer",
      url: eventUrl,
      price: event.price,
      priceCurrency: "KRW",
      availabilityEnds: event.registrationDeadline ?? event.startAt,
      ...(offerAvailability ? { availability: offerAvailability } : {}),
    },
  };
}

export function createEventBreadcrumbJsonLd(event: Event, baseUrl = getSiteUrl()) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: absoluteUrl("/", baseUrl),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "모임",
        item: absoluteUrl("/events", baseUrl),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: event.title,
        item: absoluteUrl(`/events/${event.id}`, baseUrl),
      },
    ],
  };
}

export function createEventListJsonLd(
  events: readonly Event[],
  baseUrl = getSiteUrl(),
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SITE_NAME} 공개 모임`,
    numberOfItems: events.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: event.title,
      url: absoluteUrl(`/events/${event.id}`, baseUrl),
    })),
  };
}

export function createClubListJsonLd(
  clubs: ReadonlyArray<{ slug: string; title: string }>,
  baseUrl = getSiteUrl(),
) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${SITE_NAME} 공개 커뮤니티`,
    numberOfItems: clubs.length,
    itemListOrder: "https://schema.org/ItemListOrderAscending",
    itemListElement: clubs.map((club, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: club.title,
      url: absoluteUrl(`/clubs/${club.slug}`, baseUrl),
    })),
  };
}

export function createClubPageJsonLd(
  club: {
    slug: string;
    title: string;
    description: string;
    region: string | null;
    interest: { name: string };
  },
  baseUrl = getSiteUrl(),
) {
  const pageUrl = absoluteUrl(`/clubs/${club.slug}`, baseUrl);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${pageUrl}#community`,
    url: pageUrl,
    name: club.title,
    description: club.description,
    inLanguage: "ko-KR",
    isPartOf: { "@id": `${absoluteUrl("/", baseUrl)}#website` },
    about: {
      "@type": "Thing",
      name: club.interest.name,
    },
    ...(club.region
      ? {
          spatialCoverage: {
            "@type": "Place",
            name: club.region,
          },
        }
      : {}),
  };
}

export function createClubBreadcrumbJsonLd(
  club: { slug: string; title: string },
  baseUrl = getSiteUrl(),
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "홈",
        item: absoluteUrl("/", baseUrl),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "커뮤니티",
        item: absoluteUrl("/clubs", baseUrl),
      },
      {
        "@type": "ListItem",
        position: 3,
        name: club.title,
        item: absoluteUrl(`/clubs/${club.slug}`, baseUrl),
      },
    ],
  };
}

/**
 * JSON-LD is rendered in an HTML script element. Escaping the opening angle
 * bracket prevents a payload containing `</script>` from ending that element.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
