import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck2,
  CalendarClock,
  CalendarX2,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";

import { EventCard } from "@/components/event-card";
import { JsonLd } from "@/components/json-ld";
import { PurposeJourney } from "@/components/purpose-journey";
import { INTERESTS } from "@/lib/data";
import {
  isEventRegistrationOpen,
  isUpcomingEvent,
} from "@/lib/event-status";
import {
  getPublicEventCatalog,
  parsePublicEventCursor,
} from "@/lib/events/server";
import {
  createEventListJsonLd,
} from "@/lib/seo";
import { createEventsPageMetadata } from "@/lib/events/page-metadata";

export const revalidate = 120;

type EventsPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    category?: string | string[];
    view?: string | string[];
    cursor?: string | string[];
  }>;
};

export async function generateMetadata({
  searchParams,
}: EventsPageProps): Promise<Metadata> {
  const query = await searchParams;
  return createEventsPageMetadata(Object.keys(query).length > 0);
}

const VIEW_OPTIONS = [
  { id: "open", label: "신청 가능", icon: CalendarCheck2 },
  { id: "scheduled", label: "예정된 모임", icon: CalendarClock },
  { id: "past", label: "지난 모임", icon: CalendarX2 },
] as const;

function singleSearchParameter(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

export default async function EventsPage({ searchParams }: EventsPageProps) {
  const query = await searchParams;
  const now = new Date();
  const rawSearchTerm = singleSearchParameter(query.q);
  const rawCategory = singleSearchParameter(query.category);
  const rawView = singleSearchParameter(query.view);
  const searchTerm = rawSearchTerm?.trim() ?? "";
  const selectedCategory = INTERESTS.some((interest) => interest.id === rawCategory)
    ? rawCategory
    : "all";
  const selectedView = VIEW_OPTIONS.some((option) => option.id === rawView)
    ? rawView
    : "open";
  const cursor = parsePublicEventCursor(query.cursor);
  const hasInvalidCursor = query.cursor !== undefined && cursor === undefined;
  const isSearchValid =
    !searchTerm || (searchTerm.length >= 2 && searchTerm.length <= 80);
  let catalog: Awaited<ReturnType<typeof getPublicEventCatalog>> | null = null;
  let availableCatalog: Awaited<ReturnType<typeof getPublicEventCatalog>> | null = null;

  if (isSearchValid && !hasInvalidCursor) {
    try {
      const catalogOptions = {
        view: selectedView === "past" ? "past" as const : "upcoming" as const,
        ...(selectedCategory !== "all" ? { category: selectedCategory } : {}),
        ...(searchTerm ? { q: searchTerm } : {}),
        ...(cursor ? { cursor } : {}),
      };
      const canReuseCatalogForOpenCount =
        catalogOptions.view === "upcoming" &&
        selectedCategory === "all" &&
        !searchTerm &&
        !cursor;

      if (canReuseCatalogForOpenCount) {
        catalog = await getPublicEventCatalog(catalogOptions);
        availableCatalog = catalog;
      } else {
        [catalog, availableCatalog] = await Promise.all([
          getPublicEventCatalog(catalogOptions),
          getPublicEventCatalog({ view: "upcoming" }),
        ]);
      }
    } catch {
      catalog = null;
      availableCatalog = null;
    }
  }

  const events = (catalog?.events ?? []).filter((event) => {
    const matchesView =
      selectedView === "past"
        ? true
        : selectedView === "scheduled"
          ? isUpcomingEvent(event, now)
          : isEventRegistrationOpen(event, now);
    return matchesView;
  }).sort((a, b) => a.startAt.localeCompare(b.startAt));

  const visibleOpenCount =
    availableCatalog?.events.filter((event) =>
      isEventRegistrationOpen(event, now),
    ).length ?? null;

  const activeInterest = INTERESTS.find((interest) => interest.id === selectedCategory);
  const resultDescription = [
    activeInterest?.label,
    searchTerm ? `‘${searchTerm}’ 검색` : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="page-content">
      {catalog && events.length > 0 ? (
        <JsonLd data={createEventListJsonLd(events)} />
      ) : null}
      <div className="page-container">
        <section className="grid gap-8 rounded-[2rem] bg-[var(--sky-soft)] px-6 py-9 sm:px-10 lg:grid-cols-[1fr_22rem] lg:items-end lg:px-12 lg:py-11">
          <div>
            <p className="eyebrow">활동으로 이어지는 만남</p>
            <h1 className="page-title">내 일정과 걸음에 맞는 모임을 찾아보세요</h1>
            <p className="supporting-copy mt-4">지역과 관심사를 확인하고, 준비물과 난이도까지 살핀 뒤 편하게 신청할 수 있어요.</p>
          </div>
          <div className="rounded-[1.3rem] bg-white p-5 shadow-[0_10px_30px_rgba(20,52,46,0.08)]">
            <p className="text-sm font-black text-[var(--primary)]">지금 확인된 신청 가능한 모임</p>
            <p className="mt-1 text-4xl font-black tracking-[-0.05em]">{visibleOpenCount ?? "—"}{visibleOpenCount === null ? null : <span className="ml-1 text-xl">개</span>}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--muted)]">최신 일정과 마감 전 남은 자리를 API에서 확인해요.</p>
          </div>
        </section>

        <PurposeJourney className="relative -mt-3 mx-3 sm:mx-6" currentStep="activity" />

        <section className="mt-11" aria-labelledby="find-event-heading">
          <div className="flex items-center gap-2">
            <SlidersHorizontal aria-hidden="true" className="text-[var(--primary)]" size={24} />
            <h2 className="section-title" id="find-event-heading">조건에 맞게 찾기</h2>
          </div>

          <form action="/events" className="panel mt-5 p-4 sm:p-5" method="get" role="search">
            <input name="view" type="hidden" value={selectedView} />
            {selectedCategory !== "all" ? <input name="category" type="hidden" value={selectedCategory} /> : null}
            <label className="form-label" htmlFor="event-search">모임 이름 또는 장소</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={22} />
                <input className="form-input pl-12" defaultValue={searchTerm} id="event-search" maxLength={80} minLength={2} name="q" placeholder="예: 둘레길, 마포구, 클래식" type="search" />
              </div>
              <button className="button-primary shrink-0 px-7" type="submit">모임 찾기</button>
            </div>
          </form>

          <div className="mt-5">
            <p className="mb-3 text-sm font-black text-[var(--muted)]">모임 상태</p>
            <nav aria-label="모임 상태 선택" className="flex gap-2 overflow-x-auto pb-2">
              {VIEW_OPTIONS.map(({ id, label, icon: Icon }) => {
                const isActive = selectedView === id;
                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-14 shrink-0 items-center gap-2 rounded-xl border-2 px-4 font-black no-underline ${isActive ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--primary)]"}`}
                    href={{ pathname: "/events", query: { ...(selectedCategory !== "all" ? { category: selectedCategory } : {}), ...(searchTerm ? { q: searchTerm } : {}), view: id } }}
                    key={id}
                  >
                    <Icon aria-hidden="true" size={21} /> {label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="mt-5">
            <p className="mb-3 text-sm font-black text-[var(--muted)]">관심 테마</p>
            <nav aria-label="관심 테마 선택" className="flex gap-2 overflow-x-auto pb-2">
              <Link
                aria-current={selectedCategory === "all" ? "page" : undefined}
                className={`flex min-h-13 shrink-0 items-center rounded-full border-2 px-5 font-black no-underline ${selectedCategory === "all" ? "border-[var(--primary)] bg-[var(--sky-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] bg-white hover:border-[var(--primary)]"}`}
                href={{ pathname: "/events", query: { view: selectedView, ...(searchTerm ? { q: searchTerm } : {}) } }}
              >
                전체
              </Link>
              {INTERESTS.map((interest) => {
                const isActive = selectedCategory === interest.id;
                return (
                  <Link
                    aria-current={isActive ? "page" : undefined}
                    className={`flex min-h-13 shrink-0 items-center gap-2 rounded-full border-2 px-5 font-black no-underline ${isActive ? "border-[var(--primary)] bg-[var(--sky-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] bg-white hover:border-[var(--primary)]"}`}
                    href={{ pathname: "/events", query: { category: interest.id, view: selectedView, ...(searchTerm ? { q: searchTerm } : {}) } }}
                    key={interest.id}
                  >
                    <span aria-hidden="true">{interest.emoji}</span>{interest.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        </section>

        <section className="mt-11" aria-labelledby="event-results-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">찾은 모임</p>
              <h2 className="section-title" id="event-results-heading">{resultDescription || VIEW_OPTIONS.find((option) => option.id === selectedView)?.label} <span className="text-[var(--accent)]">{events.length}개 표시</span></h2>
            </div>
            {(searchTerm || selectedCategory !== "all" || selectedView !== "open") ? (
              <Link className="button-quiet" href="/events"><RotateCcw aria-hidden="true" size={20} /> 조건 모두 지우기</Link>
            ) : null}
          </div>

          {!isSearchValid ? (
            <div className="panel mt-6 px-6 py-12 text-center">
              <Search aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">검색어는 2~80자로 입력해 주세요</h3>
              <p className="mt-2 text-[var(--muted)]">적당한 길이의 검색어가 더 정확하고 빠른 결과를 만들어요.</p>
            </div>
          ) : hasInvalidCursor ? (
            <div className="panel mt-6 px-6 py-12 text-center">
              <RotateCcw aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">모임 목록 위치가 올바르지 않아요</h3>
              <p className="mt-2 text-[var(--muted)]">첫 목록부터 다시 확인해 주세요.</p>
              <Link className="button-primary mt-6" href="/events">첫 모임 목록 보기</Link>
            </div>
          ) : !catalog ? (
            <div className="panel mt-6 px-6 py-12 text-center" role="status">
              <CalendarClock aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">모임 목록을 잠시 불러오지 못했어요</h3>
              <p className="mt-2 text-[var(--muted)]">잘못된 예시 일정은 보여드리지 않습니다. 잠시 뒤 다시 확인해 주세요.</p>
            </div>
          ) : events.length ? (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {events.map((event, index) => <EventCard event={event} key={event.id} priority={index === 0} />)}
            </div>
          ) : (
            <div className="panel mt-6 px-6 py-12 text-center">
              <Search aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">조건에 맞는 모임이 아직 없어요</h3>
              <p className="mt-2 text-[var(--muted)]">검색어를 줄이거나 다른 관심 테마를 골라보세요.</p>
              <Link className="button-primary mt-6" href="/events"><RotateCcw aria-hidden="true" size={20} /> 전체 모임 다시 보기</Link>
            </div>
          )}
          {catalog?.hasNextPage && catalog.nextCursor ? (
            <div className="mt-6 flex justify-center">
              <Link
                className="button-secondary"
                href={{
                  pathname: "/events",
                  query: {
                    view: selectedView,
                    ...(selectedCategory !== "all" ? { category: selectedCategory } : {}),
                    ...(searchTerm ? { q: searchTerm } : {}),
                    cursor: catalog.nextCursor,
                  },
                }}
                rel="next"
              >
                다음 모임 보기
                <span aria-hidden="true">→</span>
              </Link>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
