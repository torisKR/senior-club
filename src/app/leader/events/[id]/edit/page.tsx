import type { Metadata } from "next";
import { ArrowLeft, PencilLine } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { LeaderEventForm } from "@/components/leader-event-form";
import {
  buildOnboardingRoute,
  hasCompletedOnboarding,
} from "@/lib/auth/post-login-route";
import { requireServerUser } from "@/lib/auth/server";
import { parseLeaderEventId } from "@/lib/leader-events/contracts";

export const metadata: Metadata = {
  title: "모임 수정",
  description: "시니어클럽 리더 전용 모임 수정 화면입니다.",
};

type EditLeaderEventPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string | string[] }>;
};

export default async function EditLeaderEventPage({
  params,
  searchParams,
}: EditLeaderEventPageProps) {
  const { id: requestedId } = await params;
  const eventId = parseLeaderEventId(requestedId);
  if (!eventId) notFound();
  const { created } = await searchParams;

  const user = await requireServerUser(
    `/leader/events/${encodeURIComponent(eventId)}/edit`,
    ["LEADER", "ADMIN"],
  );
  if (!hasCompletedOnboarding(user.onboardingCompletedAt)) {
    redirect(
      buildOnboardingRoute(
        `/leader/events/${encodeURIComponent(eventId)}/edit`,
      ),
    );
  }

  return (
    <div className="page-container page-content">
      <header className="mx-auto mb-8 max-w-4xl">
        <Link className="mb-5 inline-flex min-h-13 items-center gap-2 font-black text-[var(--primary)]" href="/leader">
          <ArrowLeft aria-hidden="true" className="size-5" />
          리더 운영실로 돌아가기
        </Link>
        <p className="eyebrow">
          <PencilLine aria-hidden="true" className="size-5" />
          모임 운영 정보
        </p>
        <h1 className="page-title">모임을 확인하고 수정하세요</h1>
        <p className="supporting-copy mt-3">
          저장·게시·취소 결과는 서버에서 다시 확인해 최신 상태로 표시합니다.
        </p>
      </header>
      <main className="mx-auto max-w-4xl">
        <LeaderEventForm
          eventId={eventId}
          initialAnnouncement={
            created === "1"
              ? "모임을 저장하고 서버의 최신 상태를 확인했습니다."
              : ""
          }
          mode="edit"
        />
      </main>
    </div>
  );
}
