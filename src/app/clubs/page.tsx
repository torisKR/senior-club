import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarHeart,
  CalendarX2,
  MapPin,
  MessageCircleMore,
  RotateCcw,
  Search,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { PurposeJourney } from "@/components/purpose-journey";
import { JsonLd } from "@/components/json-ld";
import { resolveCoverImage } from "@/lib/cover-image";
import {
  getPublicClubCatalog,
  isSafePublicClubCursor,
  isSafePublicClubSlug,
} from "@/lib/clubs/server";
import { INTERESTS } from "@/lib/data";
import {
  createClubListJsonLd,
  createPublicPageMetadata,
} from "@/lib/seo";

// Next.js requires this route segment value to be statically analyzable.
export const revalidate = 120;

const publicMetadata: Metadata = createPublicPageMetadata({
  title: "테마 커뮤니티",
  description:
    "등산, 사진, 역사, 클래식, 원예, 철도여행, 독서 등 관심사가 같은 시니어 커뮤니티와 공개 모임을 찾아보세요.",
  path: "/clubs",
});

type ClubsPageProps = {
  searchParams: Promise<{
    category?: string | string[];
    cursor?: string | string[];
    q?: string | string[];
  }>;
};

export async function generateMetadata({ searchParams }: ClubsPageProps): Promise<Metadata> {
  const query = await searchParams;
  const hasVariant = Object.values(query).some((value) => value !== undefined);
  return hasVariant
    ? {
        ...publicMetadata,
        robots: {
          index: false,
          follow: true,
          noarchive: true,
          noimageindex: true,
          nosnippet: true,
        },
      }
    : publicMetadata;
}

function singleValue(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function interestEmoji(slug: string) {
  return INTERESTS.find((interest) => interest.id === slug)?.emoji ?? "✦";
}

export default async function ClubsPage({ searchParams }: ClubsPageProps) {
  const query = await searchParams;
  const rawCategory = singleValue(query.category);
  const rawCursor = singleValue(query.cursor);
  const rawSearchTerm = singleValue(query.q);
  const category = rawCategory?.trim() ?? "";
  const searchTerm = rawSearchTerm?.trim().replace(/\s+/g, " ") ?? "";
  const hasInvalidCategory =
    query.category !== undefined &&
    (rawCategory === undefined ||
      (category.length > 0 && !isSafePublicClubSlug(category)));
  const hasInvalidCursor = query.cursor !== undefined && !isSafePublicClubCursor(rawCursor);
  const hasInvalidSearch =
    query.q !== undefined &&
    (rawSearchTerm === undefined ||
      (searchTerm.length > 0 &&
        (searchTerm.length < 2 || searchTerm.length > 80)));
  const hasInvalidQuery = hasInvalidCategory || hasInvalidCursor || hasInvalidSearch;

  let catalog: Awaited<ReturnType<typeof getPublicClubCatalog>> | null = null;
  if (!hasInvalidQuery) {
    try {
      catalog = await getPublicClubCatalog({
        limit: 12,
        ...(category ? { category } : {}),
        ...(searchTerm ? { q: searchTerm } : {}),
        ...(rawCursor ? { cursor: rawCursor } : {}),
      });
    } catch {
      catalog = null;
    }
  }

  const clubs = catalog?.clubs ?? [];

  return (
    <div className="page-content">
      {catalog && !category && !searchTerm && !rawCursor ? (
        <JsonLd data={createClubListJsonLd(clubs)} />
      ) : null}
      <div className="page-container">
        <section className="relative overflow-hidden rounded-[2rem] bg-[var(--ink)] px-6 py-9 text-white sm:px-10 sm:py-12 lg:px-14">
          <div aria-hidden="true" className="absolute -right-16 -top-16 size-64 rounded-full border-[3rem] border-white/5" />
          <div className="relative max-w-3xl">
            <p className="mb-3 inline-flex items-center gap-2 font-black text-[var(--sun)]">
              <Sparkles aria-hidden="true" size={21} />
              관심에서 시작하는 인연
            </p>
            <h1 className="page-title text-white">좋아하는 이야기가 같으면, 첫 만남도 편안해집니다</h1>
            <p className="mt-4 max-w-2xl text-lg font-semibold leading-relaxed text-white/75">
              공개된 커뮤니티를 살펴보고, 마음에 드는 활동의 실제 일정을 확인해 보세요.
            </p>
          </div>
        </section>

        <PurposeJourney className="relative -mt-3 mx-3 sm:mx-6" currentStep="people" />

        <section className="mt-12" aria-labelledby="interest-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">테마 찾기</p>
              <h2 className="section-title" id="interest-heading">어떤 이야기를 좋아하세요?</h2>
            </div>
            <p className="text-sm font-bold text-[var(--muted)]">테마를 선택하면 공개 커뮤니티만 찾아드려요</p>
          </div>
          <nav aria-label="관심사별 커뮤니티 찾기" className="mt-5 flex gap-3 overflow-x-auto pb-3">
            <Link
              aria-current={!category ? "page" : undefined}
              className={`flex min-h-14 shrink-0 items-center rounded-full border-2 px-5 font-black no-underline transition ${!category ? "border-[var(--primary)] bg-[var(--sky-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] bg-white hover:border-[var(--primary)]"}`}
              href={{ pathname: "/clubs", query: searchTerm ? { q: searchTerm } : {} }}
            >
              전체
            </Link>
            {INTERESTS.map((interest) => {
              const isActive = category === interest.id;
              return (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-14 shrink-0 items-center gap-2 rounded-full border-2 px-5 font-black no-underline transition ${isActive ? "border-[var(--primary)] bg-[var(--sky-soft)] text-[var(--primary-strong)]" : "border-[var(--line)] bg-white hover:border-[var(--primary)]"}`}
                  href={{ pathname: "/clubs", query: { category: interest.id, ...(searchTerm ? { q: searchTerm } : {}) } }}
                  key={interest.id}
                >
                  <span aria-hidden="true" className="text-xl">{interest.emoji}</span>
                  {interest.label}
                </Link>
              );
            })}
          </nav>

          <form action="/clubs" className="panel mt-5 p-4 sm:p-5" method="get" role="search">
            {category ? <input name="category" type="hidden" value={category} /> : null}
            <label className="form-label" htmlFor="club-search">커뮤니티 이름 또는 소개</label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative flex-1">
                <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={22} />
                <input className="form-input pl-12" defaultValue={searchTerm} id="club-search" maxLength={80} minLength={2} name="q" placeholder="예: 숲길, 사진 산책" type="search" />
              </div>
              <button className="button-primary shrink-0 px-7" type="submit">커뮤니티 찾기</button>
            </div>
          </form>
        </section>

        <section className="mt-11" aria-labelledby="all-clubs-heading">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">함께하는 곳</p>
              <h2 className="section-title" id="all-clubs-heading">공개 커뮤니티</h2>
            </div>
            {catalog ? (
              <p className="rounded-full bg-[var(--accent-soft)] px-4 py-2 text-sm font-black text-[var(--warning)]">
                현재 화면에서 {clubs.length}개 확인
              </p>
            ) : null}
          </div>

          {hasInvalidQuery ? (
            <div className="panel mt-6 px-6 py-12 text-center" role="status">
              <Search aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">검색 주소가 올바르지 않아요</h3>
              <p className="mt-2 text-[var(--muted)]">안전한 기본 조건으로 다시 검색해 주세요.</p>
              <Link className="button-primary mt-6" href="/clubs"><RotateCcw aria-hidden="true" size={20} /> 처음부터 보기</Link>
            </div>
          ) : !catalog ? (
            <div className="panel mt-6 px-6 py-12 text-center" role="status">
              <UsersRound aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">커뮤니티 목록을 잠시 불러오지 못했어요</h3>
              <p className="mt-2 text-[var(--muted)]">잘못된 예시 정보로 대신하지 않습니다. 잠시 뒤 다시 확인해 주세요.</p>
            </div>
          ) : clubs.length ? (
            <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {clubs.map((club, index) => (
                <article
                  className="group panel flex h-full flex-col overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-[var(--shadow)] focus-within:shadow-[var(--shadow)]"
                  id={`club-${club.slug}`}
                  key={club.id}
                >
                  <Link
                    aria-label={`${club.title} 커뮤니티 둘러보기`}
                    className="relative block aspect-[16/9] overflow-hidden bg-[var(--canvas-deep)]"
                    href={`/clubs/${club.slug}`}
                  >
                    <Image
                      alt={club.image ? `${club.title} 커뮤니티 대표 이미지` : "시니어클럽 공용 대표 이미지"}
                      className="object-cover transition duration-500 group-hover:scale-[1.025]"
                      fill
                      priority={index === 0}
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 380px"
                      src={resolveCoverImage(club.image, club.interest.slug)}
                      unoptimized={Boolean(club.image?.startsWith("https://"))}
                    />
                    <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1 text-sm font-black text-[var(--primary-strong)]">
                      <span aria-hidden="true">{interestEmoji(club.interest.slug)} </span>
                      {club.interest.name}
                    </span>
                  </Link>

                  <div className="flex flex-1 flex-col p-5 sm:p-6">
                    <h3 className="text-[1.35rem] font-black tracking-[-0.035em]">
                      <Link className="no-underline" href={`/clubs/${club.slug}`}>{club.title}</Link>
                    </h3>
                    <p className="mt-2 line-clamp-3 text-[0.95rem] leading-relaxed text-[var(--muted)]">{club.description}</p>
                    {club.region ? <p className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--muted)]"><MapPin aria-hidden="true" size={17} /> {club.region}</p> : null}

                    <dl className="mt-5 grid grid-cols-2 gap-3 border-y border-[var(--line)] py-4 text-sm">
                      <div className="flex items-center gap-2">
                        <UsersRound aria-hidden="true" className="text-[var(--primary)]" size={20} />
                        <div><dt className="text-[var(--muted)]">활성 회원</dt><dd className="font-black">{club.memberCount.toLocaleString("ko-KR")}명</dd></div>
                      </div>
                      <div className="flex items-center gap-2">
                        <CalendarHeart aria-hidden="true" className="text-[var(--primary)]" size={20} />
                        <div><dt className="text-[var(--muted)]">향후 공개 일정</dt><dd className="font-black">{club.upcomingEventCount}개</dd></div>
                      </div>
                    </dl>

                    {club.nextEvent ? (
                      <Link className="mt-4 rounded-xl bg-[var(--canvas)] p-4 no-underline" href={`/events/${club.nextEvent.id}`}>
                        <span className="block text-xs font-black text-[var(--primary)]">가장 가까운 공개 모임</span>
                        <strong className="mt-1 block">{club.nextEvent.title}</strong>
                        <span className="mt-1 block text-sm font-semibold text-[var(--muted)]">{club.nextEvent.dateLabel} · {club.nextEvent.locationName}</span>
                      </Link>
                    ) : (
                      <p className="mt-4 flex items-center gap-2 rounded-xl bg-[var(--canvas)] p-4 text-sm font-semibold text-[var(--muted)]"><CalendarX2 aria-hidden="true" size={19} /> 안내 중인 다음 모임이 없습니다.</p>
                    )}

                    <div className="mt-auto flex items-center justify-between gap-4 pt-5">
                      <span className="flex items-center gap-2 text-sm font-bold text-[var(--muted)]">
                        <MessageCircleMore aria-hidden="true" size={19} />
                        리더 {club.leaderName}
                      </span>
                      <Link className="inline-flex items-center gap-1 font-black text-[var(--primary)] no-underline" href={`/clubs/${club.slug}`}>
                        둘러보기 <ArrowRight aria-hidden="true" size={20} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="panel mt-6 px-6 py-12 text-center">
              <Search aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} />
              <h3 className="mt-4 text-xl font-black">조건에 맞는 공개 커뮤니티가 아직 없어요</h3>
              <p className="mt-2 text-[var(--muted)]">검색어를 줄이거나 다른 관심 테마를 골라보세요.</p>
              <Link className="button-primary mt-6" href="/clubs"><RotateCcw aria-hidden="true" size={20} /> 전체 커뮤니티 보기</Link>
            </div>
          )}

          {catalog?.hasNextPage && catalog.nextCursor ? (
            <div className="mt-7 text-center">
              <Link
                className="button-secondary"
                href={{
                  pathname: "/clubs",
                  query: {
                    cursor: catalog.nextCursor,
                    ...(category ? { category } : {}),
                    ...(searchTerm ? { q: searchTerm } : {}),
                  },
                }}
              >
                다음 커뮤니티 더 보기 <ArrowRight aria-hidden="true" size={20} />
              </Link>
            </div>
          ) : null}
        </section>

        <section className="mt-12 flex flex-col items-start justify-between gap-5 rounded-[1.6rem] bg-[var(--sky-soft)] p-6 sm:flex-row sm:items-center sm:p-8">
          <div>
            <p className="font-black text-[var(--primary)]">커뮤니티보다 날짜가 더 중요하다면</p>
            <h2 className="mt-1 text-2xl font-black tracking-[-0.04em]">예정된 모임을 한눈에 찾아보세요</h2>
          </div>
          <Link className="button-primary shrink-0" href="/events">전체 모임 보기 <ArrowRight aria-hidden="true" size={21} /></Link>
        </section>
      </div>
    </div>
  );
}
