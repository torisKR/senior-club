import { ArrowLeft, MessageCircle, UserRound } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { CommunityPostComments } from "@/components/community-post-actions";
import {
  getPublicPost,
  getPublicPostComments,
  isSafePublicPostCursor,
} from "@/lib/posts/server";
import { createNoIndexPageMetadata } from "@/lib/seo";

type PostDetailPageProps = {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ commentCursor?: string | string[] }>;
};

export const dynamicParams = true;
export const revalidate = 120;

function writingRoutes(slug: string, postId: string) {
  const returnTo = `/clubs/${slug}/posts/${postId}`;
  return {
    loginHref: `/login?returnTo=${encodeURIComponent(returnTo)}` as Route,
    onboardingHref: `/onboarding?returnTo=${encodeURIComponent(returnTo)}` as Route,
  };
}

export async function generateMetadata({ params }: PostDetailPageProps): Promise<Metadata> {
  const { slug, id } = await params;
  try {
    const post = await getPublicPost(id);
    return post && post.club.slug === slug
      ? createNoIndexPageMetadata({
          title: post.title,
          description: `${post.club.title} 게시판에 공개된 ${post.author.name}님의 게시글입니다.`,
        })
      : createNoIndexPageMetadata({
          title: "게시글을 찾을 수 없습니다",
          description: "요청한 공개 게시글을 찾을 수 없습니다.",
        });
  } catch {
    return createNoIndexPageMetadata({
      title: "게시글 정보를 확인하고 있습니다",
      description: "공개 게시글 정보를 잠시 불러오지 못했습니다.",
    });
  }
}

export default async function CommunityPostDetailPage({ params, searchParams }: PostDetailPageProps) {
  const { slug, id } = await params;
  let post: Awaited<ReturnType<typeof getPublicPost>>;
  try {
    post = await getPublicPost(id);
  } catch {
    return (
      <div className="page-container page-content">
        <Link className="mb-5 inline-flex items-center gap-2 font-black text-[var(--primary)] no-underline" href={`/clubs/${slug}/posts`}><ArrowLeft aria-hidden="true" size={21} /> 게시판으로</Link>
        <section className="panel px-6 py-14 text-center" role="status"><MessageCircle aria-hidden="true" className="mx-auto text-[var(--sky)]" size={44} /><h1 className="mt-4 text-2xl font-black">게시글을 잠시 불러오지 못했어요</h1><p className="mt-3 text-[var(--muted)]">예시 내용으로 대신하지 않습니다. 잠시 뒤 다시 확인해 주세요.</p></section>
      </div>
    );
  }
  if (!post || post.club.slug !== slug) notFound();

  const rawCursor = (await searchParams).commentCursor;
  const commentCursor = typeof rawCursor === "string" ? rawCursor : undefined;
  const invalidCursor = rawCursor !== undefined && !isSafePublicPostCursor(commentCursor);
  let comments: Awaited<ReturnType<typeof getPublicPostComments>> | null = null;
  if (!invalidCursor) {
    try {
      comments = await getPublicPostComments(post.id, {
        limit: 20,
        ...(commentCursor ? { cursor: commentCursor } : {}),
      });
    } catch {
      comments = null;
    }
  }

  const { loginHref, onboardingHref } = writingRoutes(slug, post.id);
  const nextHref =
    comments?.hasNextPage && comments.nextCursor
      ? (`/clubs/${slug}/posts/${post.id}?commentCursor=${encodeURIComponent(comments.nextCursor)}#post-comments-heading` as Route)
      : undefined;

  return (
    <div className="page-container page-content">
      <nav aria-label="게시글 경로" className="mb-5 flex flex-wrap items-center gap-2 text-sm font-black text-[var(--muted)]">
        <Link className="inline-flex items-center gap-2 text-[var(--primary)] no-underline" href={`/clubs/${slug}/posts`}><ArrowLeft aria-hidden="true" size={21} /> {post.club.title} 게시판</Link>
      </nav>

      <article className="panel p-6 sm:p-9">
        <p className="eyebrow">{post.type === "NOTICE" ? "공지" : post.type === "PHOTO" ? "사진 이야기" : "커뮤니티 이야기"}</p>
        <h1 className="page-title mt-2">{post.title}</h1>
        <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--line)] pb-5 text-sm text-[var(--muted)]">
          <span className="inline-flex items-center gap-2 font-bold"><UserRound aria-hidden="true" size={19} /> {post.author.name}</span>
          <time dateTime={post.createdAt}>{post.dateLabel}</time>
          <span className="inline-flex items-center gap-1"><MessageCircle aria-hidden="true" size={18} /> 공개 댓글 {post.commentCount}개</span>
        </div>
        <p className="mt-7 whitespace-pre-wrap text-lg leading-[1.85]">{post.content}</p>
      </article>

      {invalidCursor ? (
        <section className="panel mt-8 px-6 py-10 text-center" role="status"><h2 className="text-xl font-black">댓글 목록 주소가 올바르지 않아요</h2><Link className="button-primary mt-5" href={`/clubs/${slug}/posts/${post.id}` as Route}>댓글 처음부터 보기</Link></section>
      ) : comments ? (
        <CommunityPostComments comments={comments.comments} loginHref={loginHref} nextHref={nextHref} onboardingHref={onboardingHref} postId={post.id} />
      ) : (
        <section className="panel mt-8 px-6 py-10 text-center" role="status"><h2 className="text-xl font-black">댓글을 잠시 불러오지 못했어요</h2><p className="mt-2 text-[var(--muted)]">예시 댓글을 표시하지 않습니다. 잠시 뒤 다시 확인해 주세요.</p></section>
      )}
    </div>
  );
}
