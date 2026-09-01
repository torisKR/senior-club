import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  MapPin,
  UsersRound,
} from "lucide-react";

import {
  getEffectiveEventStatus,
  isEventRegistrationOpen,
} from "@/lib/event-status";
import type { Event } from "@/lib/types";

type EventCardProps = {
  event: Event;
  priority?: boolean;
};

const CATEGORY_NAMES: Record<string, string> = {
  hiking: "등산",
  photo: "사진",
  history: "역사",
  classical: "클래식",
  gardening: "원예",
  "rail-travel": "철도여행",
  food: "맛집",
  volunteer: "봉사",
  english: "영어",
  reading: "독서",
};

function formatPrice(price: number) {
  return price === 0 ? "참가비 없음" : `참가비 ${price.toLocaleString("ko-KR")}원`;
}

export function EventCard({ event, priority = false }: EventCardProps) {
  const joined = event.participantCount ?? event.currentMembers ?? 0;
  const remaining = Math.max(event.capacity - joined, 0);
  const progress = Math.min((joined / Math.max(event.capacity, 1)) * 100, 100);
  const effectiveStatus = getEffectiveEventStatus(event);
  const isClosed = !isEventRegistrationOpen(event);

  return (
    <article className="group panel flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow)] focus-within:shadow-[var(--shadow)]">
      <Link
        aria-label={`${event.title} 모임 자세히 보기`}
        className="relative block aspect-[16/10] overflow-hidden bg-[var(--canvas-deep)]"
        href={`/events/${event.id}`}
      >
        <Image
          alt={`${event.title} 모임의 활동 모습`}
          className="object-cover transition duration-500 group-hover:scale-[1.025]"
          fill
          priority={priority}
          sizes="(max-width: 720px) 100vw, (max-width: 1100px) 50vw, 380px"
          src={event.image || "/images/club-senior-hero.jpg"}
          unoptimized={Boolean(event.image?.startsWith("https://"))}
        />
        <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-sm font-black text-[var(--primary-strong)] shadow-sm">
          {CATEGORY_NAMES[event.category] ?? event.category}
        </span>
        {isClosed ? (
          <span className="absolute right-4 top-4 rounded-full bg-[var(--ink)]/90 px-3 py-1 text-sm font-black text-white">
            {effectiveStatus === "completed"
              ? "모임 종료"
              : effectiveStatus === "cancelled"
                ? "모임 취소"
                : "신청 마감"}
          </span>
        ) : remaining <= 3 ? (
          <span className="absolute right-4 top-4 rounded-full bg-[var(--accent)] px-3 py-1 text-sm font-black text-white">
            {remaining}자리 남음
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <p className="mb-2 flex items-center gap-2 text-[0.95rem] font-extrabold text-[var(--primary)]">
          <CalendarDays aria-hidden="true" size={19} />
          {event.date}
        </p>
        <h2 className="text-[1.28rem] font-black leading-snug tracking-[-0.035em]">
          <Link className="no-underline" href={`/events/${event.id}`}>
            {event.title}
          </Link>
        </h2>
        <p className="mt-2 line-clamp-2 text-[0.95rem] leading-relaxed text-[var(--muted)]">
          {event.description}
        </p>

        <dl className="mt-4 grid gap-2 text-[0.93rem] font-bold text-[var(--muted)]">
          <div className="flex items-start gap-2">
            <MapPin aria-hidden="true" className="mt-0.5 shrink-0" size={19} />
            <dt className="screen-reader-only">장소</dt>
            <dd>{event.location}</dd>
          </div>
          <div className="flex items-center gap-2">
            <UsersRound aria-hidden="true" className="shrink-0" size={19} />
            <dt className="screen-reader-only">참여 인원</dt>
            <dd>
              {joined}명 참여 · 정원 {event.capacity}명
            </dd>
          </div>
        </dl>

        <div className="mt-4" aria-label={`정원 ${event.capacity}명 중 ${joined}명 참여`}>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--canvas-deep)]">
            <div
              className="h-full rounded-full bg-[var(--sky)]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        <div className="mt-auto flex items-end justify-between gap-4 pt-5">
          <strong className="text-[0.98rem] font-black text-[var(--ink)]">
            {formatPrice(event.price)}
          </strong>
          <span className="inline-flex items-center gap-1 font-black text-[var(--primary)] transition group-hover:translate-x-0.5">
            자세히 보기
            <ArrowRight aria-hidden="true" size={20} />
          </span>
        </div>
      </div>
    </article>
  );
}
