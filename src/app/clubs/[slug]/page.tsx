import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarHeart,
  ChevronRight,
  MapPin,
  MessagesSquare,
  NotebookPen,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { PurposeJourney } from "@/components/purpose-journey";
import { JsonLd } from "@/components/json-ld";
import {
  getPublicClub,
} from "@/lib/clubs/server";
import { INTERESTS } from "@/lib/data";
import {
  createClubBreadcrumbJsonLd,
  createClubPageJsonLd,
  createNoIndexPageMetadata,
  createPublicPageMetadata,
} from "@/lib/seo";

type ClubPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamicParams = true;
// Next.js requires this route segment value to be statically analyzable.
export const revalidate = 120;

function interestEmoji(slug: string) {
  return INTERESTS.find((interest) => interest.id === slug)?.emoji ?? "✦";
}

export async function generateMetadata({ params }: ClubPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const club = await getPublicClub(slug);
    return club
      ? createPublicPageMetadata({
          title: club.title,
          description: [club.region, club.interest.name, club.description]
            .filter(Boolean)
            .join(" · "),
          path: `/clubs/${club.slug}`,
          image: club.image,
        })
      : createNoIndexPageMetadata({
          title: "커뮤니티를 찾을 수 없습니다",
          description: "요청한 공개 커뮤니티를 찾을 수 없습니다.",
        });
  } catch {
    return createNoIndexPageMetadata({
      title: "커뮤니티 정보를 확인하고 있습니다",
      description: "공개 커뮤니티 정보를 잠시 불러오지 못했습니다.",
    });
  }
}

export default async function ClubDetailPage({ params }: ClubPageProps) {
  const { slug } = await params;
  let club: Awaited<ReturnType<typeof getPublicClub>>;
  try {
    club = await getPublicClub(slug);
  } catch {
    return (
      <div className="page-content">
        <div className="page-container">
          <Link className="mb-5 inline-flex items-center gap-2 font-black text-[var(--primary)] no-underline" href="/clubs">
            <ArrowLeft aria-hidden="true" size={21} /> 모든 커뮤니티
          </Link>
          <section className="panel px-6 py-14 text-center" role="status">
            <UsersRound aria-hidden="true" className="mx-auto text-[var(--sky)]" size={44} />
            <h1 className="mt-4 text-2xl font-black">커뮤니티 정보를 잠시 불러오지 못했어요</h1>
            <p className="mt-3 text-[var(--muted)]">예시 정보로 대신하지 않습니다. 잠시 뒤 다시 확인해 주세요.</p>
          </section>
        </div>
      </div>
    );
  }
  if (!club) notFound();

  const emoji = interestEmoji(club.interest.slug);
  return (
    <div className="page-content">
      <JsonLd data={createClubPageJsonLd(club)} />
      <JsonLd data={createClubBreadcrumbJsonLd(club)} />
      <div className="page-container">
        <Link className="mb-5 inline-flex items-center gap-2 font-black text-[var(--primary)] no-underline" href="/clubs">
          <ArrowLeft aria-hidden="true" size={21} /> 모든 커뮤니티
        </Link>

        <section className="grid overflow-hidden rounded-[2rem] bg-[var(--ink)] text-white lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center px-6 py-9 sm:px-10 lg:px-12 lg:py-14">
            <p className="mb-3 font-black text-[var(--sun)]"><span aria-hidden="true">{emoji} </span>{club.interest.name} 커뮤니티</p>
            <h1 className="page-title text-white">{club.title}</h1>
            <p className="mt-4 max-w-2xl text-lg font-semibold leading-relaxed text-white/75">{club.description}</p>
            {club.region ? <p className="mt-5 inline-flex items-center gap-2 font-bold text-white/75"><MapPin aria-hidden="true" size={20} /> {club.region}</p> : null}
            <dl className="mt-7 flex flex-wrap gap-x-7 gap-y-3 text-sm">
              <div className="flex items-center gap-2"><UsersRound aria-hidden="true" size={20} /><dt className="screen-reader-only">활성 회원</dt><dd><strong className="text-lg">{club.memberCount.toLocaleString("ko-KR")}</strong>명 활동 중</dd></div>
              <div className="flex items-center gap-2"><CalendarHeart aria-hidden="true" size={20} /><dt className="screen-reader-only">향후 공개 일정</dt><dd><strong className="text-lg">{club.upcomingEventCount}</strong>개 공개</dd></div>
              <div className="flex items-center gap-2"><ShieldCheck aria-hidden="true" size={20} /><dt className="screen-reader-only">리더</dt><dd>리더 <strong>{club.leaderName}</strong></dd></div>
            </dl>
          </div>
          <div className="relative min-h-72 lg:min-h-full">
            <Image
              alt={club.image ? `${club.title} 커뮤니티 대표 이미지` : "시니어클럽 공용 대표 이미지"}
              className="object-cover"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              src={club.image || "/images/club-senior-hero.jpg"}
              unoptimized={Boolean(club.image?.startsWith("https://"))}
            />
            <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-[var(--ink)]/30 to-transparent lg:bg-gradient-to-r" />
          </div>
        </section>

        <PurposeJourney className="relative -mt-3 mx-3 sm:mx-6" currentStep="people" />

        <nav aria-label="커뮤니티 안에서 바로가기" className="mt-10 flex gap-2 overflow-x-auto border-b border-[var(--line)] pb-3">
          <a className="button-secondary shrink-0" href="#about">커뮤니티 소개</a>
          <a className="button-quiet shrink-0" href="#events">다가오는 모임</a>
          <a className="button-quiet shrink-0" href="#activity">게시판</a>
        </nav>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1fr_20rem]" id="about">
          <div className="panel p-6 sm:p-8">
            <p className="eyebrow">공개 커뮤니티 소개</p>
            <h2 className="section-title">{club.title}</h2>
            <p className="supporting-copy mt-4">{club.description}</p>
            <dl className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="font-black text-[var(--primary)]">관심 테마</dt><dd className="text-sm text-[var(--muted)]">{club.interest.name}</dd></div>
              <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="font-black text-[var(--primary)]">지난 공개 모임</dt><dd className="text-sm text-[var(--muted)]">{club.pastEventCount}개</dd></div>
              <div className="rounded-xl bg-[var(--canvas)] p-4"><dt className="font-black text-[var(--primary)]">운영 리더</dt><dd className="text-sm text-[var(--muted)]">{club.leaderName}</dd></div>
            </dl>
          </div>
          <aside className="rounded-[1.4rem] bg-[var(--accent-soft)] p-6">
            <ShieldCheck aria-hidden="true" className="text-[var(--accent)]" size={34} />
            <h2 className="mt-3 text-xl font-black">처음 오셨나요?</h2>
            <p className="mt-2 text-[0.95rem] font-semibold leading-relaxed text-[var(--muted)]">공개된 일정과 준비물을 먼저 확인하고 내게 맞는 모임에 신청해 보세요.</p>
            <a className="button-secondary mt-5 w-full" href="#events">다음 모임 확인 <ChevronRight aria-hidden="true" size={20} /></a>
          </aside>
        </section>

        <section className="mt-12" id="events" aria-labelledby="club-events-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="eyebrow">활동에서 만나요</p><h2 className="section-title" id="club-events-heading">다가오는 공개 모임</h2></div>
            <Link className="inline-flex items-center gap-1 font-black text-[var(--primary)] no-underline" href={`/events?category=${club.interest.slug}`}>이 테마 모임 모두 보기 <ChevronRight aria-hidden="true" size={20} /></Link>
          </div>
          {club.nextEvent ? (
            <article className="panel mt-6 flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-[var(--primary)]">가장 가까운 공개 일정</p>
                <h3 className="mt-1 text-xl font-black">{club.nextEvent.title}</h3>
                <p className="mt-2 font-semibold text-[var(--muted)]">{club.nextEvent.dateLabel} · {club.nextEvent.locationName}</p>
              </div>
              <Link className="button-primary shrink-0" href={`/events/${club.nextEvent.id}`}>모임 자세히 보기 <ChevronRight aria-hidden="true" size={20} /></Link>
            </article>
          ) : (
            <div className="panel mt-6 p-7 text-center"><CalendarHeart aria-hidden="true" className="mx-auto text-[var(--sky)]" size={38} /><h3 className="mt-3 text-xl font-black">안내 중인 다음 모임이 없습니다</h3><p className="mt-2 text-[var(--muted)]">새 일정이 공개되면 모임 목록에서 확인할 수 있어요.</p><Link className="button-primary mt-5" href={`/events?category=${club.interest.slug}`}>이 테마 모임 보기</Link></div>
          )}
        </section>

        <section className="mt-12" id="activity" aria-labelledby="community-activity-heading">
          <div><p className="eyebrow">활동 전후의 대화</p><h2 className="section-title" id="community-activity-heading">공개 게시판과 참여자 채팅</h2></div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Link className="panel p-5 no-underline transition hover:-translate-y-1 hover:shadow-[var(--shadow)]" href={`/clubs/${club.slug}/posts`}><NotebookPen aria-hidden="true" className="text-[var(--primary)]" size={28} /><h3 className="mt-3 text-lg font-black">공개 게시판</h3><p className="mt-1 text-sm font-semibold text-[var(--muted)]">실제 회원이 남긴 질문과 경험을 읽고 나눠보세요.</p></Link>
            <Link className="panel p-5 no-underline transition hover:-translate-y-1 hover:shadow-[var(--shadow)]" href="/chat"><MessagesSquare aria-hidden="true" className="text-[var(--primary)]" size={28} /><h3 className="mt-3 text-lg font-black">참여자 채팅</h3><p className="mt-1 text-sm font-semibold text-[var(--muted)]">로그인 후 참여가 승인된 모임의 대화를 확인하세요.</p></Link>
          </div>
        </section>
      </div>
    </div>
  );
}
