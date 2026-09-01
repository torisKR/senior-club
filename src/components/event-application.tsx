"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useEffect, useMemo, useState } from "react";
import {
  BellRing,
  CheckCircle2,
  CircleAlert,
  LoaderCircle,
  ShieldCheck,
  UsersRound,
} from "lucide-react";

import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { buildOnboardingRoute } from "@/lib/auth/post-login-route";
import {
  loadEventApplication,
  type EventApplicationRecord,
} from "@/lib/protected-resource-client";

type EventApplicationProps = {
  eventId: string;
  eventTitle: string;
  capacity: number;
  participantCount: number;
  isClosed?: boolean;
};

type SessionState = "loading" | "authenticated" | "anonymous" | "error";

async function responseError(response: Response) {
  try {
    const value = (await response.json()) as {
      error?: { code?: string; message?: string };
    };
    return {
      code: value.error?.code,
      message: value.error?.message ?? "요청을 처리하지 못했습니다.",
    };
  } catch {
    return {
      code: undefined,
      message: "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}

function applicationReturnTo(eventId: string): Route {
  return sanitizeReturnTo(`/events/${eventId}#application`);
}

function loginHref(eventId: string): Route {
  const returnTo = applicationReturnTo(eventId);
  return `/login?returnTo=${encodeURIComponent(returnTo)}` as Route;
}

export function EventApplication({
  eventId,
  eventTitle,
  capacity,
  participantCount,
  isClosed = false,
}: EventApplicationProps) {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("loading");
  const [application, setApplication] = useState<EventApplicationRecord | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  const remaining = Math.max(capacity - participantCount, 0);
  const unavailable = isClosed || remaining === 0;
  const activeApplication =
    application?.status === "PENDING" || application?.status === "APPROVED"
      ? application
      : null;

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setSessionState("loading");
      setError("");
      try {
        const result = await loadEventApplication(eventId, {
          signal: controller.signal,
        });
        if (!result.authenticated) {
          setSessionState("anonymous");
          return;
        }
        setApplication(result.application);
        setSessionState("authenticated");
      } catch (caught) {
        if (controller.signal.aborted) return;
        setError(
          caught instanceof Error
            ? caught.message
            : "신청 상태를 확인하지 못했습니다.",
        );
        setSessionState("error");
      }
    }

    void load();
    return () => controller.abort();
  }, [eventId, loadAttempt]);

  const appliedDate = useMemo(() => {
    if (!activeApplication) return "";
    return new Intl.DateTimeFormat("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(activeApplication.appliedAt));
  }, [activeApplication]);

  async function apply() {
    if (sessionState !== "authenticated") {
      router.push(loginHref(eventId));
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/applications`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": crypto.randomUUID(),
          },
          body: JSON.stringify({}),
        },
      );
      if (response.status === 401) {
        setSessionState("anonymous");
        router.push(loginHref(eventId));
        return;
      }
      if (!response.ok) {
        const requestError = await responseError(response);
        if (requestError.code === "PROFILE_ONBOARDING_REQUIRED") {
          router.push(buildOnboardingRoute(applicationReturnTo(eventId)));
          return;
        }
        throw new Error(requestError.message);
      }
      setApplication((await response.json()) as EventApplicationRecord);
      setMessage("모임 신청이 접수되었습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "모임을 신청하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function cancel() {
    setIsSubmitting(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(
        `/api/events/${encodeURIComponent(eventId)}/applications`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (response.status === 401) {
        setSessionState("anonymous");
        router.push(loginHref(eventId));
        return;
      }
      if (!response.ok) {
        const requestError = await responseError(response);
        throw new Error(requestError.message);
      }
      setApplication((await response.json()) as EventApplicationRecord);
      setIsCancelling(false);
      setMessage("모임 신청을 취소했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "신청을 취소하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (sessionState === "loading") {
    return (
      <div className="panel flex min-h-56 items-center justify-center p-6" aria-live="polite" id="application">
        <span className="flex items-center gap-3 font-extrabold text-[var(--muted)]">
          <LoaderCircle aria-hidden="true" className="animate-spin" size={24} />
          신청 상태를 확인하고 있어요
        </span>
      </div>
    );
  }

  if (sessionState === "error") {
    return (
      <section
        aria-labelledby="application-error-title"
        className="panel p-6 sm:p-7"
        id="application"
      >
        <CircleAlert
          aria-hidden="true"
          className="text-[var(--danger)]"
          size={32}
        />
        <h2
          className="mt-4 text-2xl font-black tracking-[-0.04em]"
          id="application-error-title"
        >
          신청 상태를 불러오지 못했어요
        </h2>
        <p
          className="mt-3 font-bold text-[var(--danger)]"
          role="alert"
        >
          {error}
        </p>
        <button
          className="button-primary mt-6 w-full"
          onClick={() => setLoadAttempt((current) => current + 1)}
          type="button"
        >
          다시 시도하기
        </button>
        <p className="mt-3 text-center text-sm font-bold text-[var(--muted)]">
          로그인 상태를 바꾸지 않고 신청 정보를 다시 확인합니다
        </p>
      </section>
    );
  }

  if (activeApplication) {
    const approved = activeApplication.status === "APPROVED";
    return (
      <section className="overflow-hidden rounded-[1.4rem] border-2 border-[var(--primary)] bg-white shadow-[var(--shadow)]" aria-labelledby="application-complete-title" id="application">
        <div className="bg-[var(--primary)] px-6 py-6 text-white">
          <CheckCircle2 aria-hidden="true" className="mb-3" size={38} strokeWidth={2.5} />
          <p className="mb-1 text-sm font-black text-white/80">
            {approved ? "참여 승인" : "승인 대기"}
          </p>
          <h2 className="text-2xl font-black leading-snug tracking-[-0.04em]" id="application-complete-title">
            {approved ? "함께할 자리가 확정됐어요" : "리더가 신청을 확인하고 있어요"}
          </h2>
        </div>
        <div className="p-6">
          <p className="font-black">{eventTitle}</p>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{appliedDate} 신청</p>

          <ol className="mt-5 grid gap-3 text-[0.95rem]">
            <li className="flex gap-3 rounded-xl bg-[var(--sky-soft)] p-3">
              <BellRing aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={22} />
              <span>
                <strong className="block">{approved ? "일정 알림을 확인해 주세요" : "승인 결과를 알려드려요"}</strong>
                이메일과 설정한 앱 푸시 알림으로 안내합니다.
              </span>
            </li>
            <li className="flex gap-3 rounded-xl bg-[var(--canvas)] p-3">
              <ShieldCheck aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--primary)]" size={22} />
              <span>
                <strong className="block">승인 뒤 채팅방이 열려요</strong>
                장소 변경과 준비물 안내를 받을 수 있어요.
              </span>
            </li>
          </ol>

          {message ? (
            <p className="mt-4 font-bold text-[var(--primary)]" role="status" aria-live="polite">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 flex items-start gap-2 font-bold text-[var(--danger)]" role="alert">
              <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={21} />
              {error}
            </p>
          ) : null}

          {isCancelling ? (
            <div className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--canvas)] p-4">
              <p className="font-black">정말 신청을 취소할까요?</p>
              <p className="mt-1 text-sm font-semibold text-[var(--muted)]">취소한 자리는 다른 회원에게 열립니다.</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button className="button-danger" disabled={isSubmitting} onClick={cancel} type="button">
                  {isSubmitting ? "취소 처리 중…" : "신청 취소하기"}
                </button>
                <button className="button-quiet" disabled={isSubmitting} onClick={() => setIsCancelling(false)} type="button">계속 참여하기</button>
              </div>
            </div>
          ) : (
            <button className="button-quiet mt-6 w-full" disabled={isSubmitting} onClick={() => setIsCancelling(true)} type="button">
              신청 취소
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="panel p-6 sm:p-7" aria-labelledby="application-title" id="application">
      <p className="eyebrow">참여 신청</p>
      <h2 className="text-2xl font-black tracking-[-0.04em]" id="application-title">
        이번 활동에 함께할까요?
      </h2>
      <div className="mt-5 flex items-center gap-3 rounded-xl bg-[var(--canvas)] p-4">
        <UsersRound aria-hidden="true" className="shrink-0 text-[var(--primary)]" size={26} />
        <p className="font-bold">
          <strong className="text-xl text-[var(--primary-strong)]">{remaining}자리</strong> 남았어요
          <span className="block text-sm font-semibold text-[var(--muted)]">현재 {participantCount}명 · 정원 {capacity}명</span>
        </p>
      </div>

      <p className="mt-5 text-[0.94rem] font-semibold leading-relaxed text-[var(--muted)]">
        {sessionState === "authenticated"
          ? "신청하면 리더가 참여 가능 여부를 확인합니다. 승인 결과와 준비 안내는 이메일과 앱 푸시 알림으로 전해드려요."
          : "신청자를 확인하고 결과를 안내하려면 로그인이 필요합니다. 모임 정보는 로그인 없이 계속 둘러볼 수 있어요."}
      </p>

      {application?.status === "REJECTED" ? (
        <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 font-bold text-amber-900" role="status">
          이전 신청은 승인되지 않았습니다. 문의가 필요하면 모임 리더에게 연락해 주세요.
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 font-bold text-[var(--primary)]" role="status" aria-live="polite">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-4 flex items-start gap-2 font-bold text-[var(--danger)]" role="alert" aria-live="assertive">
          <CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={21} />
          {error}
        </p>
      ) : null}

      <button
        className="button-primary mt-6 w-full text-lg"
        disabled={unavailable || isSubmitting}
        onClick={apply}
        type="button"
      >
        {unavailable
          ? "신청이 마감되었습니다"
          : isSubmitting
            ? "신청하고 있어요…"
            : sessionState === "authenticated"
              ? "모임 신청하기"
              : "로그인하고 신청하기"}
      </button>
      {!unavailable ? (
        <p className="mt-3 text-center text-sm font-bold text-[var(--muted)]">
          {sessionState === "authenticated"
            ? "비용 결제 없이 신청이 접수됩니다"
            : "이메일 인증 후 원래 모임으로 돌아옵니다"}
        </p>
      ) : null}
    </section>
  );
}
