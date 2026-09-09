import type { Metadata } from "next";
import { Clock3, Database, LockKeyhole, Mail, ShieldCheck, Trash2 } from "lucide-react";

import { createDraftPolicyPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createDraftPolicyPageMetadata({
  title: "개인정보 처리방침",
  description: "시니어클럽(Senior Club)의 개인정보 수집, 이용, 보유 및 삭제 기준입니다.",
  path: "/privacy",
});

const collectedData = [
  {
    title: "계정과 프로필",
    detail:
      "이름, 휴대폰 번호, 선택적 이메일, 출생연도·연령대, 지역, 관심사를 수집합니다. 현재 로그인 수단은 휴대폰 SMS 일회용 인증번호(OTP)입니다.",
  },
  {
    title: "활동과 콘텐츠",
    detail:
      "모임 신청·승인·참석 이력, 게시글, 댓글, 후기, 평점, 채팅, 신고와 차단 기록을 처리합니다.",
  },
  {
    title: "기기와 서비스 이용",
    detail:
      "알림을 켠 경우 푸시 토큰을 처리할 수 있습니다. Android 앱은 배너 광고를 위해 Google 광고 ID와 광고 성과 정보를 처리할 수 있습니다. 서비스 안정화를 위해 오류·접속 기록을 최소 범위에서 처리할 수 있습니다.",
  },
] as const;

const purposes = [
  "회원 인증, 프로필과 계정 관리",
  "관심사·지역·연령대·참여 이력에 맞는 커뮤니티와 모임 추천",
  "모임 신청, 승인, 일정 알림, 채팅과 후기 등 핵심 기능 제공",
  "신고 처리, 이용자 보호, 부정 이용 방지와 서비스 보안",
  "문의 응대, 장애 분석과 서비스 품질 개선",
] as const;

export default function PrivacyPage() {
  return (
    <div className="page-container page-content">
      <article className="mx-auto max-w-4xl">
        <header className="rounded-[2rem] border border-[var(--line)] bg-[var(--surface)] p-6 shadow-[var(--shadow)] sm:p-9">
          <p className="eyebrow">
            <ShieldCheck aria-hidden="true" className="size-5" />
            개인정보 안내
          </p>
          <h1 className="page-title">개인정보 처리방침</h1>
          <p className="mt-5 text-[18px] leading-8 text-[var(--muted)] sm:text-[19px]">
            시니어클럽(Senior Club)은 같은 관심사를 가진 이용자가 안전하게
            만나고 관계를 이어갈 수 있도록 필요한 정보만 처리합니다.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-[16px] font-bold text-[var(--muted)] sm:text-[17px]">
            <span className="tag">
              <Clock3 aria-hidden="true" className="size-4" /> 시행 예정일 2026년 7월 30일
            </span>
            <span className="tag">최종 수정 2026년 9월 9일</span>
          </div>
        </header>

        <div className="mt-6 rounded-2xl border border-[var(--accent)]/35 bg-[var(--accent-soft)] p-5 text-[17px] leading-7 text-[var(--ink)] sm:p-6 sm:text-[18px]">
          <strong className="font-black">출시 전 확인 안내</strong>
          <p className="mt-2">
            이 문서는 MVP 운영 기준 초안이며 법률 자문이 아닙니다. 정식 출시 전
            운영 주체, 실제 문의처, 위탁 업체, 보유 기간과 구현 내용을 확정해
            갱신해야 합니다.
          </p>
        </div>

        <section aria-labelledby="privacy-collection" className="mt-10">
          <h2 id="privacy-collection" className="section-title">
            1. 수집하는 개인정보
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {collectedData.map((item) => (
              <div className="panel p-5 sm:p-6" key={item.title}>
                <Database aria-hidden="true" className="size-7 text-[var(--primary)]" />
                <h3 className="mt-4 text-xl font-black">{item.title}</h3>
                <p className="mt-3 text-[17px] leading-7 text-[var(--muted)] sm:text-[18px]">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[17px] leading-7 text-[var(--muted)] sm:text-[18px]">
            현재 MVP는 정밀 위치, 연락처, 통화·문자 기록, 건강 정보, 음성 녹음,
            신용카드 번호, 사용자 사진·파일을 수집하지 않습니다. 성별, 프로필 사진,
            소셜 로그인도 현재 출시 범위에 없습니다. Android 앱의 배너 광고는
            Google AdMob이 처리하며, 시니어클럽 플러스 결제는 Google Play가
            결제 정보를 처리합니다. 기능이나 외부 SDK가 추가되면 수집 항목과 이
            방침도 함께 바뀝니다.
          </p>
        </section>

        <section aria-labelledby="privacy-purpose" className="mt-10">
          <h2 id="privacy-purpose" className="section-title">
            2. 이용 목적
          </h2>
          <ul className="mt-5 grid gap-3">
            {purposes.map((purpose) => (
              <li
                className="flex gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 text-[17px] leading-7 sm:p-5 sm:text-[18px]"
                key={purpose}
              >
                <span
                  aria-hidden="true"
                  className="mt-2 size-2 shrink-0 rounded-full bg-[var(--primary)]"
                />
                {purpose}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="privacy-method" className="mt-10">
          <h2 id="privacy-method" className="section-title">
            3. 수집 방법과 제3자 처리
          </h2>
          <div className="panel mt-5 p-5 sm:p-7">
            <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              회원 가입, 휴대폰 SMS 인증, 프로필 입력, 모임 참여, 콘텐츠 작성과 고객
              문의 과정에서 이용자가 직접 정보를 제공합니다. SMS·이메일 전송,
              클라우드 호스팅·데이터베이스, 푸시 알림과 앱 빌드·배포 서비스가
              시니어클럽을 대신해 필요한 정보를 처리할 수 있습니다.
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              실제 수탁자, 처리 국가, 항목과 기간은 공급자 계약을 확정한 뒤 이
              페이지에 공개합니다. Android 앱의 배너 광고는 Google AdMob이 광고
              게재와 측정에 필요한 기기 식별자를 처리할 수 있습니다. 개인정보를
              광고 사업자에게 판매하지 않습니다.
            </p>
          </div>
        </section>

        <section aria-labelledby="privacy-retention" className="mt-10">
          <h2 id="privacy-retention" className="section-title">
            4. 보유와 삭제
          </h2>
          <div className="soft-panel mt-5 p-5 sm:p-7">
            <div className="flex items-start gap-4">
              <Trash2 aria-hidden="true" className="mt-1 size-7 shrink-0 text-[var(--primary)]" />
              <div>
                <p className="text-[18px] font-black">계정 유지 중 필요한 정보를 보관합니다.</p>
                <p className="mt-2 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
                  삭제 요청 직후 로그인 세션과 등록된 푸시 토큰을 해제합니다. 요청
                  후 7일 동안 다시 로그인해 삭제를 취소할 수 있으며, 취소하지 않으면
                  계정 삭제 작업을 진행합니다. 법정 보존 항목과 순환 백업의 처리
                  기간은 출시 전 실제 운영·백업 구조에 맞게 확정해 공개합니다.
                </p>
              </div>
            </div>
            <p className="mt-5 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              법령 준수, 보안, 사기 방지 또는 분쟁 대응에 필요한 최소 기록은 해당
              목적과 기간을 알리고 별도로 제한 보관할 수 있습니다. 목적이 끝나면
              지체 없이 삭제합니다.
            </p>
          </div>
        </section>

        <section aria-labelledby="privacy-rights" className="mt-10">
          <h2 id="privacy-rights" className="section-title">
            5. 이용자의 권리와 계정 삭제
          </h2>
          <div className="panel mt-5 p-5 sm:p-7">
            <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              이용자는 자신의 개인정보를 조회·수정하고 처리 정지 또는 계정 삭제를
              요청할 수 있습니다. 본인 확인을 위해 가입 휴대폰 번호를 확인할 수 있지만
              비밀번호, 주민등록번호, 신분증 사진을 이메일로 요구하지 않습니다.
            </p>
            <a className="button-primary mt-6 w-full sm:w-auto" href="/account-deletion">
              <Trash2 aria-hidden="true" className="size-5" />
              계정 삭제 방법 보기
            </a>
          </div>
        </section>

        <section aria-labelledby="privacy-security" className="mt-10">
          <h2 id="privacy-security" className="section-title">
            6. 정보 보호
          </h2>
          <div className="panel mt-5 flex items-start gap-4 p-5 sm:p-7">
            <LockKeyhole
              aria-hidden="true"
              className="mt-1 size-7 shrink-0 text-[var(--primary)]"
            />
            <p className="text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              전송 구간 암호화, 최소 권한, 관리자 접근 통제, 비밀값 분리, 로그
              마스킹과 정기 점검을 적용합니다. 보안 사고가 발생하면 관련 법령과
              확정된 사고 대응 절차에 따라 이용자에게 알립니다.
            </p>
          </div>
        </section>

        <section aria-labelledby="privacy-children" className="mt-10">
          <h2 id="privacy-children" className="section-title">
            7. 아동의 개인정보
          </h2>
          <p className="mt-5 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
            시니어클럽은 성인을 위한 커뮤니티이며 만 14세 미만 아동을 대상으로
            하지 않습니다. 아동 정보가 잘못 수집된 사실을 확인하면 본인 또는
            보호자 확인 후 삭제합니다.
          </p>
        </section>

        <section aria-labelledby="privacy-changes" className="mt-10">
          <h2 id="privacy-changes" className="section-title">
            8. 방침 변경
          </h2>
          <p className="mt-5 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
            수집 항목, 목적 또는 보유 기준이 달라지면 시행 전에 앱과 웹사이트에서
            알립니다. 중요한 변경은 이해하기 쉬운 별도 안내로 알립니다.
          </p>
        </section>

        <section aria-labelledby="privacy-contact" className="mt-10">
          <h2 id="privacy-contact" className="section-title">
            9. 문의
          </h2>
          <div className="mt-5 rounded-[2rem] bg-[var(--ink)] p-6 text-white sm:p-8">
            <Mail aria-hidden="true" className="size-8 text-[var(--sun)]" />
            <p className="mt-4 text-xl font-black">시니어클럽 개인정보 담당자</p>
            <a
              className="mt-4 inline-flex min-h-13 items-center rounded-xl bg-white px-5 py-3 text-[18px] font-black text-[var(--ink)]"
              href="mailto:privacy@clubsenior.kr"
            >
              privacy@clubsenior.kr
            </a>
            <p className="mt-4 text-[16px] leading-7 text-white/85 sm:text-[17px]">
              임시 문의처입니다. 정식 출시 전에 실제 수신 가능한 운영 이메일과
              운영 주체의 명칭·주소·연락처로 교체해야 합니다.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
