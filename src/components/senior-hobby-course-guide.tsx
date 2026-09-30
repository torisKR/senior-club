"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowRight, CheckCircle2, Clock, MapPin, Sparkles } from "lucide-react";
import {
  SENIOR_HIKING_COURSES,
  SENIOR_HOBBY_RECOMMENDATIONS,
} from "@/lib/senior-recommendations";

export function SeniorHobbyCourseGuide() {
  const [activeTab, setActiveTab] = useState<"courses" | "hobbies">("courses");

  return (
    <section aria-labelledby="senior-guide-heading" className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-3 py-1 text-sm font-semibold text-[var(--primary)]">
            <Sparkles className="size-4" />
            <span>5060 시니어 맞춤 가이드</span>
          </div>
          <h2
            id="senior-guide-heading"
            className="mt-2 text-2xl font-black tracking-tight text-[var(--ink)] sm:text-3xl"
          >
            좋아하는 등산 코스와 활력 취미를 만나보세요
          </h2>
          <p className="mt-1 text-base text-[var(--muted)] sm:text-lg">
            산책 코스와 취미를 살펴보세요. 코스 안내는 참고 정보이며, 실제 모집 일정은 공개 모임 목록에서 확인할 수 있어요.
          </p>
        </div>

        <div
          role="group"
          aria-label="가이드 분류"
          className="flex shrink-0 gap-2 rounded-2xl bg-[var(--surface-soft)] p-1.5"
        >
          <button
            type="button"
            aria-pressed={activeTab === "courses"}
            onClick={() => setActiveTab("courses")}
            className={`min-h-14 rounded-xl px-5 text-base font-bold transition-all sm:min-h-14 sm:text-lg ${
              activeTab === "courses"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--ink)] hover:bg-black/5"
            }`}
          >
            🥾 산책 코스
          </button>
          <button
            type="button"
            aria-pressed={activeTab === "hobbies"}
            onClick={() => setActiveTab("hobbies")}
            className={`min-h-14 rounded-xl px-5 text-base font-bold transition-all sm:min-h-14 sm:text-lg ${
              activeTab === "hobbies"
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--ink)] hover:bg-black/5"
            }`}
          >
            ✨ 추천 취미생활
          </button>
        </div>
      </div>

      {activeTab === "courses" ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SENIOR_HIKING_COURSES.map((course) => (
            <article
              key={course.id}
              className="flex flex-col justify-between rounded-3xl border border-[var(--line)] bg-white p-5 shadow-sm transition-all hover:border-[var(--primary-light)] hover:shadow-md"
            >
              <div>
                <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-[var(--surface-soft)]">
                  <Image
                    src={course.image}
                    alt="숲길 산책을 소개하는 시니어클럽 주제 참고 이미지"
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                  <div className="absolute left-3 top-3 rounded-lg bg-[var(--primary)]/90 px-3 py-1 text-sm font-bold text-white backdrop-blur-sm">
                    {course.difficultyLabel}
                  </div>
                </div>

                <p className="mt-2 text-sm text-[var(--muted)]">주제 참고 이미지 · 해당 코스 실경 사진이 아닙니다</p>
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-[var(--primary)]">
                    <MapPin className="size-4 shrink-0" />
                    <span>{course.location}</span>
                  </div>
                  <h3 className="text-xl font-extrabold text-[var(--ink)]">
                    {course.title}
                  </h3>
                  <p className="text-sm font-medium text-[var(--muted)]">
                    {course.tagline}
                  </p>
                </div>

                <div className="mt-4 space-y-1.5 border-t border-[var(--line-soft)] pt-3 text-sm text-[var(--ink)]">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-[var(--primary)] shrink-0" />
                    <span>참고 소요 시간: <strong>{course.duration}</strong> ({course.length})</span>
                  </div>
                  {course.features.map((feat, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-[var(--muted)]">
                      <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-3">
                <a href={course.sourceUrl} target="_blank" rel="noopener noreferrer" className="mb-2 inline-flex min-h-14 items-center text-base font-bold text-[var(--primary-strong)] underline" aria-label={`${course.title} 공식 안내 보기`}>공식 코스 안내 보기</a>
                <Link
                  href={{ pathname: "/events", query: { category: course.relatedInterestId } }}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--surface-soft)] px-4 text-base font-bold text-[var(--primary-strong)] transition-all hover:bg-[var(--primary)] hover:text-white"
                >
                  <span>함께 걷는 모임 보기</span>
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {SENIOR_HOBBY_RECOMMENDATIONS.map((hobby) => (
            <article
              key={hobby.id}
              className="flex flex-col justify-between rounded-3xl border border-[var(--line)] bg-white p-6 shadow-sm transition-all hover:border-[var(--primary-light)] hover:shadow-md"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-3xl" role="img" aria-label={hobby.name}>
                    {hobby.emoji}
                  </span>
                  <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-bold text-[var(--primary)]">
                    {hobby.category}
                  </span>
                </div>

                <h3 className="mt-3 text-xl font-extrabold text-[var(--ink)]">
                  {hobby.name}
                </h3>
                <p className="mt-1 text-sm font-medium text-[var(--muted)]">
                  {hobby.tagline}
                </p>

                <div className="mt-4 space-y-1.5 border-t border-[var(--line-soft)] pt-3">
                  <p className="text-xs font-bold text-[var(--primary)] uppercase tracking-wider">이런 점이 좋아요</p>
                  {hobby.benefits.map((b, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-[var(--ink)]">
                      <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-5 pt-3">
                <Link
                  href={hobby.targetUrl}
                  className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-base font-bold text-white transition-all hover:bg-[var(--primary-strong)]"
                >
                  <span>{hobby.actionText}</span>
                  <ArrowRight className="size-4" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
