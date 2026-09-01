"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  HeartHandshake,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Users,
} from "lucide-react";
import { useEffect, useState } from "react";

import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { postLoginRoute } from "@/lib/auth/post-login-route";
import {
  PROFILE_SESSION_SYNC_KEY,
  clearServerProfileCache,
  syncServerProfileCacheFromSession,
} from "@/lib/profile-cache";

const JOURNEY = [
  { label: "관심사를 고르고", icon: Sparkles },
  { label: "마음 맞는 사람을 만나", icon: Users },
  { label: "함께 활동해요", icon: HeartHandshake },
];

type LoginStep = "phone" | "code";

type Challenge = {
  challengeId: string;
  phoneNumber: string;
  expiresAt: string;
  retryAfterSeconds: number;
  devCode?: string;
};

type ApiErrorEnvelope = {
  error?: { message?: string; requestId?: string };
};

type SessionProfilePayload = {
  authenticated?: boolean;
  user?: {
    id?: unknown;
    name?: unknown;
    birthYear?: unknown;
    region?: unknown;
    onboardingCompletedAt?: unknown;
    interests?: unknown;
  };
};

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as ApiErrorEnvelope;
    return payload.error?.message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

function returnDestination() {
  if (typeof window === "undefined") return "/";
  return sanitizeReturnTo(
    new URLSearchParams(window.location.search).get("returnTo"),
  );
}

async function syncProfileFromSession(signal?: AbortSignal) {
  const response = await fetch("/api/auth/session", {
    credentials: "same-origin",
    cache: "no-store",
    signal,
  });
  if (!response.ok) return null;

  const session = (await response.json()) as SessionProfilePayload;
  if (syncServerProfileCacheFromSession(window.localStorage, session)) {
    try {
      window.sessionStorage.setItem(PROFILE_SESSION_SYNC_KEY, "done");
    } catch {
      // Cache synchronization is still valid without the per-tab marker.
    }
  }
  return session.authenticated === true ? session : null;
}

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<LoginStep>("phone");
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void syncProfileFromSession(controller.signal).then((session) => {
      if (!controller.signal.aborted && session) {
        router.replace(
          postLoginRoute(
            returnDestination(),
            session.user?.onboardingCompletedAt,
          ),
        );
      }
    }).catch(() => undefined);
    return () => controller.abort();
  }, [router]);

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/auth/phone/request", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as Challenge;
      setChallenge(result);
      setPhoneNumber(result.phoneNumber);
      setStep("code");
      setCode("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "인증번호를 보내지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) {
      setStep("phone");
      setError("인증번호를 다시 요청해 주세요.");
      return;
    }
    if (!termsAccepted || !privacyAccepted) {
      setError("이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/phone/verify", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          phoneNumber: challenge.phoneNumber,
          code,
          name,
          termsAccepted,
          privacyAccepted,
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const verified = (await response.json()) as SessionProfilePayload;
      clearServerProfileCache(window.localStorage);
      const synced = await syncProfileFromSession().catch(() => null);
      router.replace(
        postLoginRoute(
          returnDestination(),
          synced
            ? synced.user?.onboardingCompletedAt
            : verified.user?.onboardingCompletedAt,
        ),
      );
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "로그인을 완료하지 못했습니다.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  function editPhone() {
    setStep("phone");
    setChallenge(null);
    setCode("");
    setError("");
  }

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--canvas)] px-5 py-6 text-[var(--ink)] sm:px-8 lg:px-12"
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col">
        <header className="flex items-center justify-between gap-4 py-2">
          <a
            href="#login-card"
            className="inline-flex min-h-13 items-center gap-3 rounded-2xl px-2 text-xl font-extrabold tracking-[-0.02em] outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30"
          >
            <Image
              src="/images/senior-club-mark-v3.png"
              alt=""
              width={44}
              height={44}
              className="h-11 w-11 rounded-xl object-cover"
              priority
            />
            시니어클럽
          </a>
          <span className="rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[18px] font-bold text-[var(--muted)]">
            안전한 휴대폰 로그인
          </span>
        </header>

        <div className="grid flex-1 items-center gap-8 py-8 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16 lg:py-12">
          <section aria-labelledby="login-heading" className="max-w-2xl">
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-4 py-2 text-[18px] font-bold text-[var(--primary-strong)]">
              <Sparkles aria-hidden="true" className="h-5 w-5" />
              오늘부터 이어지는 새로운 관계
            </p>
            <h1
              id="login-heading"
              className="text-[clamp(2.5rem,7vw,5.6rem)] font-black leading-[1.03] tracking-[-0.055em]"
            >
              좋아하는 일을
              <br />
              <span className="text-[var(--primary-strong)]">함께</span> 시작해요.
            </h1>
            <p className="mt-7 max-w-xl text-[20px] leading-8 text-[var(--muted)] sm:text-[22px] sm:leading-9">
              목적이 같은 사람과 만나 활동하고, 다음 약속으로 이어지는
              시니어 커뮤니티입니다.
            </p>

            <ol className="mt-9 grid gap-3 sm:grid-cols-3" aria-label="시니어클럽 활동 과정">
              {JOURNEY.map(({ label, icon: Icon }, index) => (
                <li
                  key={label}
                  className="flex min-h-20 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[18px] font-bold"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary-strong)]">
                    <Icon aria-hidden="true" className="h-6 w-6" />
                  </span>
                  <span>
                    <span className="block text-[18px] font-extrabold text-[var(--primary-strong)]">
                      0{index + 1}
                    </span>
                    {label}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <form
            id="login-card"
            aria-labelledby="phone-login-title"
            onSubmit={step === "phone" ? requestCode : verifyCode}
            className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[0_24px_70px_rgba(34,49,39,0.10)] sm:p-9"
          >
            <div className="grid h-15 w-15 place-items-center rounded-2xl bg-[var(--primary)]/12 text-[var(--primary-strong)]">
              {step === "phone" ? (
                <ShieldCheck aria-hidden="true" className="h-8 w-8" />
              ) : (
                <Smartphone aria-hidden="true" className="h-8 w-8" />
              )}
            </div>
            <h2
              id="phone-login-title"
              className="mt-6 text-3xl font-black tracking-[-0.035em]"
            >
              {step === "phone" ? "휴대폰으로 로그인" : "인증번호 확인"}
            </h2>
            <p className="mt-3 text-[18px] leading-8 text-[var(--muted)]">
              {step === "phone"
                ? "비밀번호 대신 휴대폰으로 6자리 인증번호를 보내드립니다."
                : `${challenge?.phoneNumber ?? phoneNumber}로 보낸 6자리 번호를 입력해 주세요.`}
            </p>

            <div className="mt-7 grid gap-5">
              {step === "phone" ? (
                <>
                  <div>
                    <label className="block text-[18px] font-extrabold" htmlFor="login-phone">
                      휴대폰 번호 <span aria-hidden="true" className="text-[var(--primary-strong)]">*</span>
                    </label>
                    <input
                      autoComplete="tel"
                      className="mt-2 min-h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-4 text-[18px] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/20"
                      id="login-phone"
                      inputMode="tel"
                      maxLength={24}
                      onChange={(inputEvent) => {
                        setPhoneNumber(inputEvent.target.value);
                        setError("");
                      }}
                      placeholder="010-1234-5678"
                      required
                      type="tel"
                      value={phoneNumber}
                    />
                  </div>
                  <div>
                    <label className="block text-[18px] font-extrabold" htmlFor="login-name">
                      표시 이름 <span aria-hidden="true" className="text-[var(--primary-strong)]">*</span>
                    </label>
                    <input
                      autoComplete="name"
                      className="mt-2 min-h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-4 text-[18px] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/20"
                      id="login-name"
                      maxLength={40}
                      minLength={2}
                      onChange={(inputEvent) => {
                        setName(inputEvent.target.value);
                        setError("");
                      }}
                      placeholder="예: 김정희"
                      required
                      type="text"
                      value={name}
                    />
                  </div>
                </>
              ) : (
                <>
                  <button
                    className="inline-flex min-h-11 items-center gap-2 justify-self-start rounded-xl px-2 text-[17px] font-extrabold text-[var(--primary-strong)] outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30"
                    onClick={editPhone}
                    type="button"
                  >
                    <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                    휴대폰 번호 다시 입력
                  </button>
                  <div>
                    <label className="block text-[18px] font-extrabold" htmlFor="login-code">
                      휴대폰 인증번호 <span aria-hidden="true" className="text-[var(--primary-strong)]">*</span>
                    </label>
                    <input
                      autoComplete="one-time-code"
                      className="mt-2 min-h-16 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-4 text-center text-3xl font-black tracking-[0.28em] outline-none transition placeholder:text-[var(--muted)]/50 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/20"
                      id="login-code"
                      inputMode="numeric"
                      maxLength={6}
                      onChange={(inputEvent) => {
                        setCode(inputEvent.target.value.replace(/\D/g, "").slice(0, 6));
                        setError("");
                      }}
                      pattern="[0-9]{6}"
                      placeholder="000000"
                      required
                      value={code}
                    />
                  </div>
                  {challenge?.devCode ? (
                    <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-[17px] font-bold text-amber-900">
                      개발 환경 인증번호: <strong className="text-xl tracking-widest">{challenge.devCode}</strong>
                    </p>
                  ) : null}
                  <fieldset className="grid gap-3 rounded-2xl bg-[var(--canvas)] p-4">
                    <legend className="sr-only">필수 약관 동의</legend>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[17px] font-bold">
                      <input
                        checked={termsAccepted}
                        className="mt-1 h-5 w-5 accent-[var(--primary)]"
                        onChange={(inputEvent) => setTermsAccepted(inputEvent.target.checked)}
                        required
                        type="checkbox"
                      />
                      <span>
                        <Link className="underline underline-offset-4" href="/terms" target="_blank">서비스 이용약관</Link>에 동의합니다. (필수)
                      </span>
                    </label>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 text-[17px] font-bold">
                      <input
                        checked={privacyAccepted}
                        className="mt-1 h-5 w-5 accent-[var(--primary)]"
                        onChange={(inputEvent) => setPrivacyAccepted(inputEvent.target.checked)}
                        required
                        type="checkbox"
                      />
                      <span>
                        <Link className="underline underline-offset-4" href="/privacy" target="_blank">개인정보 처리방침</Link>에 동의합니다. (필수)
                      </span>
                    </label>
                  </fieldset>
                </>
              )}
            </div>

            {error ? (
              <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[18px] font-bold text-red-700" role="alert">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting}
              className="mt-7 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[var(--primary)] px-6 py-3 text-[19px] font-extrabold text-white shadow-lg shadow-black/10 outline-none transition hover:-translate-y-0.5 hover:bg-[var(--primary-strong)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/35 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0"
            >
              {isSubmitting ? (
                <>
                  <LoaderCircle aria-hidden="true" className="h-6 w-6 animate-spin" />
                  처리하고 있어요…
                </>
              ) : step === "phone" ? (
                <>
                  인증번호 받기
                  <ArrowRight aria-hidden="true" className="h-6 w-6" />
                </>
              ) : (
                <>
                  로그인하고 계속하기
                  <ArrowRight aria-hidden="true" className="h-6 w-6" />
                </>
              )}
            </button>

            <p className="mt-6 text-center text-[17px] leading-7 text-[var(--muted)]">
              로그인 상태는 안전한 암호화 쿠키로 유지되며, 신청 결과는 앱 알림과 등록된 연락 수단으로 안내됩니다.
            </p>
          </form>
        </div>
      </div>
    </main>
  );
}
