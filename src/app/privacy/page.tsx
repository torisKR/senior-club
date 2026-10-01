import type { Metadata } from "next";
import { Clock3, Database, LockKeyhole, Mail, ShieldCheck, Trash2 } from "lucide-react";

import { createPublicPageMetadata } from "@/lib/seo";
import { AnalyticsSettings } from "@/components/analytics-provider";

export const metadata: Metadata = createPublicPageMetadata({
  title: "개인정보 처리방침",
  description: "시니어클럽(Senior Club)의 개인정보 수집, 이용, 보유 및 삭제 기준입니다.",
  path: "/privacy",
});

const collectedData = [
  {
    title: "계정과 프로필",
    detail:
      "카카오 계정 식별자로 회원을 인증합니다. 카카오가 제공한 닉네임은 초기 표시 이름으로 사용할 수 있으며, 이름·닉네임·전화번호 입력은 선택입니다. 프로필 설정에는 출생연도·연령대, 지역, 관심사를 사용합니다. 웹 로그인은 카카오 계정으로만 제공합니다.",
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
              <Clock3 aria-hidden="true" className="size-4" /> 시행일 2026년 7월 30일
            </span>
            <span className="tag">최종 수정 2026년 10월 2일</span>
          </div>
        </header>

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
            현재 MVP는 정밀 위치, 기기의 주소록, 통화·문자 기록, 건강 정보, 음성 녹음,
            신용카드 번호, 사용자 사진·파일을 수집하지 않습니다. 성별과 프로필 사진은
            현재 출시 범위에 없습니다. Android 앱의 배너 광고는
            Google AdMob이 처리하며, 시니어클럽 플러스 결제는 Google Play가
            결제 정보를 처리합니다. 기능이나 외부 SDK가 추가되면 수집 항목과 이
            방침도 함께 바뀝니다.
          </p>
        </section>

        <section id="analytics" aria-labelledby="privacy-analytics" className="mt-10 space-y-5">
          <h2 id="privacy-analytics" className="section-title">선택적 서비스 이용 분석</h2>
          <p className="text-[17px] leading-8 text-[var(--muted)]">
            동의한 기기에 한해 Google Analytics(Google LLC)로 페이지·화면 조회, 세션과 이용 시간을
            분석합니다. 웹 쿠키와 앱 설치 식별자, 기기·브라우저 정보가 처리될 수 있으며 Google 서버로
            전송됩니다. 이름, 전화번호, 회원 ID, 채팅·게시글 내용과 로그인 인증 값은 보내지 않습니다.
            광고 개인화와 Google Signals에는 이용하지 않습니다.
          </p>
          <p className="text-[17px] leading-8 text-[var(--muted)]">
            동의하지 않아도 서비스를 이용할 수 있습니다. 아래 설정 또는 앱의 내 정보에서 언제든
            끌 수 있습니다. 끄면 이후 분석 수집을 중단하고 이 기기의 분석 식별자를 초기화합니다.
            이미 전송된 통계가 즉시 삭제되는 것은 아닙니다. 삭제 관련 문의는 이 방침의 문의처로 보내 주세요.
            웹과 앱의 설정은 각각 저장합니다.
          </p>
          <a className="text-[var(--primary-strong)] underline" href="https://policies.google.com/privacy?hl=ko" target="_blank" rel="noreferrer">Google 개인정보 처리방침</a>
          <AnalyticsSettings />
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
              카카오 로그인, 프로필 입력, 모임 참여, 콘텐츠 작성과 고객
              문의 과정에서 정보를 제공합니다. 카카오 인증 과정에서 계정 식별자와
              제공된 닉네임을 확인하며, 카카오 비밀번호는 시니어클럽에 저장하지 않습니다. 이메일 전송,
              클라우드 호스팅·데이터베이스, 푸시 알림과 앱 빌드·배포 서비스가
              시니어클럽을 대신해 필요한 정보를 처리할 수 있습니다.
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              AWS(Amazon Web Services)는 대한민국 서울 리전에서 API와 회원·프로필·활동
              데이터베이스를 운영합니다. 회원 데이터는 계정 유지와 삭제 처리에 필요한 기간 동안
              보관하며, 데이터베이스의 순환 백업은 7일입니다. CloudFront는 요청 전달을 위해
              전 세계 엣지 서버를 사용할 수 있습니다.
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              Vercel Inc.는 웹 호스팅과 웹 로그인 요청 전달을 위해 접속 정보와 요청 데이터를
              처리합니다. Vercel의 미국 및 글로벌 인프라에서 처리될 수 있으며, 서비스 제공과
              보안에 필요한 기간 및 공급자의 보관·삭제 정책에 따라 처리합니다.
              {" "}<a className="underline" href="https://vercel.com/legal/privacy-notice" target="_blank" rel="noreferrer">Vercel 개인정보 안내</a>
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              카카오(Kakao Corp.)는 이용자가 선택한 카카오 로그인을 처리하고 계정 식별자와
              제공된 닉네임을 전달합니다. 카카오 비밀번호는 카카오에 입력하며 시니어클럽에
              저장하지 않습니다. 카카오 서비스의 보관·삭제 기준은
              {" "}<a className="underline" href="https://www.kakao.com/policy/privacy" target="_blank" rel="noreferrer">카카오 개인정보 처리방침</a>에 따릅니다.
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              Google LLC의 Firebase는 선택한 휴대폰 인증의 전화번호·인증 정보와 기기·접속
              정보를 처리합니다. Google Analytics는 이용 분석에 동의한 경우 화면·세션·설치
              식별자를 처리하며, 분석 이벤트 보관 기간은 2개월입니다. Google AdMob은 광고
              제공·측정·부정 이용 방지를 위해 IP 기반 대략적 지역, 광고·앱 설치 식별자,
              광고 상호작용과 SDK 성능 정보를 처리할 수 있습니다. 개인정보를 광고 사업자에게
              판매하지 않습니다.
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              Firebase Cloud Messaging과 Firebase Installations는 알림 등록·수신을 위해
              푸시 토큰, 설치 식별자와 앱·기기 정보를 처리합니다. 시니어클럽 서버의 푸시 등록은
              로그아웃이나 계정 삭제 요청 시 해제합니다. Google 측의 설치·알림 정보는
              Firebase의 서비스별 보관·삭제 정책에 따릅니다.
            </p>
            <p className="mt-4 text-[17px] leading-8 text-[var(--muted)] sm:text-[18px]">
              Google 서비스는 미국을 포함한 글로벌 서버에서 처리될 수 있습니다. 인증과 광고
              정보는 해당 서비스의 보관·삭제 기준에 따르며, Google Play는 앱 내 구매·복원과
              결제를 처리합니다. 시니어클럽은 카드 번호를 수집하지 않습니다.
              {" "}<a className="underline" href="https://policies.google.com/privacy?hl=ko" target="_blank" rel="noreferrer">Google 개인정보 처리방침</a>
              {" "}<a className="underline" href="https://firebase.google.com/support/privacy" target="_blank" rel="noreferrer">Firebase 개인정보 안내</a>
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
                  계정 삭제 작업을 진행합니다. 법정 보존 항목과 순환 백업은 해당
                  목적과 보관 기간이 끝나면 삭제합니다.
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
              요청할 수 있습니다. 본인 확인에는 로그인한 카카오 계정을 사용하며,
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
              className="mt-4 inline-flex min-h-14 items-center rounded-xl bg-white px-5 py-3 text-[18px] font-black text-[var(--ink)]"
              href="mailto:korea@toris.kr"
            >
              korea@toris.kr
            </a>
            <p className="mt-4 text-[16px] leading-7 text-white/85 sm:text-[17px]">
              개인정보 관련 문의는 이 이메일로 받습니다.
            </p>
          </div>
        </section>
      </article>
    </div>
  );
}
