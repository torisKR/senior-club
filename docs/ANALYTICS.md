# APP / senior_club 이용 분석

웹(`https://senior.toris.kr`)과 Android(`com.toris.seniorclub`)를 같은 GA4 속성에서 봅니다.
운영자가 확인할 항목은 많이 보는 페이지·화면, 방문 세션, 플랫폼별 사용량입니다.

| 이벤트 | 발생 조건 | 전달 값 | 확인 위치 |
| --- | --- | --- | --- |
| 웹 `page_view` | 동의 후 첫 화면 및 실제 경로 변경 | 고정 페이지 제목, 식별자를 제거한 경로, 공통 화면 이름 | 참여 → 페이지 및 화면 |
| 앱 `screen_view` | 동의 후 화면 이동 및 앱으로 복귀 | 고정 화면 이름, `SeniorClub` 화면 클래스 | 참여 → 페이지 및 화면 |
| `session_start`, `first_visit`/`first_open`, `user_engagement` | 동의 후 Google SDK 기본 수집 | SDK 세션·기기 정보 | 획득 → 트래픽 획득, 참여 개요 |

세션 이벤트를 직접 만들지 않습니다. 웹과 앱 이용자를 계정 ID로 합치지 않으므로 기기·브라우저별로 집계됩니다.
웹은 최초 동의 전 Google 스크립트를 로드하지 않으며 Android는 `firebase.json`에서 기본 수집을 끕니다.
홈의 선택 동의 카드와 내 정보에서 설정하며 웹은 개인정보 처리방침에서도 변경할 수 있습니다.
동의 거부는 로그인·채팅·모임 사용에 영향을 주지 않습니다. 설정은 기기에 저장하며 회원 프로필 API로 보내지 않습니다.

## 데이터 제한

- `shared/analytics/measurement.ts`의 허용된 경로만 측정합니다. 모임·게시글 ID, 커뮤니티 slug, URL query/hash와 인증 값은 전송하지 않습니다.
- 이름, 전화번호, 이메일, 회원 ID, 사용자 작성 제목·내용, 채팅과 오류 메시지는 분석에 보내지 않습니다.
- 웹의 자동 향상된 측정과 앱의 자동 Activity 화면 보고를 꺼 수동 조회와 중복되지 않도록 합니다.
- Google Signals, 광고 개인화, 광고 ID/SSAID 수집, 광고 관련 동의는 꺼 둡니다. 기존 광고 서비스 동의와 별개인 이용 분석 설정입니다.
- 끄면 이벤트 전송을 중단하고 웹 분석 쿠키/앱 분석 식별자를 초기화합니다. 이미 집계된 서버 통계가 즉시 삭제되는 동작은 아닙니다.
- Vercel 미리보기·개발 웹에서는 분석을 초기화하지 않습니다. 운영 웹의 `NEXT_PUBLIC_GA_MEASUREMENT_ID`만 사용합니다.

## 운영 확인

GA4의 실시간 개요에서 활성 사용자와 이벤트를 보고, 참여 → 페이지 및 화면에서 조회수·사용자·참여 시간을 봅니다.
획득 → 트래픽 획득에서 세션을 확인합니다. 플랫폼 또는 스트림 이름으로 웹/Android를 비교합니다.
일반 보고서 반영은 실시간보다 늦을 수 있습니다. 새 Android SDK는 앱 업데이트 설치 후 적용됩니다.

Android QA에서는 승인된 테스트 기기에 한해 `debug.firebase.analytics.app`을 설정해 DebugView로 확인하고 종료 시 제거합니다.
실제 사용자는 동의해야 집계됩니다. 광고·실제 SMS·결제 테스트와 섞지 않습니다.

## 근거

- [Google 페이지 조회 수집](https://developers.google.com/analytics/devguides/collection/ga4/views)
- [Google 동의 모드](https://developers.google.com/tag-platform/security/guides/consent)
- [React Native Firebase Analytics 설정](https://rnfirebase.io/analytics/usage)

## 생성된 속성과 스트림

- 계정 `APP`: `410406931`
- GA4 속성: `556989692` (Firebase `clubsenior-app`과 연결)
- Android 스트림: `15930901332`, 기존 Firebase 앱 `com.toris.seniorclub`
- 웹 스트림 `senior_club_web`: `15930681714`, 측정 ID `G-3DYGB4B3XL`
- [보고서](https://analytics.google.com/analytics/web/#/a410406931p556989692/reports/reportinghub)
- [DebugView](https://analytics.google.com/analytics/web/#/a410406931p556989692/debugview)

이벤트 데이터 보존은 2개월입니다. 운영 설정과 수신 검증 결과는 QA 증거에 기록합니다.
