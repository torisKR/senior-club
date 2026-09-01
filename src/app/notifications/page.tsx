import type { Metadata } from "next";
import { BellRing } from "lucide-react";

import { NotificationList } from "@/components/notification-list";

export const metadata: Metadata = {
  title: "알림",
  description: "참가 승인, 일정, 새 메시지와 추천 모임 소식을 한곳에서 확인합니다.",
};

export default function NotificationsPage() {
  return (
    <div className="page-container page-content">
      <header className="mb-9 rounded-[var(--radius)] bg-[var(--ink)] px-5 py-7 text-white sm:px-8 sm:py-9">
        <p className="mb-2 inline-flex items-center gap-2 text-sm font-extrabold text-[var(--sky-soft)]">
          <BellRing aria-hidden="true" className="size-5" />
          내 활동 소식
        </p>
        <h1 className="page-title text-white">알림</h1>
        <p className="mt-3 max-w-2xl text-white/80">
          모임 승인과 일정 변경처럼 중요한 소식을 먼저 보여드려요.
        </p>
      </header>

      <NotificationList />
    </div>
  );
}
