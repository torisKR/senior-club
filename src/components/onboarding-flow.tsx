"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  MapPin,
  PartyPopper,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { sanitizeReturnTo } from "@/lib/auth/return-to";
import { buildOnboardingRoute } from "@/lib/auth/post-login-route";
import {
  PROFILE_SESSION_SYNC_KEY,
  syncServerProfileCache,
} from "@/lib/profile-cache";

type ProfileInterest = {
  id: string;
  slug: string;
  name: string;
  icon: string;
  sortOrder?: number;
};

type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "MEMBER" | "LEADER" | "ADMIN";
  birthYear?: number | null;
  region?: string | null;
  onboardingCompletedAt: string | null;
  interests?: ProfileInterest[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; interests: ProfileInterest[]; user: SessionUser };

const REGIONS = [
  "서울",
  "부산",
  "대구",
  "인천",
  "광주",
  "대전",
  "울산",
  "세종",
  "경기",
  "강원",
  "충북",
  "충남",
  "전북",
  "전남",
  "경북",
  "경남",
  "제주",
] as const;

const INTEREST_EMOJI_BY_SLUG: Readonly<Record<string, string>> = {
  hiking: "🥾",
  photo: "📷",
  history: "🏛️",
  classical: "🎻",
  gardening: "🌿",
  "rail-travel": "🚆",
  food: "🍲",
  volunteer: "🤝",
  english: "💬",
  reading: "📚",
};

type Step = 1 | 2;

export const MIN_BIRTH_YEAR = 1900;

export function latestAdultBirthYear(
  currentYear = new Date().getUTCFullYear(),
) {
  return currentYear - 18;
}

export function parseBirthYearInput(
  value: string,
  currentYear = new Date().getUTCFullYear(),
) {
  if (!/^\d{4}$/.test(value.trim())) return null;
  const birthYear = Number(value);
  if (
    !Number.isInteger(birthYear) ||
    birthYear < MIN_BIRTH_YEAR ||
    birthYear > latestAdultBirthYear(currentYear)
  ) {
    return null;
  }
  return birthYear;
}

export function buildOnboardingLoginHref(returnTo: string) {
  const onboardingReturnTo = buildOnboardingRoute(returnTo);
  return `/login?returnTo=${encodeURIComponent(onboardingReturnTo)}` as Route;
}

async function apiMessage(response: Response) {
  try {
    const payload = (await response.json()) as {
      error?: { message?: string };
    };
    return payload.error?.message ?? "요청을 처리하지 못했습니다.";
  } catch {
    return "서버 응답을 확인하지 못했습니다.";
  }
}

function isSessionUser(value: unknown): value is SessionUser {
  if (typeof value !== "object" || value === null) return false;
  const user = value as Partial<SessionUser>;
  return (
    typeof user.id === "string" &&
    typeof user.email === "string" &&
    typeof user.name === "string" &&
    (user.role === "MEMBER" || user.role === "LEADER" || user.role === "ADMIN")
  );
}

function parseInterestCatalog(value: unknown) {
  if (typeof value !== "object" || value === null || !("data" in value)) {
    return null;
  }
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const interests = data.filter((interest): interest is ProfileInterest => {
    if (typeof interest !== "object" || interest === null) return false;
    const candidate = interest as Partial<ProfileInterest>;
    return (
      typeof candidate.id === "string" &&
      typeof candidate.slug === "string" &&
      typeof candidate.name === "string" &&
      typeof candidate.icon === "string"
    );
  });
  return interests.length > 0 ? interests : null;
}

export function OnboardingFlow({ returnTo = "/" }: { returnTo?: string }) {
  const router = useRouter();
  const safeReturnTo = sanitizeReturnTo(returnTo);
  const loginHref = buildOnboardingLoginHref(safeReturnTo);
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetch("/api/auth/session", {
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch("/api/interests", {
        credentials: "same-origin",
        signal: controller.signal,
      }),
    ])
      .then(async ([sessionResponse, interestsResponse]) => {
        if (sessionResponse.status === 401) {
          router.replace(loginHref);
          return;
        }
        if (!sessionResponse.ok) {
          throw new Error(await apiMessage(sessionResponse));
        }

        const session = (await sessionResponse.json()) as {
          authenticated?: unknown;
          user?: unknown;
        };
        if (session.authenticated !== true || !isSessionUser(session.user)) {
          router.replace(loginHref);
          return;
        }

        if (!interestsResponse.ok) {
          throw new Error(await apiMessage(interestsResponse));
        }
        const interests = parseInterestCatalog(await interestsResponse.json());
        if (!interests) {
          throw new Error("선택 가능한 관심사 목록을 확인하지 못했습니다.");
        }

        if (!controller.signal.aborted) {
          syncServerProfileCache(window.localStorage, session.user);
          try {
            window.sessionStorage.setItem(PROFILE_SESSION_SYNC_KEY, "done");
          } catch {
            // The server profile remains authoritative without this optimization.
          }
          setLoadState({ status: "ready", interests, user: session.user });
        }
      })
      .catch((caught) => {
        if (controller.signal.aborted) return;
        setLoadState({
          status: "error",
          message:
            caught instanceof Error
              ? caught.message
              : "프로필 설정을 불러오지 못했습니다.",
        });
      });

    return () => controller.abort();
  }, [loadAttempt, loginHref, router]);

  if (loadState.status === "loading") {
    return (
      <div
        aria-label="프로필 설정을 불러오는 중"
        className="h-[36rem] animate-pulse rounded-[2rem] bg-[var(--surface)]"
      />
    );
  }

  if (loadState.status === "error") {
    return (
      <section className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-7 text-center shadow-[0_24px_70px_rgba(34,49,39,0.08)] sm:p-10">
        <h1 className="text-3xl font-black tracking-[-0.04em]">
          시작 설정을 불러오지 못했어요
        </h1>
        <p className="mt-4 text-[18px] leading-8 text-[var(--muted)]" role="alert">
          {loadState.message}
        </p>
        <button
          className="mt-6 inline-flex min-h-13 items-center justify-center rounded-xl bg-[var(--primary)] px-7 py-3 text-[18px] font-extrabold text-white outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary)]/35"
          onClick={() => {
            setLoadState({ status: "loading" });
            setLoadAttempt((current) => current + 1);
          }}
          type="button"
        >
          다시 불러오기
        </button>
      </section>
    );
  }

  return (
    <OnboardingForm
      key={loadState.user.id}
      availableInterests={loadState.interests}
      loginHref={loginHref}
      returnTo={safeReturnTo}
      user={loadState.user}
    />
  );
}

function OnboardingForm({
  availableInterests,
  loginHref,
  returnTo,
  user,
}: {
  availableInterests: ProfileInterest[];
  loginHref: Route;
  returnTo: Route;
  user: SessionUser;
}) {
  const router = useRouter();
  const submitLock = useRef(false);
  const [step, setStep] = useState<Step>(1);
  const selectableSlugs = useMemo(
    () => new Set(availableInterests.map(({ slug }) => slug)),
    [availableInterests],
  );
  const [interests, setInterests] = useState<string[]>(() =>
    (user.interests ?? [])
      .map(({ slug }) => slug)
      .filter((slug) => selectableSlugs.has(slug))
      .slice(0, 3),
  );
  const [region, setRegion] = useState(user.region ?? "");
  const [birthYear, setBirthYear] = useState(
    typeof user.birthYear === "number" ? String(user.birthYear) : "",
  );
  const [name, setName] = useState(user.name);
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const selectedLabels = useMemo(
    () =>
      interests
        .map(
          (slug) =>
            availableInterests.find((interest) => interest.slug === slug)?.name,
        )
        .filter(Boolean)
        .join(", "),
    [availableInterests, interests],
  );

  function toggleInterest(id: string) {
    setError("");
    setInterests((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  }

  function goToProfileStep() {
    if (interests.length < 1 || interests.length > 3) {
      setError("관심사를 1개 이상 선택해 주세요.");
      return;
    }
    setError("");
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveProfile() {
    if (submitLock.current) return;

    const normalizedName = name.trim() || user.name.trim();
    const normalizedRegion = region.trim();
    const parsedBirthYear = parseBirthYearInput(birthYear);
    if (normalizedName.length < 2 || normalizedName.length > 40) {
      setError("이름은 2~40자로 입력해 주세요.");
      return;
    }
    if (!normalizedRegion) {
      setError("활동 지역을 선택해 주세요.");
      return;
    }
    if (parsedBirthYear === null) {
      setError(
        `${MIN_BIRTH_YEAR}년부터 ${latestAdultBirthYear()}년 사이의 출생연도를 4자리로 입력해 주세요.`,
      );
      return;
    }
    if (interests.length < 1 || interests.length > 3) {
      setError("관심사를 1~3개 선택해 주세요.");
      return;
    }

    submitLock.current = true;
    setIsSaving(true);
    setError("");
    try {
      const response = await fetch("/api/me/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: normalizedName,
          region: normalizedRegion,
          birthYear: parsedBirthYear,
          interestSlugs: interests,
        }),
      });
      if (response.status === 401) {
        router.replace(loginHref);
        return;
      }
      if (!response.ok) throw new Error(await apiMessage(response));

      const updatedProfile = (await response.json()) as SessionUser;
      syncServerProfileCache(window.localStorage, updatedProfile);
      router.replace(returnTo);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "프로필을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      );
    } finally {
      submitLock.current = false;
      setIsSaving(false);
    }
  }

  return (
    <section
      aria-labelledby="onboarding-title"
      className="overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] shadow-[0_24px_70px_rgba(34,49,39,0.08)]"
    >
      <div className="border-b border-[var(--line)] px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between gap-5">
          <p className="text-[18px] font-extrabold text-[var(--primary-strong)]">
            시작 설정 · {step}/2
          </p>
          <p className="text-[18px] font-bold text-[var(--muted)]">
            {step === 1 ? "관심사" : "기본 정보"}
          </p>
        </div>
        <div
          className="mt-4 h-3 overflow-hidden rounded-full bg-[var(--canvas)]"
          role="progressbar"
          aria-label="가입 설정 진행률"
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={step}
        >
          <div
            className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300 motion-reduce:transition-none"
            style={{ width: `${step * 50}%` }}
          />
        </div>
      </div>

      <div className="px-6 py-8 sm:px-10 sm:py-11">
        {step === 1 ? (
          <div>
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-4 py-2 text-[18px] font-extrabold text-[var(--primary-strong)]">
                <Sparkles aria-hidden="true" className="h-5 w-5" />
                맞춤 추천의 첫걸음
              </p>
              <h1
                id="onboarding-title"
                className="text-3xl font-black tracking-[-0.04em] sm:text-5xl"
              >
                무엇을 함께하고 싶으세요?
              </h1>
              <p className="mt-4 text-[19px] leading-8 text-[var(--muted)]">
                가장 마음이 가는 관심사를 1~3개 골라 주세요. 선택에 맞춰
                모임을 추천해 드릴게요.
              </p>
            </div>

            <fieldset className="mt-8">
              <legend className="sr-only">관심사 1개에서 3개 선택</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {availableInterests.map((interest) => {
                  const isSelected = interests.includes(interest.slug);
                  const isAtLimit = interests.length === 3 && !isSelected;
                  return (
                    <button
                      key={interest.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isAtLimit}
                      onClick={() => toggleInterest(interest.slug)}
                      className={`relative min-h-28 rounded-2xl border-2 p-4 text-left outline-none transition focus-visible:ring-4 focus-visible:ring-[var(--primary)]/35 ${
                        isSelected
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--ink)]"
                          : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--primary)]/50 hover:bg-[var(--canvas)]"
                      } ${isAtLimit ? "cursor-not-allowed opacity-55" : ""}`}
                    >
                      <span aria-hidden="true" className="block text-3xl">
                        {INTEREST_EMOJI_BY_SLUG[interest.slug] ?? "✦"}
                      </span>
                      <span className="mt-3 block text-[18px] font-extrabold">
                        {interest.name}
                      </span>
                      {isSelected && (
                        <span className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded-full bg-[var(--primary)] text-white">
                          <Check aria-hidden="true" className="h-4 w-4" strokeWidth={3} />
                          <span className="sr-only">선택됨</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="mt-7 flex flex-col gap-4 rounded-2xl bg-[var(--canvas)] p-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[18px] font-bold" aria-live="polite">
                <span className="text-[var(--primary-strong)]">
                  {interests.length}/최대 3개
                </span>
                {selectedLabels && (
                  <span className="ml-2 font-medium text-[var(--muted)]">
                    {selectedLabels}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={goToProfileStep}
                className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-6 py-3 text-[18px] font-extrabold text-white outline-none transition hover:bg-[var(--primary-strong)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/35"
              >
                다음
                <ArrowRight aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <div className="max-w-2xl">
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-4 py-2 text-[18px] font-extrabold text-[var(--primary-strong)]">
                <MapPin aria-hidden="true" className="h-5 w-5" />
                가까운 이웃과 만나기
              </p>
              <h1
                id="onboarding-title"
                className="text-3xl font-black tracking-[-0.04em] sm:text-5xl"
              >
                나에게 맞는 모임을 찾아볼게요
              </h1>
              <p className="mt-4 text-[19px] leading-8 text-[var(--muted)]">
                지역과 출생연도는 가까운 모임과 연령대에 맞는 활동을 추천하는
                데 사용됩니다.
              </p>
            </div>

            <div className="mt-9 grid gap-8 lg:grid-cols-2">
              <div>
                <label htmlFor="display-name" className="block text-[18px] font-extrabold">
                  불리고 싶은 이름 <span className="font-medium text-[var(--muted)]">(선택)</span>
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={name}
                  disabled={isSaving}
                  maxLength={40}
                  onChange={(event) => {
                    setName(event.target.value);
                    setError("");
                  }}
                  placeholder="예: 다정한 민수"
                  autoComplete="nickname"
                  className="mt-3 min-h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-4 text-[18px] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/20"
                />
              </div>

              <div>
                <label htmlFor="region" className="block text-[18px] font-extrabold">
                  활동 지역 <span className="sr-only">(필수)</span>
                  <span aria-hidden="true" className="text-[var(--primary-strong)]"> *</span>
                </label>
                <select
                  id="region"
                  required
                  value={region}
                  disabled={isSaving}
                  onChange={(event) => {
                    setRegion(event.target.value);
                    setError("");
                  }}
                  className="mt-3 min-h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-4 text-[18px] outline-none transition focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/20"
                >
                  <option value="">지역을 선택해 주세요</option>
                  {REGIONS.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-8 max-w-md">
              <label htmlFor="birth-year" className="block text-[18px] font-extrabold">
                출생연도 <span className="sr-only">(필수)</span>
                <span aria-hidden="true" className="text-[var(--primary-strong)]"> *</span>
              </label>
              <input
                aria-describedby="birth-year-help"
                className="mt-3 min-h-14 w-full rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] px-4 text-[18px] outline-none transition placeholder:text-[var(--muted)]/70 focus:border-[var(--primary)] focus:ring-4 focus:ring-[var(--primary)]/20"
                disabled={isSaving}
                id="birth-year"
                inputMode="numeric"
                max={latestAdultBirthYear()}
                min={MIN_BIRTH_YEAR}
                onChange={(event) => {
                  setBirthYear(event.target.value);
                  setError("");
                }}
                pattern="[0-9]{4}"
                placeholder="예: 1962"
                required
                type="number"
                value={birthYear}
              />
              <p id="birth-year-help" className="mt-2 text-[16px] font-medium text-[var(--muted)]">
                주민등록번호가 아닌 출생연도 4자리만 입력해 주세요.
              </p>
            </div>

            <div className="mt-8 rounded-2xl bg-[var(--canvas)] p-5">
              <p className="flex items-start gap-3 text-[18px] leading-7 text-[var(--muted)]">
                <PartyPopper
                  aria-hidden="true"
                  className="mt-0.5 h-6 w-6 shrink-0 text-[var(--primary-strong)]"
                />
                설정을 마치면 선택한 관심사와 지역에 어울리는 모임을 바로 보여드릴게요.
              </p>
            </div>

            <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
              <button
                type="button"
                disabled={isSaving}
                onClick={() => {
                  setError("");
                  setStep(1);
                }}
                className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl border-2 border-[var(--line)] px-6 py-3 text-[18px] font-extrabold outline-none transition hover:bg-[var(--canvas)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30"
              >
                <ArrowLeft aria-hidden="true" className="h-5 w-5" />
                이전
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void saveProfile()}
                className="inline-flex min-h-13 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-7 py-3 text-[18px] font-extrabold text-white outline-none transition hover:bg-[var(--primary-strong)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/35 disabled:cursor-wait disabled:opacity-65"
              >
                {isSaving ? (
                  <>
                    <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
                    저장하는 중
                  </>
                ) : (
                  <>
                    설정 완료하고 둘러보기
                    <ArrowRight aria-hidden="true" className="h-5 w-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[18px] font-bold text-red-700"
          >
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
