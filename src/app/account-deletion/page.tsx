import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Mail, ShieldCheck, Trash2 } from "lucide-react";

import { createDraftPolicyPageMetadata } from "@/lib/seo";
import { AccountDeletionRequest } from "@/components/account-deletion-request";

export const metadata: Metadata = createDraftPolicyPageMetadata({
  title: "계정 삭제 요청",
  description: "시니어클럽(Senior Club) 계정과 연결된 개인정보 삭제 요청 방법입니다.",
  path: "/account-deletion",
});

const deletionSteps = [
  {
    title: "앱에서 요청",
    detail: "시니어클럽 앱의 내 정보 → 개인정보와 계정 → 계정 및 데이터 삭제를 선택합니다.",
  },
  {
    title: "웹에서 요청",
    detail: "앱을 삭제했어도 이 페이지에 로그인해 같은 삭제 절차를 진행할 수 있습니다.",
  },
  {
    title: "본인 확인",
    detail: "가입 휴대폰 번호와 최근 SMS 인증으로 계정 소유 여부를 확인합니다.",
  },
  {
    title: "삭제 완료",
    detail: "요청 즉시 로그인과 푸시 연결을 해제하고, 7일의 취소 기간이 지나면 계정 삭제를 진행합니다.",
  },
] as const;

export default function AccountDeletionPage() {
  return (
    <div className="page-container page-content">
      <article className="mx-auto max-w-4xl">
        <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-9">
          <p className="eyebrow">
            <Trash2 aria-hidden="true" className="size-5" />
            계정과 데이터 관리
          </p>
          <h1 className="page-title">시니어클럽 계정 삭제 요청</h1>
          <p className="mt-5 text-[18px] leading-8 text-[var(--muted)] sm:text-[19px]">
            시니어클럽(Senior Club) 계정과 연결된 개인정보를 삭제하려면 앱 안이나
            이 웹페이지를 통해 요청할 수 있습니다. 앱을 다시 설치할 필요는 없습니다.
          </p>
        </header>

        <div className="mt-6 rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-5 text-[17px] leading-7 sm:p-6 sm:text-[18px]">
          <div className="flex items-start gap-3">
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-6 shrink-0 text-[var(--accent)]"
            />
            <div>
              <strong className="font-black">출시 전 확인 안내</strong>
              <p className="mt-2">
                현재 문의 이메일은 MVP 운영 초안입니다. 정식 출시 전 실제 수신
                주소와 법정 보존·백업 처리 기준을 확정해야 합니다.
              </p>
            </div>
          </div>
        </div>

        <section aria-labelledby="deletion-request" className="mt-10">
          <h2 id="deletion-request" className="section-title">
            삭제 요청 방법
          </h2>
          <ol className="mt-5 grid gap-4 sm:grid-cols-2">
            {deletionSteps.map((step, index) => (
              <li className="panel p-5 sm:p-6" key={step.title}>
                <span className="grid size-11 place-items-center rounded-xl bg-[var(--sky-soft)] text-lg font-black text-[var(--primary-strong)]">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-xl font-black">{step.title}</h3>
                <p className="mt-3 text-[17px] leading-7 text-[var(--muted)] sm:text-[18px]">
                  {step.detail}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="deletion-email" className="mt-10">
          <h2 id="deletion-email" className="section-title">
            웹에서 바로 요청하기
          </h2>
          <AccountDeletionRequest />
          <div className="mt-5 rounded-[2rem] bg-[var(--ink)] p-6 text-white sm:p-8">
            <Mail aria-hidden="true" className="size-8 text-[var(--sun)]" />
            <p className="mt-4 text-xl font-black">로그인할 수 없는 경우</p>
            <p className="mt-3 text-[17px] leading-7 text-white/85 sm:text-[18px]">
              계정 접근 자체가 어려우면 개인정보 담당자에게 복구 또는 삭제 지원을 요청해 주세요.
              비밀번호나 신분증 전체 사진은 이메일로 보내지 마세요.
            </p>
            <a
              className="mt-6 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-center text-[18px] font-black text-[var(--ink)] sm:w-auto"
              href="mailto:privacy@clubsenior.kr?subject=%EC%8B%9C%EB%8B%88%EC%96%B4%ED%81%B4%EB%9F%BD%20%EA%B3%84%EC%A0%95%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD"
            >
              계정 접근 지원 이메일 작성
            </a>
            <p className="mt-4 text-[16px] leading-7 text-white/80 sm:text-[17px]">
              임시 문의처: privacy@clubsenior.kr — 출시 전에 실제 수신 가능한 운영
              주소로 교체해야 합니다.
            </p>
          </div>
        </section>

        <section aria-labelledby="deletion-data" className="mt-10">
          <h2 id="deletion-data" className="section-title">
            삭제되는 정보
          </h2>
          <ul className="mt-5 grid gap-3">
            {[
              "계정, 프로필, 관심사와 휴대폰 인증 정보",
              "모임 신청·승인·참석과 추천에 사용된 개인 이력",
              "계정과 연결된 채팅, 신고·차단 기록과 알림 토큰",
              "게시글, 댓글, 후기의 작성자 연결과 포함된 개인정보",
            ].map((item) => (
              <li
                className="flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[17px] leading-7 sm:p-5 sm:text-[18px]"
                key={item}
              >
                <CheckCircle2
                  aria-hidden="true"
                  className="mt-0.5 size-6 shrink-0 text-[var(--success)]"
                />
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
            공개 콘텐츠의 커뮤니티 맥락을 보존해야 하는 경우에는 개인과의 연결을
            제거한 익명 형태로 전환할 수 있습니다. 개인정보가 남아 있는 원본은
            삭제 대상입니다.
          </p>
        </section>

        <section aria-labelledby="deletion-retention" className="mt-10">
          <h2 id="deletion-retention" className="section-title">
            제한적으로 보관될 수 있는 정보
          </h2>
          <div className="soft-panel mt-5 p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <Clock3 aria-hidden="true" className="mt-1 size-7 shrink-0 text-[var(--primary)]" />
              <div>
                <p className="text-[18px] font-black">필요한 최소 정보만 분리 보관합니다.</p>
                <p className="mt-2 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
                  삭제 요청 직후 현재 로그인 세션과 등록된 푸시 토큰을 해제합니다.
                  7일 동안 다시 로그인해 요청을 취소할 수 있으며, 취소하지 않으면
                  계정 삭제 작업을 진행합니다. 법령 준수, 보안, 사기 방지 또는 분쟁
                  대응에 필요한 최소 기록과 백업 처리 기준은 출시 전 운영 정책에서
                  기간과 접근 범위를 확정해 별도로 안내합니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section aria-labelledby="deletion-security" className="mt-10">
          <h2 id="deletion-security" className="section-title">
            안전한 본인 확인
          </h2>
          <div className="panel mt-5 flex items-start gap-4 p-5 sm:p-7">
            <ShieldCheck
              aria-hidden="true"
              className="mt-1 size-7 shrink-0 text-[var(--primary)]"
            />
            <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              삭제 요청 이메일에 비밀번호, 주민등록번호, 신분증 전체 사진, 카드
              정보를 보내지 마세요. 본인 확인에 추가 정보가 꼭 필요하다면 안전한
              별도 경로와 이유를 먼저 안내합니다.
            </p>
          </div>
        </section>

        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <a className="button-secondary w-full sm:w-auto" href="/privacy">
            개인정보 처리방침 보기
          </a>
          <Link className="button-quiet w-full sm:w-auto" href="/">
            시니어클럽 홈으로
          </Link>
        </div>
      </article>
    </div>
  );
}
