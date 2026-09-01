import { ArrowLeft, MessageCircle, NotebookPen, RotateCcw, UserRound } from "lucide-react";
import type { Metadata } from "next";
import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityPostComposer } from "@/components/community-post-actions";
import { getPublicClub } from "@/lib/clubs/server";
import {
  getPublicClubPosts,
  isSafePublicPostCursor,
} from "@/lib/posts/server";
import { createNoIndexPageMetadata } from "@/lib/seo";

type CommunityPostsPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
};

export const dynamicParams = true;
export const revalidate = 120;

function writingRoutes(slug: string) {
  const returnTo = `/clubs/${slug}/posts`;
  return {
    loginHref: `/login?returnTo=${encodeURIComponent(returnTo)}` as Route,
    onboardingHref: `/onboarding?returnTo=${encodeURIComponent(returnTo)}` as Route,
  };
}

export async function generateMetadata({ params }: CommunityPostsPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const club = await getPublicClub(slug);
    return club
      ? createNoIndexPageMetadata({
          title: `${club.title} 게시판`,
          description: `${club.title}의 공개 게시글과 댓글을 확인하는 커뮤니티 게시판입니다.`,
        })
      : createNoIndexPageMetadata({
          title: "게시판을 찾을 수 없습니다",
          description: "요청한 커뮤니티 게시판을 찾을 수 없습니다.",
        });
  } catch {
    return createNoIndexPageMetadata({
      title: "게시판 정보를 확인하고 있습니다",
      description: "커뮤니티 게시판 정보를 잠시 불러오지 못했습니다.",
    });
  }
}

export default async function CommunityPostsPage({
  params,
  searchParams,
}: CommunityPostsPageProps) {
  const { slug } = await params;
  const rawCursor = (await searchParams).cursor;
  const cursor = typeof rawCursor === "string" ? rawCursor : undefined;
  const invalidCursor = rawCursor !== undefined && !isSafePublicPostCursor(cursor);

  let club: Awaited<ReturnType<typeof getPublicClub>>;
  try {
    club = await getPublicClub(slug);
  } catch {
    return (
      <div className="page-container page-content">
        <Link className="mb-5 inline-flex min-h-12 items-center gap-2 font-black text-[var(--primary)] no-underline" href="/clubs"><ArrowLeft aria-hidden="true" size={21} /> 모든 커뮤니티</Link>
        <section className="panel px-6 py-14 text-center" role="status"><NotebookPen aria-hidden="true" className="mx-auto text-[var(--sky)]" size={44} /><h1 className="mt-4 text-2xl font-black">게시판 정보를 잠시 불러오지 못했어요</h1><p className="mt-3 text-[var(--muted)]">예시 게시글로 대신하지 않습니다. 잠시 뒤 다시 확인해 주세요.</p></section>
      </div>
    );
  }
  if (!club) notFound();

  let catalog: Awaited<ReturnType<typeof getPublicClubPosts>> | null = null;
  if (!invalidCursor) {
    try {
      catalog = await getPublicClubPosts(slug, {
        limit: 20,
        ...(cursor ? { cursor } : {}),
      });
    } catch {
      catalog = null;
    }
  }
  const { loginHref, onboardingHref } = writingRoutes(club.slug);

  return (
    <div className="page-container page-content">
      <Link className="mb-5 inline-flex min-h-12 items-center gap-2 font-black text-[var(--primary)] no-underline" href={`/clubs/${club.slug}`}>
        <ArrowLeft aria-hidden="true" size={21} /> {club.title}로 돌아가기
      </Link>
      <header className="mb-8">
        <p className="eyebrow">활동 전후에도 이어지는 대화</p>
        <h1 className="page-title">{club.title} 게시판</h1>
        <p className="supporting-copy mt-3">공개된 질문과 경험을 읽고, 로그인 후 실제 회원 계정으로 이야기를 나눠보세요.</p>
      </header>

      <CommunityPostComposer clubSlug={club.slug} loginHref={loginHref} onboardingHref={onboardingHref} />

      <section className="mt-8" aria-labelledby="community-post-list-heading">
        <h2 className="section-title" id="community-post-list-heading">공개 게시글</h2>
        {invalidCursor ? (
          <div className="panel mt-5 px-6 py-12 text-center" role="status"><NotebookPen aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} /><h3 className="mt-4 text-xl font-black">게시글 목록 주소가 올바르지 않아요</h3><Link className="button-primary mt-5" href={`/clubs/${club.slug}/posts`}><RotateCcw aria-hidden="true" size={19} /> 처음부터 보기</Link></div>
        ) : !catalog ? (
          <div className="panel mt-5 px-6 py-12 text-center" role="status"><NotebookPen aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} /><h3 className="mt-4 text-xl font-black">게시글을 잠시 불러오지 못했어요</h3><p className="mt-2 text-[var(--muted)]">저장된 예시 글을 대신 보여주지 않습니다. 잠시 뒤 다시 확인해 주세요.</p></div>
        ) : catalog.posts.length ? (
          <div className="mt-5 grid gap-4">
            {catalog.posts.map((post) => (
              <article className="panel p-5 sm:p-7" key={post.id}>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--muted)]">
                  <span className="inline-flex items-center gap-2 font-bold"><UserRound aria-hidden="true" size={19} /> {post.author.name}</span>
                  <time dateTime={post.createdAt}>{post.dateLabel}</time>
                </div>
                <h3 className="mt-4 text-xl font-black tracking-[-0.03em]"><Link className="no-underline hover:text-[var(--primary)]" href={`/clubs/${club.slug}/posts/${post.id}` as Route}>{post.title}</Link></h3>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap leading-relaxed text-[var(--muted)]">{post.content}</p>
                <div className="mt-4 flex items-center justify-between gap-4 border-t border-[var(--line)] pt-4">
                  <span className="inline-flex items-center gap-1 text-sm font-bold text-[var(--muted)]"><MessageCircle aria-hidden="true" size={18} /> 댓글 {post.commentCount}개</span>
                  <Link className="font-black text-[var(--primary)] no-underline" href={`/clubs/${club.slug}/posts/${post.id}` as Route}>게시글 읽기</Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="panel mt-5 px-6 py-12 text-center"><NotebookPen aria-hidden="true" className="mx-auto text-[var(--sky)]" size={42} /><h3 className="mt-4 text-xl font-black">공개된 게시글이 아직 없어요</h3><p className="mt-2 text-[var(--muted)]">시작 설정을 마친 회원이라면 첫 이야기를 남길 수 있습니다.</p></div>
        )}

        {catalog?.hasNextPage && catalog.nextCursor ? (
          <div className="mt-6 text-center"><Link className="button-secondary" href={`/clubs/${club.slug}/posts?cursor=${encodeURIComponent(catalog.nextCursor)}` as Route}>게시글 더 보기</Link></div>
        ) : null}
      </section>
    </div>
  );
}
