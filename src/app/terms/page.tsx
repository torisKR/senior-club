import type { Metadata } from "next";
import { AlertTriangle, Handshake, ShieldCheck, Users } from "lucide-react";

import { createDraftPolicyPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createDraftPolicyPageMetadata({
  title: "서비스 이용약관",
  description: "시니어클럽(Senior Club) 서비스 이용약관 초안입니다.",
  path: "/terms",
});

const rules = [
  "다른 회원을 존중하고 위협·혐오·괴롭힘·성적 착취·사기·불법 행위를 하지 않습니다.",
  "음란물, 아동·청소년을 성적으로 착취하는 콘텐츠, 폭력 조장, 불법 거래, 스팸을 게시하거나 공유하지 않습니다.",
  "다른 사람을 사칭하거나 지식재산권을 침해하고, 허위·오해 유발 정보를 반복해서 퍼뜨리지 않습니다.",
  "모임의 장소·시간·난이도·참가비를 확인하고, 안전 안내와 리더의 운영 지침을 따릅니다.",
  "타인의 사진·연락처·대화를 동의 없이 외부에 공개하지 않습니다.",
  "문제가 생기면 신고 기능이나 운영 문의를 이용하고 긴급 상황은 관계 기관에 먼저 연락합니다.",
] as const;

export default function TermsPage() {
  return (
    <div className="page-container page-content">
      <article className="mx-auto max-w-4xl">
        <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-9">
          <p className="eyebrow">
            <Handshake aria-hidden="true" className="size-5" />
            함께 지키는 약속
          </p>
          <h1 className="page-title">시니어클럽 서비스 이용약관</h1>
          <p className="mt-5 text-[18px] leading-8 text-[var(--muted)] sm:text-[19px]">
            이 약관은 시니어클럽에서 관심사를 나누고 모임에 참여할 때 회원과
            운영자가 지켜야 할 기본 원칙을 설명합니다.
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-5 text-[17px] leading-7 sm:p-6 sm:text-[18px]">
          <div className="flex items-start gap-3">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-[var(--accent)]" />
            <p>
              <strong className="font-black">MVP 운영 초안입니다.</strong> 정식 출시 전
              운영 주체, 유료 서비스, 분쟁 처리와 관할 기준을 법률 검토 후 확정해야 합니다.
            </p>
          </div>
        </div>

        <section className="mt-10" aria-labelledby="terms-service">
          <h2 id="terms-service" className="section-title">1. 서비스와 계정</h2>
          <div className="panel mt-5 p-5 sm:p-7">
            <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              시니어클럽은 커뮤니티 탐색, 모임 신청·승인, 대화, 후기와 알림 기능을
              제공합니다. 회원은 정확한 가입 정보를 사용하고 자신의 계정 접근 정보를
              안전하게 관리해야 합니다. 운영상 필요한 경우 기능을 점검하거나 변경할 수
              있으며 중요한 변경은 앱과 웹에서 미리 안내합니다.
            </p>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="terms-community">
          <h2 id="terms-community" className="section-title">2. 안전한 커뮤니티 약속</h2>
          <ul className="mt-5 grid gap-3">
            {rules.map((rule) => (
              <li key={rule} className="flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[17px] leading-7 sm:p-5 sm:text-[18px]">
                <Users aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-[var(--primary)]" />
                {rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10" aria-labelledby="terms-moderation">
          <h2 id="terms-moderation" className="section-title">3. 운영과 이용 제한</h2>
          <div className="soft-panel mt-5 p-5 sm:p-7">
            <div className="space-y-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              <p>
                회원은 게시글·댓글·후기·채팅 등 사용자 콘텐츠를 만들기 전에 이 약관과
                커뮤니티 약속에 동의해야 합니다. 다른 회원의 콘텐츠나 계정을 앱 안에서
                신고할 수 있고, 더 이상 상호작용하고 싶지 않은 회원을 차단하거나 차단을
                해제할 수 있습니다.
              </p>
              <p>
                신고된 콘텐츠와 계정은 사실관계를 확인한 뒤 숨김, 삭제, 노출 제한,
                게시 제한 또는 계정 이용 제한 등의 조치를 할 수 있습니다. 반복 위반과
                중대한 위반은 더 엄격하게 처리하며, 긴급한 안전 위험이나 법적 의무가 있는
                경우에는 우선 조치 후 이유와 이의 제기 방법을 안내할 수 있습니다.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-10" aria-labelledby="terms-data">
          <h2 id="terms-data" className="section-title">4. 개인정보와 탈퇴</h2>
          <div className="panel mt-5 p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <ShieldCheck aria-hidden="true" className="mt-1 size-7 shrink-0 text-[var(--primary)]" />
              <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
                개인정보 처리와 보유·삭제 기준은 개인정보 처리방침을 따릅니다. 회원은
                앱의 내 정보 또는 웹 삭제 요청 페이지에서 계정과 연결 데이터의 삭제를
                요청할 수 있습니다.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <a className="button-secondary w-full sm:w-auto" href="/privacy">개인정보 처리방침</a>
              <a className="button-quiet w-full sm:w-auto" href="/account-deletion">계정 삭제 안내</a>
            </div>
          </div>
        </section>

        <p className="mt-10 text-[16px] leading-7 text-[var(--muted)] sm:text-[17px]">
          시행 예정일 및 최종 수정일: 2026년 7월 18일 · 임시 문의처:
          {" "}<a className="font-bold text-[var(--primary)] underline" href="mailto:privacy@clubsenior.kr">privacy@clubsenior.kr</a>
        </p>
      </article>
    </div>
  );
}
