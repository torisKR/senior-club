"use client";

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

import { Brand } from "@/components/brand";
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

function KakaoIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 3C6.477 3 2 6.477 2 10.767c0 2.766 1.874 5.188 4.707 6.556l-1.196 4.394a.5.5 0 0 0 .74.56l5.244-3.48c.168.01.336.02.505.02 5.523 0 10-3.477 10-7.767C22 6.477 17.523 3 12 3z" />
    </svg>
  );
}

function GoogleIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" {...props}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.98 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );
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
  // The OAuth callbacks redirect back with ?error=…; it is derivable from the
  // URL at first render, so it must not be pushed through an effect.
  const [error, setError] = useState(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("error") ?? "";
  });

  const allAccepted = termsAccepted && privacyAccepted;

  function toggleAllAccepted(checked: boolean) {
    setTermsAccepted(checked);
    setPrivacyAccepted(checked);
    setError("");
  }

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

  function startKakaoLogin() {
    if (!termsAccepted || !privacyAccepted) {
      setError("이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }
    const params = new URLSearchParams({
      returnTo: returnDestination(),
      termsAccepted: "1",
      privacyAccepted: "1",
    });
    window.location.assign(`/api/auth/kakao/authorize?${params.toString()}`);
  }

  function startGoogleLogin() {
    if (!termsAccepted || !privacyAccepted) {
      setError("이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }
    const params = new URLSearchParams({
      returnTo: returnDestination(),
      termsAccepted: "1",
      privacyAccepted: "1",
    });
    window.location.assign(`/api/auth/google/authorize?${params.toString()}`);
  }

  async function requestCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!termsAccepted || !privacyAccepted) {
      setError("이용약관과 개인정보 처리방침에 동의해 주세요.");
      return;
    }
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
          <Brand priority />
          <span className="hidden rounded-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-[16px] font-bold text-[var(--muted)] sm:inline-flex">
            간편하고 안전한 로그인
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

            <ol className="mt-8 grid gap-2.5 sm:grid-cols-3" aria-label="시니어클럽 활동 과정">
              {JOURNEY.map(({ label, icon: Icon }, index) => (
                <li
                  key={label}
                  className="flex min-h-16 items-center gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-[17px] font-bold"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--primary)]/10 text-[var(--primary-strong)]">
                    <Icon aria-hidden="true" className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block text-[15px] font-extrabold text-[var(--primary-strong)]">
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
              {step === "phone" ? "시작하기" : "인증번호 확인"}
            </h2>
            <p className="mt-3 text-[18px] leading-8 text-[var(--muted)]">
              {step === "phone"
                ? "카카오, Google 또는 휴대폰 번호로 안전하게 로그인하세요."
                : `${challenge?.phoneNumber ?? phoneNumber}로 보낸 6자리 번호를 입력해 주세요.`}
            </p>

            <div className="mt-7 grid gap-5">
              <fieldset className="grid gap-2.5 rounded-2xl border border-[var(--line)] bg-[var(--canvas)] p-4">
                <legend className="sr-only">필수 약관 동의</legend>
                <label className="flex min-h-12 cursor-pointer items-center gap-3 border-b border-[var(--line)] pb-3 text-[18px] font-extrabold text-[var(--ink)]">
                  <input
                    checked={allAccepted}
                    className="h-6 w-6 shrink-0 rounded accent-[var(--primary)] cursor-pointer"
                    onChange={(inputEvent) =>
                      toggleAllAccepted(inputEvent.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>모두 동의하고 시작하기</span>
                </label>
                <div className="grid gap-2 pt-1 text-[16px] text-[var(--muted)]">
                  <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 font-semibold">
                    <span className="flex items-center gap-2.5">
                      <input
                        checked={termsAccepted}
                        className="h-5 w-5 shrink-0 rounded accent-[var(--primary)] cursor-pointer"
                        onChange={(inputEvent) => {
                          setTermsAccepted(inputEvent.target.checked);
                          setError("");
                        }}
                        required={step === "code"}
                        type="checkbox"
                      />
                      <span className="text-[var(--ink)]">
                        [필수] 서비스 이용약관 동의
                      </span>
                    </span>
                    <Link
                      className="shrink-0 text-sm font-bold text-[var(--primary-strong)] underline underline-offset-4 hover:opacity-80"
                      href="/terms"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      내용보기
                    </Link>
                  </label>
                  <label className="flex min-h-10 cursor-pointer items-center justify-between gap-3 font-semibold">
                    <span className="flex items-center gap-2.5">
                      <input
                        checked={privacyAccepted}
                        className="h-5 w-5 shrink-0 rounded accent-[var(--primary)] cursor-pointer"
                        onChange={(inputEvent) => {
                          setPrivacyAccepted(inputEvent.target.checked);
                          setError("");
                        }}
                        required={step === "code"}
                        type="checkbox"
                      />
                      <span className="text-[var(--ink)]">
                        [필수] 개인정보 처리방침 동의
                      </span>
                    </span>
                    <Link
                      className="shrink-0 text-sm font-bold text-[var(--primary-strong)] underline underline-offset-4 hover:opacity-80"
                      href="/privacy"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      내용보기
                    </Link>
                  </label>
                </div>
              </fieldset>

              {error ? (
                <p
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[17px] font-bold text-red-700"
                  role="alert"
                >
                  {error}
                </p>
              ) : null}

              {step === "phone" ? (
                <>
                  <div className="grid gap-3">
                    <button
                      type="button"
                      onClick={startKakaoLogin}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#FEE500] px-6 py-3 text-[19px] font-extrabold text-[#191919] shadow-sm outline-none transition hover:bg-[#FDD800] focus-visible:ring-4 focus-visible:ring-yellow-500/30 active:scale-[0.99]"
                    >
                      <KakaoIcon className="h-6 w-6 shrink-0 text-[#191919]" />
                      카카오로 시작하기
                    </button>
                    <button
                      type="button"
                      onClick={startGoogleLogin}
                      className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-6 py-3 text-[19px] font-extrabold text-[var(--ink)] shadow-sm outline-none transition hover:bg-[var(--canvas)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30 active:scale-[0.99]"
                    >
                      <GoogleIcon className="h-6 w-6 shrink-0" />
                      Google로 시작하기
                    </button>
                  </div>

                  <div className="relative my-2 flex items-center justify-center">
                    <div className="w-full border-t border-[var(--line)]" />
                    <span className="absolute bg-[var(--surface)] px-4 text-[16px] font-bold text-[var(--muted)]">
                      또는 휴대폰 번호로 로그인
                    </span>
                  </div>

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
                    <p className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-left text-[17px] font-bold text-amber-900">
                      개발 환경 인증번호: <strong className="text-xl tracking-widest">{challenge.devCode}</strong>
                    </p>
                  ) : null}
                </>
              )}
            </div>

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
