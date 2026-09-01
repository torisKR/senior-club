"use client";

import {
  CheckCircle2,
  LoaderCircle,
  MessageCircle,
  NotebookPen,
  Plus,
  Reply,
  Send,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";

import {
  CommunityPostRequestError,
  createCommunityComment,
  createCommunityPost,
} from "@/lib/posts/client";
import type { PublicComment } from "@/lib/posts/server";
import {
  resolveWritingAccess,
  type WritingAccess,
} from "@/lib/posts/writing-access";

function useWritingAccess(): WritingAccess {
  const [access, setAccess] = useState<WritingAccess>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/auth/session", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("로그인 상태를 확인하지 못했습니다.");
        setAccess(resolveWritingAccess(await response.json()));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setAccess({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "로그인 상태를 확인하지 못했습니다.",
        });
      });
    return () => controller.abort();
  }, []);

  return access;
}

function WritingGate({
  access,
  loginHref,
  onboardingHref,
}: {
  access: WritingAccess;
  loginHref: Route;
  onboardingHref: Route;
}) {
  if (access.status === "loading") {
    return (
      <p className="flex items-center gap-2 font-bold text-[var(--muted)]" role="status">
        <LoaderCircle aria-hidden="true" className="animate-spin" size={20} />
        작성 권한을 확인하고 있어요.
      </p>
    );
  }
  if (access.status === "anonymous") {
    return (
      <div className="rounded-xl bg-[var(--canvas)] p-4">
        <p className="font-bold text-[var(--muted)]">글과 댓글을 쓰려면 로그인이 필요합니다.</p>
        <Link className="button-primary mt-3" href={loginHref}>로그인하고 작성하기</Link>
      </div>
    );
  }
  if (access.status === "onboarding") {
    return (
      <div className="rounded-xl bg-[var(--canvas)] p-4">
        <p className="font-bold text-[var(--muted)]">관심사와 활동 지역을 설정하면 작성할 수 있어요.</p>
        <Link className="button-primary mt-3" href={onboardingHref}>시작 설정 마치기</Link>
      </div>
    );
  }
  if (access.status === "error") {
    return <p className="font-bold text-[var(--danger)]" role="alert">{access.message} 잠시 뒤 다시 확인해 주세요.</p>;
  }
  return null;
}

export function CommunityPostComposer({
  clubSlug,
  loginHref,
  onboardingHref,
}: {
  clubSlug: string;
  loginHref: Route;
  onboardingHref: Route;
}) {
  const router = useRouter();
  const access = useWritingAccess();
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (access.status !== "ready" || isSubmitting) return;
    const normalizedTitle = title.trim().replace(/\s+/g, " ");
    const normalizedContent = content.trim();
    if (normalizedTitle.length < 2 || normalizedTitle.length > 100) {
      setError("제목을 2~100자로 입력해 주세요.");
      return;
    }
    if (normalizedContent.length < 10 || normalizedContent.length > 5_000) {
      setError("본문을 10~5000자로 입력해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    try {
      const post = await createCommunityPost(clubSlug, {
        title: normalizedTitle,
        content: normalizedContent,
      });
      router.push(`/clubs/${clubSlug}/posts/${post.id}` as Route);
      router.refresh();
    } catch (caught) {
      if (caught instanceof CommunityPostRequestError && caught.status === 401) {
        router.push(loginHref);
      } else if (
        caught instanceof CommunityPostRequestError &&
        caught.code === "ONBOARDING_REQUIRED"
      ) {
        router.push(onboardingHref);
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "게시글을 등록하지 못했습니다.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel p-5 sm:p-7" aria-labelledby="community-write-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black" id="community-write-heading">새 이야기 나누기</h2>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">별도 가입 절차가 마련되기 전까지, 로그인 후 시작 설정을 마친 회원은 ACTIVE 커뮤니티에 작성할 수 있습니다.</p>
        </div>
        {access.status === "ready" ? (
          <button className="button-primary" type="button" aria-expanded={isOpen} onClick={() => setIsOpen((value) => !value)}>
            {isOpen ? <X aria-hidden="true" size={20} /> : <Plus aria-hidden="true" size={20} />}
            {isOpen ? "작성 닫기" : "새 글 쓰기"}
          </button>
        ) : null}
      </div>

      {access.status !== "ready" ? <div className="mt-5"><WritingGate access={access} loginHref={loginHref} onboardingHref={onboardingHref} /></div> : null}

      {access.status === "ready" && isOpen ? (
        <form className="mt-6 border-t border-[var(--line)] pt-6" onSubmit={submit} noValidate>
          <label className="form-label" htmlFor="community-post-title">제목</label>
          <input className="form-input" disabled={isSubmitting} id="community-post-title" maxLength={100} minLength={2} onChange={(event) => setTitle(event.target.value)} value={title} />
          <div className="mt-5">
            <label className="form-label" htmlFor="community-post-content">본문</label>
            <textarea aria-describedby="community-post-count" className="form-textarea min-h-44" disabled={isSubmitting} id="community-post-content" maxLength={5_000} minLength={10} onChange={(event) => setContent(event.target.value)} value={content} />
            <p className="mt-2 text-right text-sm text-[var(--muted)]" id="community-post-count" aria-live="polite">{content.length} / 5000자</p>
          </div>
          {error ? <p className="mt-4 font-bold text-[var(--danger)]" role="alert">{error}</p> : null}
          <button className="button-primary mt-5" disabled={isSubmitting} type="submit">
            {isSubmitting ? <><LoaderCircle aria-hidden="true" className="animate-spin" size={20} /> 등록 중…</> : <><NotebookPen aria-hidden="true" size={20} /> 게시글 등록하기</>}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export function CommunityPostComments({
  comments,
  loginHref,
  nextHref,
  onboardingHref,
  postId,
}: {
  comments: PublicComment[];
  loginHref: Route;
  nextHref?: Route;
  onboardingHref: Route;
  postId: string;
}) {
  const router = useRouter();
  const access = useWritingAccess();
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<PublicComment | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (access.status !== "ready" || isSubmitting) return;
    const normalized = content.trim();
    if (normalized.length < 2 || normalized.length > 1_000) {
      setError("댓글을 2~1000자로 입력해 주세요.");
      return;
    }
    setIsSubmitting(true);
    setError("");
    setNotice("");
    try {
      await createCommunityComment(postId, {
        content: normalized,
        ...(replyTo ? { parentId: replyTo.id } : {}),
      });
      setContent("");
      setReplyTo(null);
      setNotice("댓글을 등록했습니다.");
      router.refresh();
    } catch (caught) {
      if (caught instanceof CommunityPostRequestError && caught.status === 401) {
        router.push(loginHref);
      } else if (
        caught instanceof CommunityPostRequestError &&
        caught.code === "ONBOARDING_REQUIRED"
      ) {
        router.push(onboardingHref);
      } else {
        setError(caught instanceof Error ? caught.message : "댓글을 등록하지 못했습니다.");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mt-8" aria-labelledby="post-comments-heading">
      <h2 className="section-title flex items-center gap-2" id="post-comments-heading"><MessageCircle aria-hidden="true" size={26} /> 댓글</h2>

      {comments.length ? (
        <ul className="mt-5 grid list-none gap-3 p-0">
          {comments.map((comment) => (
            <li className={`rounded-xl border border-[var(--line)] bg-white p-4 ${comment.parentId ? "ml-6 sm:ml-10" : ""}`} key={comment.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{comment.author.name}</strong>
                <time className="text-sm text-[var(--muted)]" dateTime={comment.createdAt}>{comment.dateLabel}</time>
              </div>
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{comment.content}</p>
              {!comment.parentId && access.status === "ready" ? (
                <button className="mt-3 inline-flex min-h-11 items-center gap-1 font-bold text-[var(--primary)]" type="button" onClick={() => { setReplyTo(comment); setError(""); }}>
                  <Reply aria-hidden="true" size={18} /> 답글 쓰기
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : <p className="panel mt-5 p-6 text-center text-[var(--muted)]">공개된 댓글이 아직 없습니다.</p>}

      {nextHref ? <div className="mt-5 text-center"><Link className="button-secondary" href={nextHref}>댓글 더 보기</Link></div> : null}

      <div className="panel mt-6 p-5 sm:p-6">
        {access.status === "ready" ? (
          <form onSubmit={submit} noValidate>
            {replyTo ? (
              <div className="mb-3 flex items-center justify-between gap-3 rounded-lg bg-[var(--sky-soft)] px-3 py-2 text-sm">
                <span><strong>{replyTo.author.name}</strong>님에게 답글 작성 중</span>
                <button aria-label="답글 대상 취소" type="button" onClick={() => setReplyTo(null)}><X aria-hidden="true" size={19} /></button>
              </div>
            ) : null}
            <label className="form-label" htmlFor="community-comment">{replyTo ? "답글" : "댓글"} 내용</label>
            <textarea className="form-textarea min-h-28" disabled={isSubmitting} id="community-comment" maxLength={1_000} minLength={2} onChange={(event) => setContent(event.target.value)} placeholder="서로를 배려하는 내용을 적어주세요." value={content} />
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-[var(--muted)]" aria-live="polite">{content.length} / 1000자</span>
              <button className="button-primary" disabled={isSubmitting} type="submit">{isSubmitting ? <LoaderCircle aria-hidden="true" className="animate-spin" size={20} /> : <Send aria-hidden="true" size={20} />} {isSubmitting ? "등록 중…" : "등록하기"}</button>
            </div>
          </form>
        ) : <WritingGate access={access} loginHref={loginHref} onboardingHref={onboardingHref} />}
        {notice ? <p className="mt-4 flex items-center gap-2 font-bold text-[var(--success)]" role="status"><CheckCircle2 aria-hidden="true" size={20} /> {notice}</p> : null}
        {error ? <p className="mt-4 font-bold text-[var(--danger)]" role="alert">{error}</p> : null}
      </div>
    </section>
  );
}
