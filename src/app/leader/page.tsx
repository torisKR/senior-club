import type { Metadata, Route } from "next";
import { ArrowLeft, CalendarPlus2, ClipboardCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { LeaderPanel } from "@/components/leader-panel";
import {
  buildOnboardingRoute,
  hasCompletedOnboarding,
} from "@/lib/auth/post-login-route";
import { requireServerUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "리더 운영실",
  description: "모임 참가 신청과 당일 출석을 관리하는 리더 화면입니다.",
};

export default async function LeaderPage() {
  const user = await requireServerUser("/leader", ["LEADER", "ADMIN"]);
  if (!hasCompletedOnboarding(user.onboardingCompletedAt)) {
    redirect(buildOnboardingRoute("/leader"));
  }

  return (
    <div className="page-container page-content">
      <header className="mb-7">
        <Link className="mb-5 inline-flex min-h-13 items-center gap-2 font-black text-[var(--primary)]" href="/">
          <ArrowLeft aria-hidden="true" className="size-5" />
          홈으로 돌아가기
        </Link>
        <p className="eyebrow">
          <ClipboardCheck aria-hidden="true" className="size-5" />
          리더 운영실
        </p>
        <h1 className="page-title">오늘 할 일을 한눈에</h1>
        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <p className="supporting-copy m-0">
            모임을 만들고 참가 신청을 확인하며, 시작한 모임의 실제 출석까지 안전하게 기록하세요.
          </p>
          <Link className="button-primary shrink-0" href={"/leader/events/new" as Route}>
            <CalendarPlus2 aria-hidden="true" className="size-5" />
            새 모임 만들기
          </Link>
        </div>
      </header>

      <LeaderPanel />
    </div>
  );
}
