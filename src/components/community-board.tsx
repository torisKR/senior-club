"use client";

import { CheckCircle2, MessageCircle, NotebookPen, Plus, Send, UserRound, X } from "lucide-react";
import { FormEvent, useCallback, useMemo, useState, useSyncExternalStore } from "react";

type BoardComment = { id: string; author: string; content: string; createdAt: string };
type BoardPost = {
  id: string;
  author: string;
  title: string;
  content: string;
  createdAt: string;
  comments: BoardComment[];
};

const DEFAULT_POSTS: BoardPost[] = [
  {
    id: "welcome",
    author: "리더 김선영",
    title: "처음 오신 분은 편하게 인사 남겨주세요",
    content: "어떤 활동에 관심이 있는지 한두 문장만 적어도 좋아요. 다음 모임 준비물이나 난이도도 이곳에서 물어보세요.",
    createdAt: "2026-07-17T10:30:00+09:00",
    comments: [
      { id: "c1", author: "이현자", content: "스마트폰 사진을 배우고 싶어 가입했어요. 반갑습니다!", createdAt: "2026-07-17T14:12:00+09:00" },
    ],
  },
  {
    id: "tip",
    author: "박정호",
    title: "여름 야외 활동에서는 작은 물병도 꼭 챙겨요",
    content: "더운 날은 그늘에서 자주 쉬고, 평소보다 천천히 움직이는 편이 좋았습니다. 지난 모임에서 도움이 된 팁을 나눕니다.",
    createdAt: "2026-07-16T09:00:00+09:00",
    comments: [],
  },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

export function CommunityBoard({ clubSlug }: { clubSlug: string }) {
  const storageKey = `club-senior:posts:${clubSlug}`;
  const changeEvent = `${storageKey}:changed`;
  const [showComposer, setShowComposer] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const subscribe = useCallback((onChange: () => void) => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey) onChange();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(changeEvent, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(changeEvent, onChange);
    };
  }, [changeEvent, storageKey]);

  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  }, [storageKey]);

  const serialized = useSyncExternalStore(subscribe, getSnapshot, () => "");
  const posts = useMemo(() => {
    if (!serialized) return DEFAULT_POSTS;
    try {
      const value = JSON.parse(serialized) as BoardPost[];
      return Array.isArray(value) ? value : DEFAULT_POSTS;
    } catch {
      return DEFAULT_POSTS;
    }
  }, [serialized]);

  function savePosts(nextPosts: BoardPost[]) {
    window.localStorage.setItem(storageKey, JSON.stringify(nextPosts));
    window.dispatchEvent(new Event(changeEvent));
  }

  function addPost(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim().length < 2 || content.trim().length < 5) {
      setNotice("제목은 2자, 내용은 5자 이상 적어주세요.");
      return;
    }
    savePosts([
      {
        id: crypto.randomUUID(),
        author: "나 · 클럽 멤버",
        title: title.trim(),
        content: content.trim(),
        createdAt: new Date().toISOString(),
        comments: [],
      },
      ...posts,
    ]);
    setTitle("");
    setContent("");
    setShowComposer(false);
    setNotice("게시글을 등록했어요.");
  }

  function addComment(event: FormEvent<HTMLFormElement>, postId: string) {
    event.preventDefault();
    const value = commentDrafts[postId]?.trim() ?? "";
    if (value.length < 2) {
      setNotice("댓글을 2자 이상 적어주세요.");
      return;
    }
    savePosts(posts.map((post) => post.id === postId ? {
      ...post,
      comments: [...post.comments, { id: crypto.randomUUID(), author: "나 · 클럽 멤버", content: value, createdAt: new Date().toISOString() }],
    } : post));
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    setNotice("댓글을 등록했어요.");
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="m-0 font-extrabold text-[var(--muted)]">전체 글 {posts.length}개</p>
          <button className="button-primary" type="button" onClick={() => setShowComposer((value) => !value)} aria-expanded={showComposer}>
            {showComposer ? <X aria-hidden="true" size={21} /> : <Plus aria-hidden="true" size={21} />}
            {showComposer ? "작성 닫기" : "새 글 쓰기"}
          </button>
        </div>

        {showComposer ? (
          <form className="panel mt-5 p-5 sm:p-7" onSubmit={addPost}>
            <h2 className="section-title">새 이야기 나누기</h2>
            <div className="mt-5">
              <label className="form-label" htmlFor="post-title">제목</label>
              <input className="form-input" id="post-title" maxLength={80} value={title} onChange={(event) => setTitle(event.target.value)} />
            </div>
            <div className="mt-5">
              <label className="form-label" htmlFor="post-content">내용</label>
              <textarea className="form-textarea min-h-40" id="post-content" maxLength={1200} value={content} onChange={(event) => setContent(event.target.value)} />
            </div>
            <button className="button-primary mt-5 w-full sm:w-auto" type="submit"><NotebookPen aria-hidden="true" size={21} /> 게시글 등록하기</button>
          </form>
        ) : null}

        {notice ? <p className="mt-5 flex items-center gap-2 font-extrabold text-[var(--primary)]" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" size={21} /> {notice}</p> : null}

        <div className="mt-5 grid gap-5">
          {posts.map((post) => (
            <article className="panel p-5 sm:p-7" key={post.id}>
              <div className="flex items-start gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--sky-soft)] text-[var(--primary)]"><UserRound aria-hidden="true" size={23} /></span>
                <div>
                  <p className="m-0 font-black">{post.author}</p>
                  <p className="m-0 text-[0.86rem] text-[var(--muted)]">{formatDate(post.createdAt)}</p>
                </div>
              </div>
              <h2 className="mt-5 text-[1.28rem] font-black tracking-[-0.03em]">{post.title}</h2>
              <p className="mt-3 whitespace-pre-wrap leading-[1.75] text-[var(--muted)]">{post.content}</p>

              <section className="mt-6 border-t border-[var(--line)] pt-5" aria-label={`${post.title} 댓글`}>
                <h3 className="flex items-center gap-2 font-black"><MessageCircle aria-hidden="true" size={20} /> 댓글 {post.comments.length}개</h3>
                {post.comments.length ? (
                  <ul className="mt-3 grid list-none gap-2 p-0">
                    {post.comments.map((comment) => (
                      <li className="rounded-xl bg-[var(--canvas)] px-4 py-3" key={comment.id}>
                        <div className="flex flex-wrap justify-between gap-2"><strong>{comment.author}</strong><span className="text-[0.82rem] text-[var(--muted)]">{formatDate(comment.createdAt)}</span></div>
                        <p className="mb-0 mt-1">{comment.content}</p>
                      </li>
                    ))}
                  </ul>
                ) : <p className="mt-2 text-[var(--muted)]">첫 댓글을 남겨보세요.</p>}
                <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => addComment(event, post.id)}>
                  <label className="screen-reader-only" htmlFor={`comment-${post.id}`}>댓글 내용</label>
                  <input id={`comment-${post.id}`} className="form-input flex-1" placeholder="서로를 배려하는 댓글을 적어주세요" value={commentDrafts[post.id] ?? ""} onChange={(event) => setCommentDrafts((current) => ({ ...current, [post.id]: event.target.value }))} />
                  <button className="button-secondary shrink-0" type="submit"><Send aria-hidden="true" size={20} /> 댓글 쓰기</button>
                </form>
              </section>
            </article>
          ))}
        </div>
      </div>

      <aside className="soft-panel p-5 lg:sticky lg:top-24">
        <NotebookPen aria-hidden="true" className="text-[var(--primary)]" size={32} />
        <h2 className="mt-3 text-xl font-black">편안한 대화를 위해</h2>
        <ul className="mt-3 grid gap-2 pl-5 text-[0.92rem] text-[var(--muted)]">
          <li>연락처와 정확한 집 주소는 공개하지 않아요.</li>
          <li>건강·안전 정보는 리더 공지를 먼저 확인해요.</li>
          <li>불편한 글은 운영진에게 신고할 수 있어요.</li>
        </ul>
      </aside>
    </div>
  );
}
