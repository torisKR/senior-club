# 시니어클럽 Data Safety 작성 초안

기준일: 2026-09-30. 대상: Android `com.toris.seniorclub`, versionName `0.1.1`.

이 문서는 현재 소스와 공식 공급자 문서를 대조한 제출 준비 자료다. 최종 서명 AAB의 의존성·병합
manifest·실제 통신·공급자 설정과 운영 정책을 확인한 담당자가 Play Console 답변을 확정해야 한다.
공식 자료 조회와 소스 검토는 실제 SMS/푸시/구매 성공, 법률 검토, 사람의 screenshot 승인 또는 제출 증거가 아니다.

## 1. 현재 제품과 release 입력

- 웹·Android 로그인은 카카오만 제공한다. API는 Kakao 계정 ID와 제공된 닉네임을 확인한다.
  닉네임이 없으면 기본 표시 이름을 저장한다. 실명이나 별명을 직접 입력·수정하는 것은 선택이지만,
  표시 이름은 계정에 저장되며 온보딩/프로필 저장 시 길이를 검사한다. 번호 입력도 선택이다.
- 휴대폰 연락처는 인증 없이 저장·변경·삭제할 수 있다. Firebase Phone은 회원이 별도 동의 후
  요청하는 선택 인증이다. 현재 Auth 초기화는 `BILLING_NOT_ENABLED`로 거절됐고 실제 SMS/linking은
  미검증이다. 로그인/모임 이용에 인증을 요구하지 않는다. 실패한 요청도 번호·요청 정보가 공급자에
  전달되지 않았다는 증거는 아니다.
- 출생연도·지역·관심사 1~3개와 온보딩 상태를 서버에 저장하고, 신청에는 온보딩 완료가 필요하다.
  성별·프로필 사진 편집과 사용자 사진/파일 업로드는 현재 범위에 없다.
- 게시글·댓글·후기·평점·채팅은 텍스트 UGC다. 신청/승인/참석, 신고·차단/해제와 계정 삭제 요청을 처리한다.
- Android 배너 광고와 광고 제거용 일회성 상품 `seniorclub.remove_ads` 코드가 있다. 모임 참가비는
  현장 납부다. 실제 production 광고 설정·동의와 Play 상품 활성화·구매/복원 수용은 별도다.
- 운영 `EMAIL_PROVIDER`, `SMS_PROVIDER`, `PUSH_PROVIDER`는 `disabled`다. 이것은 서버 발송
  상태다. 앱 내 알림 조회, native SDK 초기화/통신, 권한 허용 후 기기 token의 API 등록을 제거하지 않는다.

근거: [현재 운영 설정](DEPLOYMENT.md), [인증 verifier](../apps/api/src/auth/kakao-token-verifier.ts),
[프로필 계약](../apps/api/src/profile/profile.contracts.ts),
[선택 인증 안내](../apps/mobile/src/screens/profile/phone-verification-card.tsx).

`app.json`과 package 버전은 0.1.1이다. 현재 workflow와 `direct-play-release.py`에는 설명/릴리스 노트
파일을 읽어 Play 등록정보에 전송하는 코드가 없다. 현재 문구는
[짧은 설명](../apps/mobile/store-listing/ko-KR/short-description.txt),
[전체 설명](../apps/mobile/store-listing/ko-KR/full-description.txt),
[0.1.1 노트](../apps/mobile/store-listing/ko-KR/release-notes-0.1.1.txt)를 사용한다.
0.1.0 노트와 `PLAY_UPLOAD_HANDOFF.md`의 2026-07-30 인수 기록은 보존한 과거 자료다.
store-listing README의 0.1.0 경로가 자동 선택을 뜻하지 않는다. Console의 실제 기존 문구는 이번 감사에서 읽지 않았다.

## 2. SDK 포함·실행·서버 발송을 구분

| 구성 | 현재 소스에서 확인한 실행 | 선언/검증에 반영할 점 |
| --- | --- | --- |
| Kakao native/core/user | 카카오 로그인과 서버 token 검증, 계정 ID·닉네임 사용 | 이메일·성별·사진을 현재 verifier가 요청/저장한다고 선언하지 않는다. 공급자 자체 처리·scope·계약은 별도 확인한다. |
| AdMob / Google Mobile Ads | billing 소유권 확인 후 광고 허용 계정에서 초기화·배너 요청. `delayAppMeasurementInit: true` | 광고 ID만으로 선언을 끝내지 않는다. SDK 처리의 진단/상호작용/위치 추정과 ID도 검토한다. |
| UMP | 광고 허용 계정에서 `gatherConsent()` → consent 정보 갱신/폼, `canRequestAds` 이후 GMA 초기화. 이전 consent 처리와 privacy-options 경로도 있음 | consent 요청은 광고 요청 전 별도 SDK 동작이다. `canRequestAds`는 광고 요청 가능 상태이며 모든 데이터 수집에 대한 단일 opt-out이 아니다. 실제 요청 필드·지역/폼 설정·동의 거절 경로는 미검증이다. |
| Firebase Auth | 회원이 선택 인증을 요청한 뒤 native module을 동적 import해 번호 인증·ID token proof를 처리 | JS import 지연과 서버 SMS outbox 비활성화가 모든 native SDK 처리 중단을 뜻하지 않는다. 번호 외 app ID·IP·인증 ID/앱 확인 정보를 고려한다. |
| expo-notifications / FCM / Firebase Installations | 로그인한 실제 Android 기기에서 알림 권한 확인 후 native token을 구해 앱 API에 등록. token 갱신과 해제 코드 있음 | app-level 등록 허용과 FCM/FIS 자동 초기화는 별개다. 소스 config에서 FCM auto-init 차단이나 FIS 삭제 호출은 확인되지 않았다. `PUSH_PROVIDER=disabled`만으로 식별자 미수집을 선언하지 않는다. |
| expo-iap / Play Billing | 앱 시작 시 연결·보유 구매 조회, 구매 요청·완료 처리·복원. 상품/구매 token을 처리하고 token은 기기 SecureStore에 저장 | 현재 결제 코드에는 영수증/token을 앱 서버에 보내는 경로가 없다. Play 거래 처리와 기기 로컬 저장을 분리해 판단한다. 실제 구매/복원 성공은 미검증이다. |
| react-native-purchases / RevenueCat | 패키지와 helper는 존재하지만 현재 `AppBillingProvider`는 expo-iap을 사용하고 helper 호출 참조는 없음 | 패키지 존재만으로 RevenueCat 계정 동기화가 실행된다고 쓰지 않는다. 최종 AAB 포함·native 초기화·실제 통신을 확인해야 미수집 판정을 확정할 수 있다. |

소스 근거: [AdsProvider](../apps/mobile/src/ads/AdsProvider.tsx),
[App config](../apps/mobile/app.config.ts), [push 등록](../apps/mobile/src/notifications/push-registration.ts),
[선택 Phone driver](../apps/mobile/src/phone-verification/native-phone-auth.native.ts),
[Billing 연결](../apps/mobile/src/billing/expo-iap-billing.ts),
[로컬 구매 token](../apps/mobile/src/billing/plus-token-store.ts).

설치된 광고 wrapper는 16.3.3이며, 소스 `9a9825b…`의 정확한 로컬 서명 AAB 내부 properties에서
GMA 25.0.0 / UMP 4.0.0 / Firebase Auth 24.2.0 / Play Billing 9.1.0을 확인했다.
[artifact 내부 버전·hash 증거](qa-evidence/20260930/android-scroll-inset-signed-candidate.json).
이는 해당 properties의 버전 기록이며 전체 SDK 목록·실제 통신·동의 처리를 증명하지 않는다. 공식 GMA 안내는
조회 당시 최신 25.5.0을 설명하므로 실제 제출 AAB의 resolved 버전/설정과 대조한다. GMA는 IP,
광고 상호작용, 성능 진단, 광고 ID·app set ID 등을 광고/분석/부정 이용 방지 목적으로 처리·공유한다고
설명한다. 별도 분석/Crashlytics 앱 코드가 없어도 GMA 진단을 제외하지 않는다.
[Google Mobile Ads 데이터 공개 안내](https://developers.google.com/admob/android/privacy/play-data-disclosure).

UMP의 consent 갱신·광고 요청 허용·privacy-options 흐름은
[공식 UMP 가이드](https://developers.google.com/admob/android/privacy)를 따른다. 이 가이드만으로
프로젝트의 실제 UMP 전송 필드나 모든 수탁·보유 조건을 확정하지 않는다.

Firebase 문서는 Auth의 IP·app ID/user-agent·사용 시 번호/인증 ID/앱 확인 token, FCM의 앱 정보와
FIS 의존성, FIS의 설치 ID 처리를 구분한다.
[Firebase Android 데이터 공개](https://firebase.google.com/docs/android/play-data-disclosure).
FCM 등록 시 식별자·설정 데이터가 업로드될 수 있으며 자동 초기화 제어는 native 설정이다.
[FCM 자동 초기화 안내](https://firebase.google.com/docs/cloud-messaging/android/get-started#prevent_auto_initialization).
Phone 인증 번호는 Google의 스팸/악용 방지 처리에도 사용될 수 있으므로 독립적인 동의와 공유 판단이
필요하다. [Firebase Phone 안내](https://firebase.google.com/docs/auth/android/phone-auth).

## 3. 데이터 유형별 제출 준비표

`수집`은 앱/SDK가 기기 밖으로 전송하는 경우를 기준으로 한다. 기기에서만 처리하는 값, 가명 ID,
사용자 직접 게시/공급자 처리의 공유 예외를 구분한다. 공유 예외·필수/선택을 임의 확정하지 않는다.
[Play Data Safety 정의와 결제 FAQ](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en).

| Play 유형 | 현재 처리와 수집 판단 | 선택성·공유 판단과 목적 |
| --- | --- | --- |
| 개인 정보 > 이름 | Kakao 닉네임 또는 기본 표시 이름과 사용자가 바꾼 이름/별명을 서버 저장 | 직접 실명/별명 입력은 선택; 표시 이름은 존재. 계정·UGC 표시 목적. 사용자 게시/호스팅 처리의 공유 예외 확인 필요 |
| 개인 정보 > 사용자 ID | Kakao 계정 ID, 내부 user/session/identity ID. 선택 Phone 사용 시 Firebase 인증 ID/proof | 계정 연결·보안에 필요. Kakao/Firebase/앱 서버 경로와 각 공급자 처리 목적 구분 |
| 개인 정보 > 전화번호 | 선택 연락처는 앱 서버에 저장. 선택 Firebase 인증 요청 시 Google 전송/proof 검증 경로 있음 | 로그인 필수 아님. 연락/선택 인증/악용 방지. Google 자체 악용 방지 처리의 공유 예외를 자동 적용하지 않음 |
| 개인 정보 > 기타 정보 | 출생연도·연령대, 관심사와 동의 기록 서버 저장 | 온보딩·추천·계정 운영 목적. UGC와 결합한 식별 가능성 포함 |
| 개인 정보 > 이메일 주소 | 현재 Kakao verifier/모바일 프로필 입력은 이메일을 수집하지 않음. 기존 DB의 nullable 이메일과 지원 메일은 별도 범위 | 과거 계정/지원 문의의 실제 수집·수신 경로 확인 필요. disabled 이메일 발송과 기존 저장 정보 보유를 구분 |
| 위치 > 대략적 위치 | 사용자가 입력한 활동 지역을 서버 저장; GMA의 IP 기반 위치 추정도 검토 대상 | 지역 추천과 광고/분석 목적 구분. 기기 위치 권한이 없어도 IP 기반 SDK 수집을 제외하지 않음 |
| 메시지 > 기타 인앱 메시지 | 채팅 텍스트 서버 저장·허용된 참여자에게 제공 | 작성은 선택. 커뮤니케이션·운영/신고. 공개 범위·차단과 사용자 직접 전송 공유 예외 확인 |
| 앱 활동 > 기타 사용자 생성 콘텐츠 | 게시글·댓글·후기·평점·신고/삭제 사유 등 서버 저장 | 작성은 선택. 콘텐츠/안전 운영; 자유 입력의 연락처 등 개인정보도 포함해 처리 |
| 앱 활동 > 앱 상호작용 | 신청·승인·참석·차단 등 서버 처리와 GMA 상호작용 수집 | 기능별 처리와 SDK 광고/분석/부정 이용 방지 공유를 분리 |
| 기기 또는 기타 ID | 광고 ID·app set ID 등 GMA 식별자 | GMA 공유 선언 검토. Android ad-ID 제어를 전체 식별자 수집의 선택성으로 확대하지 않음 |
| 기기 또는 기타 ID | FCM token, FIS 설치 ID와 Firebase 인증/앱 확인 식별자 | 앱 서버 push 등록은 권한 허용 후; native 자동 처리의 선택성은 별도. 알림·보안·SDK 운영 |
| 앱 정보 및 성능 > 진단 | GMA 성능 진단, Firebase 앱/SDK 요청 정보, 서비스 접속/오류 기록 | 안정성·광고/분석·보안. 비정상 종료 로그 등 세부 유형은 실제 SDK/전송으로 확인 |
| 금융 정보 > 구매 내역 | Play 상품/보유 구매/구매 token을 앱에서 처리·완료 요청; token은 기기 저장. 현재 앱 서버 전송 코드 없음 | 구매는 선택이지만 보유 조회는 시작 시 수행. 로컬 처리 제외와 Play 거래 처리 조건을 대조해 최종 수집/공유 답변 확정 |
| 금융 정보 > 결제 수단 | 카드 번호를 앱/앱 서버가 읽거나 저장하는 코드 없음 | Play가 사용자로부터 직접 받는 결제 정보의 제외 조건 적용 여부 확인; 구매 내역까지 일괄 미수집으로 선언하지 않음 |
| 사진·동영상 / 파일·문서 / 음성 / 주소록 / SMS·통화 기록 / 건강 / 캘린더 | 현재 사용자 업로드·읽기 기능 없음. 관련 민감 권한 차단 설정 | 직접 입력한 휴대폰 번호는 주소록 접근과 별개. 최종 병합 manifest/SDK와 UGC의 자발적 입력을 확인 |

AdMob 관련 항목은 SDK 공유를 포함해 검토한다. 앱 서버의 AWS 처리, 공개 UGC, Kakao, Firebase,
Google Play는 각 경로/목적/계약과 Play 예외 요건에 따라 판단한다. 모든 공급자에 같은 `공유: 아니요`
전제를 적용하지 않는다. Phone 기능이 차단되어도 실패 요청 전송 가능성과 번들 SDK를 빠뜨리지 않는다.

## 4. 계정 삭제·보유·암호화의 실제 범위

- 앱 경로: `내 정보 > 개인정보와 계정 > 계정 및 데이터 삭제`.
  공개 웹 경로: [계정 삭제](https://senior.toris.kr/account-deletion).
  앱 재설치 없이 Kakao 계정으로 요청하는 UI가 있다. 최근 인증과 리더/관리자의 역할 인계가 필요한
  경로도 확인한다. [계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111).
- 서버 코드는 삭제 요청 직후 모든 로그인 session을 해제하고 기기 push token을 삭제한다.
  7일 취소 기간 후 worker가 프로필을 비우고 WITHDRAWN 상태로 바꾸며 UGC 본문을 지우고,
  채팅 본문·멤버십·차단·알림·관심사·consent/auth identity 등을 삭제/정리한다.
- user ID를 가진 탈퇴 row와 일부 신청/신고/감사·운영 기록이 남을 수 있다. 전체 연결 ID의 물리 삭제나
  완전 익명화, 보안/분쟁의 법정 보존을 완료했다고 선언하지 않는다. 잔존 데이터의 목적·기간·접근·삭제를
  운영 정책과 [실제 worker 처리](../apps/api/src/account/account-deletion.service.ts)에서 확정한다.
- 이 worker에는 Firebase Auth 사용자 삭제, 외부 공급자에 앱 계정 관련 데이터 삭제 요청이나 로컬
  Plus token 삭제를 수행하는 코드가 없다. Play 요구사항에 따른 서비스 제공자 삭제 요청 절차와
  잔존 데이터의 정당한 보유 사유·기간 공개, 기기 정보 처리·복구 후 삭제 상태 재적용을 확정한다.
  앱 탈퇴가 Kakao 계정 자체나 Google Play의 독립 거래 기록 삭제를 포함한다고 안내하지 않는다.
- RDS의 현재 자동 backup 설정은 7일이다. 모든 로그/수동 snapshot/외부 공급자 데이터가 같은 기간에
  삭제된다는 보장은 아니다. 과거 초안의 30일 삭제·90일 backup 제안은 현재 SLA로 사용하지 않는다.
  7일은 취소 유예 기간이며 worker 성공/완료 통지의 보장 시간은 별도로 검증한다.
- 공개 client HTTPS와 DB의 strict TLS는 확인했다. CloudFront→ALB HTTP와 pending origin TLS가
  남아 있다. [운영 런북](DEPLOYMENT.md)과 [TLS 전환 범위](ORIGIN_TLS_HANDOFF.md)를 따라 전체
  전송 경로를 확인한 뒤 Play 암호화 답변을 확정한다. SDK의 TLS 안내를 앱 전체 경로의 증거로 쓰지 않는다.
- 공개 privacy 페이지의 수탁자/처리 국가·기간은 아직 확정 문구가 아니다. 지원/개인정보 메일의 실제
  수신, 처리 책임자·삭제 완료 통지와 공급자별 삭제 범위를 확인한다. 독립 보안 검토 인증 완료 증거는 없다.

## 5. 공급자와 남은 정보

현재 API/DB는 서울 AWS ECS/RDS, 공개 API 진입점은 CloudFront, 웹은 Vercel이다.
Kakao, Google AdMob/UMP, Firebase Auth/FCM/FIS, Google Play Billing이 현재 코드의 처리 대상이다.
GitHub Actions는 현재 direct Gradle 빌드/증거 전달 경로다. EAS를 현재 release 실행 공급자로,
Railway를 운영 DB로, Twilio를 선택 Firebase Phone 공급자로 선언하지 않는다.
Resend/Twilio/서버 FCM 발송은 disabled이고 활성화 시 별도로 갱신한다.

아래 정보가 남아 있으므로 이 문서를 제출 완료본으로 사용하지 않는다.

1. 최종 AAB의 resolved native SDK·자동 초기화/measurement·AD_ID/권한/metadata와 실제 앱 통신 목록.
   GMA/UMP consent 거절·기존 consent·Plus 보유, 알림 거절·허용, Phone 실패/성공의 처리 차이 확인.
   UMP의 정확한 전송 필드와 RevenueCat helper 미호출 시 native 전송 여부도 포함한다.
2. 각 데이터의 수집/공유·목적·필수/선택, 사용자 직접 전송/서비스 제공자/결제 처리 예외의 적용 근거.
   단순 non-personalized 광고·disabled 서버 채널·JS import 지연을 일괄 미수집 근거로 삼지 않는다.
3. 실제 운영 주체/개인정보 책임·위탁 계약·하위 처리자·처리 국가·개별 보유/삭제 기간, 공개 privacy와
   문의 수신/삭제 SLA. 서울 API/DB 위치를 모든 공급자의 한국 내 처리 보장으로 확대하지 않는다.
4. Firebase 결제/Phone provider/KR region/Admin ADC·서명 설정과 실제 인증, FCM 수신/해제,
   Play 상품 활성화·구매/보류/취소/복원·광고 제거. 현재의 미검증 상태는 [release readiness](RELEASE_READINESS.md)에 기록했다.
5. 실제 역할별 UGC·신고/차단/관리자 처리, 앱/웹 삭제 요청→취소/worker 완료→잔존 데이터·외부 공급자·
   로그/백업 처리. local DB 테스트·PITR catalog 비교는 이 운영 수용을 대신하지 않는다.
6. 실제 Console의 최신 설명/0.1.1 노트·App access·Data Safety·광고 포함(`예`)·UGC/성인 대상·
   공개 privacy/deletion URL을 대조하고 확정한다. 사용자·공급자 식별 정보와 screenshot 수동 승인값을
   이 문서에 만들거나 기록하지 않는다.
