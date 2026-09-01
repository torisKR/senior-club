import type { Metadata } from "next";
import { ArrowLeft, CalendarPlus2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LeaderEventForm } from "@/components/leader-event-form";
import {
  buildOnboardingRoute,
  hasCompletedOnboarding,
} from "@/lib/auth/post-login-route";
import { requireServerUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "새 모임 만들기",
  description: "시니어클럽 리더 전용 모임 작성 화면입니다.",
};

export default async function NewLeaderEventPage() {
  const user = await requireServerUser("/leader/events/new", [
    "LEADER",
    "ADMIN",
  ]);
  if (!hasCompletedOnboarding(user.onboardingCompletedAt)) {
    redirect(buildOnboardingRoute("/leader/events/new"));
  }

  return (
    <div className="page-container page-content">
      <header className="mx-auto mb-8 max-w-4xl">
        <Link className="mb-5 inline-flex min-h-13 items-center gap-2 font-black text-[var(--primary)]" href="/leader">
          <ArrowLeft aria-hidden="true" className="size-5" />
          리더 운영실로 돌아가기
        </Link>
        <p className="eyebrow">
          <CalendarPlus2 aria-hidden="true" className="size-5" />
          목적이 분명한 만남 만들기
        </p>
        <h1 className="page-title">새 모임을 만들어 보세요</h1>
        <p className="supporting-copy mt-3">
          필수 정보부터 차례로 입력하세요. 작성 중으로 저장한 뒤 다시 확인하고 게시할 수도 있습니다.
        </p>
      </header>
      <main className="mx-auto max-w-4xl">
        <LeaderEventForm mode="create" />
      </main>
    </div>
  );
}
