import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CircleHelp, Compass, ShieldCheck, UsersRound } from "lucide-react";

import { JsonLd } from "@/components/json-ld";
import {
  createAboutPageJsonLd,
  createFaqPageJsonLd,
  createPublicPageMetadata,
} from "@/lib/seo";

export const metadata: Metadata = createPublicPageMetadata({
  title: "서비스 안내와 자주 묻는 질문",
  description:
    "시니어클럽이 어떤 서비스인지, 모임 신청과 로그인·알림·안전 기능을 어떻게 이용하는지 안내합니다.",
  path: "/about",
});

const steps = [
  {
    title: "목적을 고릅니다",
    detail: "등산, 사진, 역사, 클래식, 원예처럼 함께하고 싶은 관심사를 선택합니다.",
  },
  {
    title: "사람과 모임을 찾습니다",
    detail: "지역, 일정, 난이도, 정원과 참가비를 확인하고 맞는 모임을 신청합니다.",
  },
  {
    title: "활동 후 관계를 잇습니다",
    detail: "승인된 참여자는 모임 채팅과 후기를 통해 다음 약속으로 관계를 이어갑니다.",
  },
] as const;

const faqEntries = [
  {
    question: "시니어클럽은 어떤 서비스인가요?",
    answer:
      "시니어클럽은 관심사와 지역을 바탕으로 시니어와 중장년이 모임을 찾고, 함께 활동한 뒤 채팅과 후기로 관계를 이어가는 목적 중심 커뮤니티입니다.",
  },
  {
    question: "회원가입 없이 모임을 볼 수 있나요?",
    answer:
      "공개된 커뮤니티와 모임 정보는 로그인 없이 볼 수 있습니다. 모임 신청, 채팅, 후기, 알림 설정처럼 회원 기록과 연결되는 기능은 휴대폰 SMS 인증 로그인이 필요합니다.",
  },
  {
    question: "모임 신청에 로그인이 필요한 이유는 무엇인가요?",
    answer:
      "신청자 본인 확인, 중복 신청 방지, 리더의 승인 처리, 일정 변경과 승인 결과의 푸시 안내, 참여자만 작성할 수 있는 후기 확인을 위해 로그인 계정이 필요합니다.",
  },
  {
    question: "모임 참가비는 얼마인가요?",
    answer:
      "참가비는 모임마다 다릅니다. 무료 모임과 유료 모임 모두 있을 수 있으며, 신청 전에 각 모임 상세 화면에서 금액과 준비물을 확인할 수 있습니다.",
  },
  {
    question: "웹과 안드로이드 앱에서 같은 계정을 쓸 수 있나요?",
    answer:
      "같은 휴대폰 번호로 로그인하면 웹과 안드로이드 앱의 신청 정보와 알림 설정을 같은 회원 계정에 연결하도록 설계되어 있습니다.",
  },
  {
    question: "어떤 정보가 실제 공개 모임 데이터인가요?",
    answer:
      "모임 목록과 상세의 일정, 장소, 정원, 참가비와 모집 상태, 커뮤니티 목록·상세와 공개 게시글·댓글은 서비스 API의 실제 데이터를 사용합니다. 게시글과 댓글 작성은 로그인하고 관심사·활동 지역 시작 설정을 마친 회원에게만 열립니다.",
  },
  {
    question: "계정과 개인정보는 어떻게 삭제하나요?",
    answer:
      "앱의 내 정보 또는 웹 계정 삭제 페이지에서 본인 인증 후 삭제를 요청할 수 있습니다. 요청 즉시 로그인 세션과 푸시 토큰이 해제되며 유예 기간에는 다시 로그인해 취소할 수 있습니다.",
  },
] as const;

export default function AboutPage() {
  return (
    <div className="page-container page-content">
      <JsonLd data={createAboutPageJsonLd()} />
      <JsonLd data={createFaqPageJsonLd(faqEntries)} />

      <article className="mx-auto max-w-5xl">
        <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-10">
          <p className="eyebrow">
            <Compass aria-hidden="true" className="size-5" />
            목적 → 사람 → 활동 → 관계
          </p>
          <h1 className="page-title">시니어클럽은 어떤 서비스인가요?</h1>
          <p className="mt-5 max-w-4xl text-[18px] leading-8 text-[var(--muted)] sm:text-[20px] sm:leading-9">
            시니어클럽은 관심사가 같은 시니어와 중장년이 가까운 모임에서 만나 함께
            활동하고, 채팅과 후기로 다음 관계를 이어가도록 돕는 목적 중심 커뮤니티입니다.
            공개 모임 정보는 누구나 볼 수 있고 신청과 알림은 본인 인증 계정에
            연결합니다. 개발용 예시 화면은 실제 운영 정보와 구분해 표시합니다.
          </p>
          <p className="mt-4 text-sm font-bold text-[var(--muted)]">
            서비스 안내 마지막 업데이트: <time dateTime="2026-07-30">2026년 7월 30일</time>
          </p>
        </header>

        <section aria-labelledby="service-flow" className="mt-12">
          <p className="eyebrow">
            <UsersRound aria-hidden="true" className="size-5" />
            이용 흐름
          </p>
          <h2 className="section-title" id="service-flow">관심사 선택부터 다음 약속까지</h2>
          <ol className="mt-6 grid gap-4 md:grid-cols-3">
            {steps.map((step, index) => (
              <li className="panel p-6" key={step.title}>
                <span className="grid size-11 place-items-center rounded-xl bg-[var(--sky-soft)] text-lg font-black text-[var(--primary-strong)]">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-xl font-black">{step.title}</h3>
                <p className="mt-3 text-[17px] leading-8 text-[var(--muted)]">{step.detail}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="trust" className="mt-12 grid gap-5 md:grid-cols-2">
          <div className="soft-panel p-6 sm:p-8">
            <BellRing aria-hidden="true" className="size-8 text-[var(--primary)]" />
            <h2 className="mt-4 text-2xl font-black" id="trust">신청 결과를 놓치지 않게</h2>
            <p className="mt-3 text-[17px] leading-8 text-[var(--muted)]">
              모임 신청과 승인 상태는 회원 계정에 저장됩니다. 알림을 허용한 회원에게는
              승인, 일정 변경과 후기 요청을 푸시 채널로 안내하도록 설계했습니다. 이메일 알림을 선택한 회원에게는
              등록한 이메일로도 안내할 수 있습니다.
            </p>
          </div>
          <div className="soft-panel p-6 sm:p-8">
            <ShieldCheck aria-hidden="true" className="size-8 text-[var(--primary)]" />
            <h2 className="mt-4 text-2xl font-black">회원과 개인정보를 안전하게</h2>
            <p className="mt-3 text-[17px] leading-8 text-[var(--muted)]">
              로그인 세션, 역할별 권한, 신고와 차단, 참여자 후기 제한을 적용합니다. 회원은
              앱 또는 웹에서 계정 삭제를 요청하고 유예 기간 안에 취소할 수 있습니다.
            </p>
          </div>
        </section>

        <section aria-labelledby="faq" className="mt-12">
          <p className="eyebrow">
            <CircleHelp aria-hidden="true" className="size-5" />
            자주 묻는 질문
          </p>
          <h2 className="section-title" id="faq">이용 전에 궁금한 점</h2>
          <div className="mt-6 grid gap-4">
            {faqEntries.map((entry) => (
              <details className="panel group p-5 sm:p-6" key={entry.question}>
                <summary className="cursor-pointer list-none text-[19px] font-black leading-8 marker:hidden">
                  {entry.question}
                </summary>
                <p className="mt-4 border-t border-[var(--line)] pt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
                  {entry.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-12 flex flex-col gap-3 sm:flex-row">
          <Link className="button-primary w-full sm:w-auto" href="/events">모임 둘러보기</Link>
          <Link className="button-secondary w-full sm:w-auto" href="/account-deletion">계정 삭제 안내</Link>
        </div>
      </article>
    </div>
  );
}
