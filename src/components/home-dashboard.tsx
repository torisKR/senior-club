"use client";

import {
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleUserRound,
  Landmark,
  MapPin,
  Mountain,
  Music2,
  Sparkles,
  Sprout,
  TrainFront,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";

import { INTERESTS, getInterestLabel } from "@/lib/data";
import { isEventRegistrationOpen } from "@/lib/event-status";
import { HOME_FEATURED_EVENT_STYLES } from "@/lib/home-featured-events";
import {
  PROFILE_CACHE_CHANGE_EVENT,
  PROFILE_STORAGE_KEY,
} from "@/lib/profile-cache";
import type { Event, InterestId } from "@/lib/types";
import type { PublicClub } from "@/lib/clubs/server";

type HomeEvent = {
  id: string;
  title: string;
  theme: string;
  date: string;
  location: string;
  seats: number;
  image: string;
  alt: string;
  accent: string;
};

const knownInterestIds = new Set<string>(INTERESTS.map((interest) => interest.id));

type HomeProfile = {
  name: string;
  region: string;
  ageGroup: string;
  interests: string[];
};

const themeStyles = {
  hiking: { icon: Mountain, color: "#dcebdd" },
  photo: { icon: Camera, color: "#d9eef5" },
  history: { icon: Landmark, color: "#f6e7c9" },
  "rail-travel": { icon: TrainFront, color: "#e2e7f3" },
  classical: { icon: Music2, color: "#f4e0dc" },
  gardening: { icon: Sprout, color: "#dff0e5" },
} as const;

export function getHomeEventPreviews(featuredEvents: readonly Event[]): HomeEvent[] {
  return HOME_FEATURED_EVENT_STYLES.flatMap((style) => {
    const event = featuredEvents.find(
      (candidate) => candidate.category === style.category,
    );
    if (!event) return [];

    const themeIds: InterestId[] = [style.category];
    if ("relatedTheme" in style && style.relatedTheme) {
      themeIds.push(style.relatedTheme);
    }

    return [
      {
        id: event.id,
        title: event.title,
        theme: themeIds.map(getInterestLabel).join(" · "),
        date: `${event.date} · ${formatEventStartTime(event.startAt)}`,
        location: event.location,
        seats: Math.max(0, event.capacity - event.participantCount),
        image: event.image ?? style.fallbackImage,
        alt: `${event.location}에서 진행하는 ${event.title} 모임`,
        accent: style.accent,
      },
    ];
  });
}

export function getHomeThemeCards(
  catalogClubs: ReadonlyArray<
    Pick<PublicClub, "slug" | "title" | "interest">
  >,
) {
  return catalogClubs.slice(0, 6).map((club) => {
    const style =
      themeStyles[club.interest.slug as keyof typeof themeStyles] ?? {
        icon: Sparkles,
        color: "#e5ece9",
      };
    return {
      ...style,
      slug: club.slug,
      label: club.title,
      interestName: club.interest.name,
    };
  });
}

function formatEventStartTime(startAt: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(startAt);
  if (!match) return "시간 확인 필요";

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  const period = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 || 12;
  return `${period} ${hour12}시${minute === 0 ? "" : ` ${minute}분`}`;
}

export function parseHomeProfile(storedProfile: string | null | undefined): HomeProfile | null {
  if (!storedProfile) return null;

  try {
    const value = JSON.parse(storedProfile) as Partial<HomeProfile>;
    if (
      typeof value.name !== "string" ||
      typeof value.region !== "string" ||
      typeof value.ageGroup !== "string" ||
      !Array.isArray(value.interests)
    ) {
      return null;
    }

    const region = value.region.trim();
    const ageGroup = value.ageGroup.trim();
    if (!region || !ageGroup) return null;

    return {
      name: value.name.trim() || "클럽 멤버",
      region,
      ageGroup,
      interests: value.interests.filter(
        (interest): interest is string =>
          typeof interest === "string" && knownInterestIds.has(interest),
      ),
    };
  } catch {
    return null;
  }
}

function subscribeToProfile(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(PROFILE_CACHE_CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(PROFILE_CACHE_CHANGE_EVENT, onStoreChange);
  };
}

function getStoredProfile() {
  try {
    return window.localStorage.getItem(PROFILE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function getServerProfile(): undefined {
  return undefined;
}

function EventPreview({ event }: { event: HomeEvent }) {
  return (
    <article className="group overflow-hidden rounded-[1.35rem] border border-[var(--line)] bg-[var(--surface)] shadow-[0_10px_35px_rgba(20,52,46,0.06)]">
      <Link
        className="block rounded-[1.35rem] no-underline focus-visible:outline-offset-[-4px]"
        href={`/events/${event.id}`}
        aria-label={`${event.title} 상세 보기`}
      >
        <div className="relative aspect-[16/10] overflow-hidden" style={{ background: event.accent }}>
          <Image
            src={event.image}
            alt={event.alt}
            fill
            sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.025]"
            unoptimized={event.image.startsWith("https://")}
          />
          <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[0.85rem] font-black text-[var(--primary-strong)] shadow-sm">
            {event.theme}
          </div>
        </div>
        <div className="p-5 sm:p-6">
          <h3 className="m-0 text-[1.25rem] font-black leading-[1.4] tracking-[-0.03em]">{event.title}</h3>
          <dl className="mt-4 grid gap-2 text-[0.92rem] text-[var(--muted)]">
            <div className="flex gap-2">
              <CalendarDays aria-hidden="true" className="mt-1 shrink-0 text-[var(--primary)]" size={19} strokeWidth={2.3} />
              <dt className="screen-reader-only">일시</dt>
              <dd>{event.date}</dd>
            </div>
            <div className="flex gap-2">
              <MapPin aria-hidden="true" className="mt-1 shrink-0 text-[var(--primary)]" size={19} strokeWidth={2.3} />
              <dt className="screen-reader-only">장소</dt>
              <dd>{event.location}</dd>
            </div>
          </dl>
          <div className="mt-5 flex items-center justify-between border-t border-[var(--line)] pt-4">
            <span className="font-extrabold text-[var(--warning)]">남은 자리 {event.seats}명</span>
            <span className="inline-flex items-center gap-1 font-black text-[var(--primary)]">
              자세히 <ChevronRight aria-hidden="true" size={20} />
            </span>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function HomeDashboard({
  catalogClubs,
  catalogEvents,
  featuredCatalogEvents,
}: {
  catalogClubs: readonly PublicClub[] | null;
  catalogEvents: readonly Event[] | null;
  featuredCatalogEvents: readonly Event[] | null;
}) {
  const [activeFilter, setActiveFilter] = useState("모두");
  const events = useMemo(
    () => getHomeEventPreviews(featuredCatalogEvents ?? []),
    [featuredCatalogEvents],
  );
  const filters = useMemo(
    () => ["모두", ...events.map((event) => event.theme)],
    [events],
  );
  const recruitingEventCount = catalogEvents?.filter(
    (event) => isEventRegistrationOpen(event),
  ).length;
  const storedProfile = useSyncExternalStore(
    subscribeToProfile,
    getStoredProfile,
    getServerProfile,
  );
  const profile = useMemo(
    () => parseHomeProfile(storedProfile),
    [storedProfile],
  );
  const interestLabels = useMemo(
    () => (profile?.interests ?? []).map(getInterestLabel).filter(Boolean),
    [profile],
  );
  const memberLabel =
    !profile || profile.name === "클럽 멤버" ? "회원님" : `${profile.name} 님`;
  const recommendationContext = profile
    ? [
        profile.region,
        profile.ageGroup,
        interestLabels.length > 0 ? `${interestLabels.join("·")} 관심사` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "공개된 최신 일정";
  const visibleEvents = useMemo(
    () => (activeFilter === "모두" ? events : events.filter((event) => event.theme === activeFilter)),
    [activeFilter, events],
  );
  const themes = useMemo(
    () => getHomeThemeCards(catalogClubs ?? []),
    [catalogClubs],
  );

  return (
    <>
      <section className="page-container grid gap-5 pb-10 pt-5 lg:grid-cols-[1.02fr_0.98fr] lg:items-stretch lg:pb-16 lg:pt-8">
        <div className="relative z-10 flex min-h-[31rem] flex-col justify-center overflow-hidden rounded-[1.8rem] bg-[var(--ink)] px-6 py-9 text-white sm:px-10 lg:px-12">
          <div aria-hidden="true" className="absolute -right-20 -top-24 h-72 w-72 rounded-full border-[42px] border-[var(--sky)]/25" />
          <p className="eyebrow !text-[#a9dbea]" aria-live="polite">
            <Sparkles aria-hidden="true" size={19} /> {memberLabel} · 저장한 정보: {recommendationContext}
          </p>
          <h1 className="display-title relative max-w-[11ch]">오늘 들어오면, 다음 약속이 생깁니다.</h1>
          <p className="relative mb-0 mt-6 max-w-[34rem] text-[1.08rem] leading-[1.75] text-[#d9e7e3] sm:text-[1.18rem]">
            좋아하는 일을 함께할 사람을 만나세요. 모임이 끝난 뒤에도 대화와 다음 활동은 자연스럽게 이어집니다.
          </p>
          <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
            <Link className="button-primary !border-[#f0bf4f] !bg-[#f0bf4f] !text-[var(--ink)] hover:!border-[#f5cf72] hover:!bg-[#f5cf72]" href="/events">
              내 모임 찾아보기 <ArrowRight aria-hidden="true" size={22} />
            </Link>
            <Link className="button-secondary !border-white/70 !bg-transparent !text-white hover:!bg-white/10" href="/onboarding">
              관심사 다시 고르기
            </Link>
          </div>
          <p className="relative mb-0 mt-6 flex items-center gap-2 text-[0.9rem] text-[#c0d3cd]">
            <Check aria-hidden="true" size={20} /> 지금 확인된 신청 가능 모임 {recruitingEventCount ?? "—"}{recruitingEventCount === undefined ? "" : "개"}
          </p>
        </div>

        <figure className="relative m-0 min-h-[16rem] overflow-hidden rounded-[1.8rem] bg-[var(--sky-soft)] sm:min-h-[20rem] lg:min-h-[26rem]">
          <Image
            src="/images/club-senior-hero.jpg"
            alt="서울 산책길에서 지도를 함께 보며 다음 활동을 계획하는 시니어 다섯 명"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="object-cover"
          />
          <figcaption className="absolute bottom-3 right-3 max-w-[calc(100%-1.5rem)] rounded-2xl bg-white/95 px-3.5 py-2.5 text-[0.82rem] font-bold leading-relaxed text-[var(--ink)] shadow-lg backdrop-blur sm:bottom-4 sm:right-4 sm:max-w-[17rem] sm:px-4 sm:py-3 sm:text-[0.86rem]">
            관심사와 지역에 맞는 공개 모임을 확인하고, 로그인 후 안전하게 신청할 수 있어요.
          </figcaption>
        </figure>
      </section>

      <section aria-labelledby="journey-title" className="border-y border-[var(--line)] bg-white/65 py-14 sm:py-18">
        <div className="page-container">
          <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-center">
            <div>
              <p className="eyebrow">시니어클럽이 다른 이유</p>
              <h2 id="journey-title" className="page-title">한 번의 활동을<br />다음 관계로 잇습니다.</h2>
              <p className="supporting-copy mb-0 mt-4">
                모임을 찾는 순간부터 후기를 나누고 다시 만날 때까지, 지금 단계와 다음 할 일을 한눈에 보여드려요.
              </p>
            </div>
            <ol className="relative m-0 grid list-none grid-cols-5 gap-1 p-0" aria-label="시니어클럽 활동 흐름">
              {[
                ["관심", "좋아하는 것"],
                ["신청", "자리 고르기"],
                ["만남", "함께 활동"],
                ["후기", "기억 나누기"],
                ["다음 약속", "관계 이어가기"],
              ].map(([title, description], index) => (
                <li key={title} className="relative flex min-w-0 flex-col items-center text-center">
                  {index < 4 ? <span aria-hidden="true" className="absolute left-[55%] right-[-45%] top-6 h-[3px] bg-[var(--line)]" /> : null}
                  <span className={`relative z-10 grid h-12 w-12 place-items-center rounded-full border-[3px] font-black ${index < 3 ? "border-[var(--primary)] bg-[var(--primary)] text-white" : index === 3 ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--warning)]" : "border-[var(--line)] bg-white text-[var(--muted)]"}`}>
                    {index < 3 ? <Check aria-hidden="true" size={22} /> : index + 1}
                  </span>
                  <strong className="mt-3 text-[0.92rem] leading-tight sm:text-base">{title}</strong>
                  <span className="mt-1 hidden text-[0.78rem] leading-snug text-[var(--muted)] sm:block">{description}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section aria-labelledby="recommended-title" className="page-container py-16 sm:py-20">
        <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div>
            <p className="eyebrow" aria-live="polite">{memberLabel} · 공개된 최신 일정</p>
            <h2 id="recommended-title" className="page-title">다가오는 일정에서 무엇을 해볼까요?</h2>
          </div>
          <Link className="inline-flex min-h-12 items-center gap-1 self-start font-black text-[var(--primary)]" href="/events">
            전체 모임 보기 <ArrowRight aria-hidden="true" size={21} />
          </Link>
        </div>
        <div className="mt-7 flex gap-2 overflow-x-auto pb-2" aria-label="추천 모임 관심사 필터">
          {filters.map((filter) => (
            <button
              key={filter}
              type="button"
              className={`shrink-0 rounded-full border-2 px-5 py-2 font-extrabold ${activeFilter === filter ? "border-[var(--primary)] bg-[var(--primary)] text-white" : "border-[var(--line)] bg-white text-[var(--ink)]"}`}
              aria-pressed={activeFilter === filter}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
        <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3" aria-live="polite">
          {visibleEvents.map((event) => <EventPreview key={event.id} event={event} />)}
        </div>
        {!visibleEvents.length ? (
          <div className="panel mt-6 p-7 text-center">
            <p className="font-black">{catalogEvents === null ? "모임 목록을 잠시 불러오지 못했어요." : "현재 공개된 추천 모임이 없습니다."}</p>
            <p className="mt-2 text-sm font-semibold text-[var(--muted)]">예시 일정으로 대신하지 않고 최신 공개 데이터만 보여드립니다.</p>
          </div>
        ) : null}
      </section>

      <section aria-labelledby="themes-title" className="bg-[var(--ink)] py-16 text-white sm:py-20">
        <div className="page-container">
          <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
            <div>
              <p className="eyebrow !text-[#a9dbea]">관심 테마 둘러보기</p>
              <h2 id="themes-title" className="page-title max-w-[11ch]">좋아하는 일에서 대화가 시작됩니다.</h2>
              <p className="mt-4 max-w-md text-[#cadbd6]">실제 공개 커뮤니티에서 관심 있는 주제를 고르고 다음 일정을 확인해 보세요.</p>
            </div>
            <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 sm:grid-cols-3">
              {themes.map(({ interestName, label, slug, icon: Icon, color }) => (
                <li key={slug}>
                  <Link href={`/clubs/${slug}`} className="group flex min-h-[8.5rem] flex-col justify-between rounded-[1.2rem] border border-white/15 bg-white/[0.07] p-4 no-underline transition-colors hover:bg-white/[0.13]">
                    <span className="grid h-11 w-11 place-items-center rounded-full text-[var(--ink)]" style={{ background: color }}>
                      <Icon aria-hidden="true" size={23} strokeWidth={2.3} />
                    </span>
                    <span className="flex items-end justify-between gap-2">
                      <span>
                        <span className="block text-sm font-bold text-white/70">{interestName}</span>
                        <strong className="mt-1 block text-[1.08rem]">{label}</strong>
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {themes.length === 0 ? (
              <div className="rounded-2xl border border-white/20 bg-white/[0.07] p-5 text-[#cadbd6]" role="status">
                {catalogClubs === null
                  ? "커뮤니티 목록을 잠시 불러오지 못했어요."
                  : "현재 공개된 커뮤니티가 없습니다."}
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="page-container py-16 sm:py-20">
        <div className="grid overflow-hidden rounded-[1.65rem] border border-[var(--line)] bg-white lg:grid-cols-[0.9fr_1.1fr]">
          <div className="bg-[var(--accent-soft)] p-7 sm:p-10">
            <CircleUserRound aria-hidden="true" className="text-[var(--accent)]" size={42} strokeWidth={1.8} />
            <h2 className="m-0 mt-5 text-[1.35rem] font-extrabold leading-[1.6] tracking-[-0.025em]">
              처음 참여해도 일정과 준비물, 신청 상태를 한눈에 확인할 수 있어요.
            </h2>
            <p className="mb-0 mt-4 text-[0.9rem] font-bold text-[var(--muted)]">공개 모임 확인 → 로그인 → 신청 → 승인 알림 순서로 안내합니다.</p>
          </div>
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <p className="eyebrow">첫 모임이 걱정되시나요?</p>
            <h2 className="section-title">리더가 준비물부터 만나는 곳까지 차근차근 알려드려요.</h2>
            <ul className="mt-5 grid list-none gap-3 p-0 text-[0.96rem]">
              {["모임에 등록된 장소와 준비물을 확인할 수 있어요", "신청 상태는 로그인한 앱과 웹에서 확인할 수 있어요", "불편한 일이 생기면 운영진에게 신고할 수 있어요"].map((item) => (
                <li key={item} className="flex gap-2.5"><Check aria-hidden="true" className="mt-1 shrink-0 text-[var(--primary)]" size={21} /><span>{item}</span></li>
              ))}
            </ul>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link className="button-primary" href="/events">첫 모임 고르기</Link>
              <Link className="button-quiet" href="/clubs">커뮤니티 먼저 보기</Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
