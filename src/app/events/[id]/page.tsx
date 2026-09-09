import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  CalendarDays,
  Check,
  Clock3,
  Gauge,
  MapPin,
  MessageCircleMore,
  Navigation,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { EventApplication } from "@/components/event-application";
import { EventCard } from "@/components/event-card";
import { JsonLd } from "@/components/json-ld";
import { PurposeJourney } from "@/components/purpose-journey";
import { INTERESTS } from "@/lib/data";
import {
  getEffectiveEventStatus,
  isEventRegistrationOpen,
  isUpcomingEvent,
} from "@/lib/event-status";
import {
  getPublicEvent,
  getPublicEventCatalog,
} from "@/lib/events/server";
import {
  createEventBreadcrumbJsonLd,
  createEventJsonLd,
  createPublicPageMetadata,
  truncateMetadataDescription,
} from "@/lib/seo";
import type { Event } from "@/lib/types";

type EventDetailPageProps = {
  params: Promise<{ id: string }>;
};

export const dynamicParams = true;
export const revalidate = 120;

function formatTime(iso: string | undefined) {
  if (!iso) return null;
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Seoul",
  }).format(new Date(iso));
}

function formatPrice(price: number) {
  return price === 0 ? "무료" : `${price.toLocaleString("ko-KR")}원`;
}

export async function generateMetadata({ params }: EventDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  let event: Awaited<ReturnType<typeof getPublicEvent>> = null;
  try {
    event = await getPublicEvent(id);
  } catch {
    return {
      title: "모임 정보를 확인하고 있습니다",
      robots: { index: false, follow: false },
    };
  }
  return event
    ? createPublicPageMetadata({
        title: event.title,
        description: truncateMetadataDescription(
          `${event.region} ${event.district}에서 ${event.date}에 열리는 ${event.difficulty} 난이도 시니어 모임입니다. ${event.description}`,
        ),
        path: `/events/${event.id}`,
        image: event.image,
      })
    : {
        title: "모임을 찾을 수 없습니다",
        robots: { index: false, follow: false },
      };
}

export default async function EventDetailPage({ params }: EventDetailPageProps) {
  const { id } = await params;
  const event = await getPublicEvent(id);
  if (!event) notFound();

  const interest = INTERESTS.find((item) => item.id === event.category);
  const participantCount = event.participantCount ?? event.currentMembers ?? 0;
  const now = new Date();
  const effectiveStatus = getEffectiveEventStatus(event, now);
  const isClosed = !isEventRegistrationOpen(event, now);
  let relatedEvents: Event[] = [];
  try {
    const relatedCatalog = await getPublicEventCatalog({
      view: "upcoming",
      category: event.category,
      limit: 4,
    });
    relatedEvents = relatedCatalog.events
      .filter((item) => item.id !== event.id && isUpcomingEvent(item, now))
      .slice(0, 3);
  } catch {
    relatedEvents = [];
  }

  return (
    <div className="page-content">
      <JsonLd data={createEventJsonLd(event, undefined, now)} />
      <JsonLd data={createEventBreadcrumbJsonLd(event)} />
      <div className="page-container">
        <nav aria-label="모임 상세 경로" className="mb-5 flex flex-wrap items-center gap-2 text-sm font-black text-[var(--muted)]">
          <Link className="inline-flex items-center gap-2 text-[var(--primary)] no-underline" href="/events"><ArrowLeft aria-hidden="true" size={20} /> 전체 모임</Link>
          <span aria-hidden="true">/</span>
          {event.clubSlug ? <Link className="no-underline hover:text-[var(--primary)]" href={`/clubs/${event.clubSlug}`}>{event.clubTitle ?? interest?.label ?? "커뮤니티"}</Link> : <span>{interest?.label}</span>}
        </nav>

        <section className="overflow-hidden rounded-[2rem] bg-[var(--ink)] text-white">
          <div className="relative aspect-[16/8] min-h-72 overflow-hidden sm:aspect-[16/7]">
            <Image alt={`${event.title} 모임의 활동 모습`} className="object-cover" fill priority sizes="(max-width: 1180px) 100vw, 1180px" src={event.image || "/images/club-senior-hero.jpg"} unoptimized={Boolean(event.image?.startsWith("https://"))} />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--ink)] via-[var(--ink)]/20 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9 lg:p-12">
              <div className="mb-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-white px-3 py-1 text-sm font-black text-[var(--primary-strong)]"><span aria-hidden="true">{interest?.emoji} </span>{interest?.label ?? event.category}</span>
                <span className={`rounded-full px-3 py-1 text-sm font-black ${isClosed ? "bg-white/15 text-white" : "bg-[var(--accent)] text-white"}`}>{isClosed ? (effectiveStatus === "completed" ? "종료된 모임" : effectiveStatus === "cancelled" ? "취소된 모임" : "신청 마감") : "신청 가능"}</span>
              </div>
              <h1 className="max-w-4xl text-[clamp(2rem,5vw,4rem)] font-black leading-[1.08] tracking-[-0.055em] text-white">{event.title}</h1>
            </div>
          </div>
        </section>

        <PurposeJourney className="relative -mt-3 mx-3 sm:mx-6" currentStep="activity" />

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            <section className="panel p-6 sm:p-8" aria-labelledby="event-overview-heading">
              <p className="eyebrow">모임 안내</p>
              <h2 className="section-title" id="event-overview-heading">이런 시간을 함께 보내요</h2>
              <p className="mt-4 text-lg leading-relaxed text-[var(--muted)]">{event.description}</p>

              <dl className="mt-7 grid gap-3 sm:grid-cols-2">
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4"><CalendarDays aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div><dt className="text-sm font-black text-[var(--muted)]">날짜</dt><dd className="mt-0.5 font-black">{event.date}</dd></div></div>
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4"><Clock3 aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div><dt className="text-sm font-black text-[var(--muted)]">시간</dt><dd className="mt-0.5 font-black">{formatTime(event.startAt)}{event.endAt ? ` ~ ${formatTime(event.endAt)}` : " · 종료 시간은 리더 안내 확인"}</dd></div></div>
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4 sm:col-span-2"><MapPin aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div className="min-w-0"><dt className="text-sm font-black text-[var(--muted)]">만나는 곳</dt><dd className="mt-0.5 font-black">{event.location}</dd><dd className="mt-0.5 text-sm font-semibold text-[var(--muted)]">{event.address}</dd><a className="mt-2 inline-flex items-center gap-1 font-black text-[var(--primary)]" href={event.mapUrl ?? `https://map.naver.com/p/search/${encodeURIComponent(event.address)}`} rel="noreferrer" target="_blank">지도에서 길 찾기 <Navigation aria-hidden="true" size={18} /></a></div></div>
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4"><UsersRound aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div><dt className="text-sm font-black text-[var(--muted)]">참여 인원</dt><dd className="mt-0.5 font-black">{participantCount}명 참여 · 정원 {event.capacity}명</dd></div></div>
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4"><Banknote aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div><dt className="text-sm font-black text-[var(--muted)]">참가비</dt><dd className="mt-0.5 font-black">{formatPrice(event.price)}</dd>{event.price > 0 ? <dd className="mt-1 text-sm font-semibold text-[var(--muted)]">현장에서 리더 안내에 따라 냅니다. 앱 안 Google Play 결제가 아닙니다.</dd> : null}</div></div>
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4"><Gauge aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div><dt className="text-sm font-black text-[var(--muted)]">활동 난이도</dt><dd className="mt-0.5 font-black">{event.difficulty}</dd></div></div>
                <div className="flex gap-3 rounded-xl bg-[var(--canvas)] p-4"><ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={25} /><div><dt className="text-sm font-black text-[var(--muted)]">진행 리더</dt><dd className="mt-0.5 font-black">{event.leaderName}</dd></div></div>
              </dl>
            </section>

            <section className="mt-6 grid gap-6 sm:grid-cols-2">
              <div className="panel p-6">
                <p className="eyebrow">출발 전 확인</p>
                <h2 className="text-xl font-black tracking-[-0.035em]">준비물</h2>
                {event.preparations.length ? <ul className="mt-4 grid gap-3">
                  {event.preparations.map((item) => <li className="flex items-start gap-3 font-bold" key={item}><span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-[var(--sky-soft)] text-[var(--primary)]"><Check size={16} strokeWidth={3} /></span>{item}</li>)}
                </ul> : <p className="mt-4 font-semibold text-[var(--muted)]">등록된 준비물이 없습니다. 모임 상세와 운영진의 최신 안내를 확인해 주세요.</p>}
              </div>
              <div className="rounded-[1.4rem] bg-[var(--accent-soft)] p-6">
                <ShieldCheck aria-hidden="true" className="text-[var(--accent)]" size={34} />
                <h2 className="mt-3 text-xl font-black tracking-[-0.035em]">안전하게 함께해요</h2>
                <p className="mt-3 text-[0.95rem] font-semibold leading-relaxed text-[var(--muted)]">몸 상태에 맞는 난이도인지 확인해 주세요. 신청 전 화면에 표시된 일정·장소·준비물을 다시 살펴보세요.</p>
              </div>
            </section>

            {event.clubSlug ? (
              <section className="panel mt-6 flex flex-col items-start gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="eyebrow">이 모임이 속한 곳</p><h2 className="text-xl font-black">{event.clubTitle ?? interest?.label ?? "커뮤니티"}</h2><p className="mt-1 text-sm font-semibold text-[var(--muted)]">같은 관심사의 활동과 안내를 확인할 수 있어요.</p></div>
                <Link className="button-secondary shrink-0" href={`/clubs/${event.clubSlug}`}><MessageCircleMore aria-hidden="true" size={21} /> 커뮤니티 둘러보기</Link>
              </section>
            ) : null}
          </div>

          <aside className="self-start lg:sticky lg:top-24" aria-label="모임 참여 신청">
            <EventApplication eventId={event.id} eventTitle={event.title} capacity={event.capacity} participantCount={participantCount} isClosed={isClosed} />
          </aside>
        </div>

        {relatedEvents.length ? (
          <section className="mt-14" aria-labelledby="related-events-heading">
            <div><p className="eyebrow">다음 약속도 살펴보세요</p><h2 className="section-title" id="related-events-heading">비슷한 모임</h2></div>
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{relatedEvents.map((item) => <EventCard event={item} key={item.id} />)}</div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
