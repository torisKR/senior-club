"use client";

import { CheckCircle2, LoaderCircle, Star } from "lucide-react";
import Link from "next/link";
import { FormEvent, useState } from "react";

import {
  ReviewRequestError,
  submitEventReview,
} from "@/lib/reviews/client";

const ratingLabels = ["아쉬웠어요", "보통이에요", "좋았어요", "아주 좋았어요", "꼭 추천해요"];

export function ReviewForm({ eventId }: { eventId: string }) {
  const [rating, setRating] = useState(0);
  const [content, setContent] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (rating === 0) {
      setError("별점을 선택해 주세요.");
      return;
    }
    if (content.trim().length < 10) {
      setError("후기를 10자 이상 적어 주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      await submitEventReview(eventId, { rating, content });
      setSubmitted(true);
    } catch (caught) {
      if (caught instanceof ReviewRequestError && caught.status === 401) {
        setError("로그인 시간이 만료되었습니다. 다시 로그인한 뒤 작성해 주세요.");
      } else {
        setError(
          caught instanceof Error
            ? caught.message
            : "후기를 등록하지 못했습니다. 잠시 후 다시 시도해 주세요.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <section className="panel mt-8 px-6 py-10 text-center sm:px-10" aria-live="polite">
        <CheckCircle2 aria-hidden="true" className="mx-auto text-[var(--success)]" size={52} />
        <h2 className="section-title mt-5">후기를 남겼어요.</h2>
        <p className="mx-auto mt-3 max-w-lg text-[var(--muted)]">함께한 분들에게 좋은 기억이 전해집니다. 관심사가 비슷한 다음 모임도 골라보세요.</p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link className="button-primary" href="/events">다음 모임 보기</Link>
          <Link className="button-quiet" href="/">홈으로 가기</Link>
        </div>
      </section>
    );
  }

  return (
    <form
      aria-busy={isSubmitting}
      className="panel mt-8 p-6 sm:p-8"
      onSubmit={submitReview}
      noValidate
    >
      <fieldset disabled={isSubmitting}>
        <legend className="text-[1.15rem] font-black">이번 모임은 얼마나 만족스러웠나요?</legend>
        <div
          className="mt-4 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 sm:grid-cols-5"
          aria-describedby={error ? "review-error" : undefined}
        >
          {ratingLabels.map((label, index) => {
            const value = index + 1;
            const checked = rating === value;
            return (
              <label
                key={label}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-3 text-left outline-none transition focus-within:ring-4 focus-within:ring-[var(--primary)]/30 sm:min-h-[5.8rem] sm:flex-col sm:justify-center sm:gap-0 sm:p-2 sm:text-center ${checked ? "border-[var(--primary)] bg-[var(--sky-soft)]" : "border-[var(--line)] bg-white"}`}
              >
                <input className="screen-reader-only" type="radio" name="rating" value={value} checked={checked} onChange={() => setRating(value)} />
                <Star aria-hidden="true" size={26} fill={checked ? "var(--sun)" : "none"} className={checked ? "text-[var(--warning)]" : "text-[var(--muted)]"} />
                <span className="text-[0.95rem] font-extrabold leading-snug sm:mt-1 sm:text-[0.9rem]">
                  {value}점<span className="sm:block"> · {label}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-7">
        <label className="form-label" htmlFor="review-content">기억에 남은 순간</label>
        <textarea
          id="review-content"
          className="form-textarea min-h-40 resize-y"
          disabled={isSubmitting}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          minLength={10}
          maxLength={800}
          aria-describedby="review-hint review-count"
          placeholder="예: 처음 온 사람도 자연스럽게 소개해 주셔서 편안했어요. 다음 산책에도 참여하고 싶어요."
        />
        <div className="mt-2 flex justify-between gap-4 text-[0.85rem] text-[var(--muted)]">
          <p id="review-hint" className="m-0">연락처 같은 개인정보는 적지 말아 주세요.</p>
          <p id="review-count" className="m-0 shrink-0" aria-live="polite">{content.length} / 800자</p>
        </div>
      </div>

      {error ? <p id="review-error" className="mt-5 font-extrabold text-[var(--danger)]" role="alert">{error}</p> : null}

      <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Link className="button-quiet" href="/">나중에 쓰기</Link>
        <button className="button-primary" disabled={isSubmitting} type="submit">
          {isSubmitting ? (
            <><LoaderCircle aria-hidden="true" className="animate-spin" size={20} /> 후기 등록 중…</>
          ) : "후기 남기기"}
        </button>
      </div>
    </form>
  );
}
