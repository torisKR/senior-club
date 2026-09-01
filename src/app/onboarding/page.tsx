import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { OnboardingFlow } from "@/components/onboarding-flow";
import { sanitizeReturnTo } from "@/lib/auth/return-to";

type OnboardingPageProps = {
  searchParams: Promise<{ returnTo?: string | string[] }>;
};

export default async function OnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const requestedReturnTo = (await searchParams).returnTo;
  const returnTo = sanitizeReturnTo(
    typeof requestedReturnTo === "string" ? requestedReturnTo : null,
  );

  return (
    <main
      id="main-content"
      className="min-h-screen bg-[var(--canvas)] px-5 py-6 text-[var(--ink)] sm:px-8 sm:py-9"
    >
      <div className="mx-auto max-w-5xl">
        <header className="mb-7 flex items-center justify-between gap-4">
          <Link
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="inline-flex min-h-13 items-center gap-2 rounded-xl px-3 text-[18px] font-bold text-[var(--muted)] outline-none transition hover:bg-[var(--surface)] hover:text-[var(--ink)] focus-visible:ring-4 focus-visible:ring-[var(--primary)]/30"
          >
            <ArrowLeft aria-hidden="true" className="h-6 w-6" />
            처음으로
          </Link>
          <p className="text-[18px] font-black tracking-[-0.02em]">시니어클럽</p>
        </header>
        <OnboardingFlow returnTo={returnTo} />
      </div>
    </main>
  );
}
