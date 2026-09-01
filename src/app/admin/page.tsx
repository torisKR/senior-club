import type { Metadata } from "next";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { AdminPanel } from "@/components/admin-panel";
import { requireServerUser } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "관리자 센터",
  description: "서비스 현황과 커뮤니티 신고를 확인하고 처리하는 관리자 화면입니다.",
};

export default async function AdminPage() {
  await requireServerUser("/admin", ["ADMIN"]);

  return (
    <div className="page-container page-content">
      <header className="mb-7">
        <Link className="mb-5 inline-flex min-h-13 items-center gap-2 font-black text-[var(--primary)]" href="/">
          <ArrowLeft aria-hidden="true" className="size-5" />
          홈으로 돌아가기
        </Link>
        <p className="eyebrow">
          <ShieldCheck aria-hidden="true" className="size-5" />
          관리자 전용
        </p>
        <h1 className="page-title">시니어클럽 운영 센터</h1>
        <p className="supporting-copy mt-3">
          중요한 운영 지표를 살피고, 회원들이 안심할 수 있도록 신고를 신속하게 처리하세요.
        </p>
      </header>

      <AdminPanel />
    </div>
  );
}
