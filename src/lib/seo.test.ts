import { describe, expect, it } from "vitest";

import { EVENTS } from "@/lib/data";
import {
  absoluteUrl,
  createAboutPageJsonLd,
  createClubBreadcrumbJsonLd,
  createClubListJsonLd,
  createClubPageJsonLd,
  createDraftPolicyPageMetadata,
  createEventBreadcrumbJsonLd,
  createEventListJsonLd,
  createEventJsonLd,
  createFaqPageJsonLd,
  createNoIndexPageMetadata,
  createOrganizationJsonLd,
  createPublicPageMetadata,
  createWebSiteJsonLd,
  serializeJsonLd,
  truncateMetadataDescription,
} from "@/lib/seo";

const BASE_URL = "https://senior-club.example";

describe("SEO helpers", () => {
  it("creates normalized absolute URLs", () => {
    expect(absoluteUrl("/events", `${BASE_URL}/`)).toBe(`${BASE_URL}/events`);
    expect(absoluteUrl("clubs", BASE_URL)).toBe(`${BASE_URL}/clubs`);
  });

  it("creates canonical, social, and crawl metadata for public pages", () => {
    const metadata = createPublicPageMetadata({
      title: "모임 찾기",
      description: "가까운 시니어 모임을 찾습니다.",
      path: "/events",
    });

    expect(metadata.title).toEqual({ absolute: "모임 찾기 | 시니어클럽" });
    expect(metadata.alternates?.canonical).toContain("/events");
    expect(metadata.openGraph?.siteName).toBe("시니어클럽");
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
    expect(metadata.robots).toMatchObject({ index: true, follow: true });
  });

  it("keeps unfinished policy pages accessible without indexing or archiving them", () => {
    const metadata = createDraftPolicyPageMetadata({
      title: "개인정보 처리방침",
      description: "출시 전 운영 초안입니다.",
      path: "/privacy",
    });

    expect(metadata.alternates?.canonical).toContain("/privacy");
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: true,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    });
  });

  it("creates noindex metadata without a public canonical for fixture content", () => {
    const metadata = createNoIndexPageMetadata({
      title: "사진산책 게시판",
      description: "로컬 fixture 게시판입니다.",
    });

    expect(metadata.title).toEqual({
      absolute: "사진산책 게시판 | 시니어클럽",
    });
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      noarchive: true,
    });
    expect(metadata.alternates).toBeUndefined();
  });

  it("describes the site and organization using stable schema identifiers", () => {
    const website = createWebSiteJsonLd(BASE_URL);
    const organization = createOrganizationJsonLd(BASE_URL);

    expect(website).toMatchObject({
      "@type": "WebSite",
      name: "시니어클럽",
      publisher: { "@id": `${BASE_URL}/#organization` },
    });
    expect(organization).toMatchObject({
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      name: "시니어클럽",
    });
  });

  it("creates Event and BreadcrumbList structured data", () => {
    const event = EVENTS[0];
    const eventJsonLd = createEventJsonLd(event, BASE_URL);
    const breadcrumb = createEventBreadcrumbJsonLd(event, BASE_URL);

    expect(eventJsonLd).toMatchObject({
      "@type": "Event",
      name: event.title,
      startDate: event.startAt,
      offers: { priceCurrency: "KRW" },
      location: {
        address: { addressCountry: "KR" },
      },
    });
    expect(breadcrumb.itemListElement).toHaveLength(3);
    expect(breadcrumb.itemListElement[2]).toMatchObject({
      position: 3,
      name: event.title,
    });
  });

  it("creates an ItemList from only the supplied verified events", () => {
    const list = createEventListJsonLd(EVENTS.slice(0, 2), BASE_URL);

    expect(list).toMatchObject({
      "@type": "ItemList",
      numberOfItems: 2,
    });
    expect(list.itemListElement).toEqual([
      expect.objectContaining({
        position: 1,
        name: EVENTS[0].title,
        url: `${BASE_URL}/events/${EVENTS[0].id}`,
      }),
      expect.objectContaining({
        position: 2,
        name: EVENTS[1].title,
        url: `${BASE_URL}/events/${EVENTS[1].id}`,
      }),
    ]);
  });

  it("creates community ItemList, CollectionPage, and breadcrumbs from verified clubs", () => {
    const club = {
      slug: "forest-walkers",
      title: "숲길을 걷는 사람들",
      description: "가까운 숲길을 천천히 걷습니다.",
      region: "서울특별시",
      interest: { name: "등산" },
    };
    const list = createClubListJsonLd([club], BASE_URL);
    const page = createClubPageJsonLd(club, BASE_URL);
    const breadcrumb = createClubBreadcrumbJsonLd(club, BASE_URL);

    expect(list).toMatchObject({
      "@type": "ItemList",
      numberOfItems: 1,
      itemListElement: [
        expect.objectContaining({
          position: 1,
          name: club.title,
          url: `${BASE_URL}/clubs/${club.slug}`,
        }),
      ],
    });
    expect(page).toMatchObject({
      "@type": "CollectionPage",
      url: `${BASE_URL}/clubs/${club.slug}`,
      about: { "@type": "Thing", name: "등산" },
      spatialCoverage: { "@type": "Place", name: "서울특별시" },
    });
    expect(breadcrumb.itemListElement).toHaveLength(3);
    expect(breadcrumb.itemListElement[2]).toMatchObject({
      position: 3,
      name: club.title,
    });
  });

  it("does not call an expired event sold out unless its capacity is full", () => {
    const event = EVENTS.find(
      (candidate) => candidate.id === "event-bukhansan-dullegil",
    );
    if (!event) throw new Error("event fixture is missing");

    const jsonLd = createEventJsonLd(
      event,
      BASE_URL,
      new Date("2026-07-25T13:00:00+09:00"),
    );

    expect(jsonLd.eventStatus).toBe("https://schema.org/EventScheduled");
    expect(jsonLd.offers).toMatchObject({ availabilityEnds: event.startAt });
    expect(jsonLd.offers).not.toHaveProperty("availability");
  });

  it("uses SoldOut only for a full scheduled event and omits an invented image", () => {
    const event = {
      ...EVENTS[0],
      image: undefined,
      participantCount: EVENTS[0].capacity,
      currentMembers: EVENTS[0].capacity,
    };
    const jsonLd = createEventJsonLd(
      event,
      BASE_URL,
      new Date("2026-07-20T00:00:00+09:00"),
    );

    expect(jsonLd.offers).toMatchObject({
      availability: "https://schema.org/SoldOut",
    });
    expect(jsonLd).not.toHaveProperty("image");
  });

  it("normalizes and bounds metadata descriptions", () => {
    const description = truncateMetadataDescription(
      `서울 모임입니다.   ${"아주 긴 상세 설명 ".repeat(30)}`,
    );

    expect(description.length).toBeLessThanOrEqual(160);
    expect(description).not.toContain("  ");
    expect(description.endsWith("…")).toBe(true);

    const emojiMetadata = createPublicPageMetadata({
      title: "설명 검사",
      description: `함께 걸어요 ${"🌿".repeat(200)}`,
      path: "/about",
    });
    expect(Array.from(emojiMetadata.description ?? "")).toHaveLength(160);
    expect(emojiMetadata.openGraph?.description).toBe(
      emojiMetadata.description,
    );
    expect(emojiMetadata.twitter?.description).toBe(
      emojiMetadata.description,
    );
  });

  it("creates extractable AboutPage and FAQPage structured data", () => {
    const about = createAboutPageJsonLd(BASE_URL);
    const faq = createFaqPageJsonLd([
      { question: "시니어클럽은 무엇인가요?", answer: "목적 중심 시니어 커뮤니티입니다." },
    ]);

    expect(about).toMatchObject({
      "@type": "AboutPage",
      url: `${BASE_URL}/about`,
      mainEntity: { "@id": `${BASE_URL}/#organization` },
    });
    expect(faq).toMatchObject({
      "@type": "FAQPage",
      mainEntity: [
        expect.objectContaining({
          "@type": "Question",
          name: "시니어클럽은 무엇인가요?",
        }),
      ],
    });
  });

  it("escapes opening angle brackets before JSON-LD reaches a script element", () => {
    const serialized = serializeJsonLd({
      description: "안전</script><script>alert(1)</script>",
    });

    expect(serialized).not.toContain("<");
    expect(serialized).toContain("\\u003c/script>");
    expect(JSON.parse(serialized)).toEqual({
      description: "안전</script><script>alert(1)</script>",
    });
  });
});
