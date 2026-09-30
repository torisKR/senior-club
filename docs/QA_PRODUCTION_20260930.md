# 운영 배포 및 Android 재검사 — 2026-09-30

ADB로 Galaxy M33 / Android 16의 실제 설치 앱을 재검사했다. 카카오 재로그인, 원본 프로필 저장과 앱 재시작 후 세션 유지가 통과했다. 웹은 Vercel production에 수정 배포 후 Playwright CLI 검사가 통과했다. **전체 출시 검증 완료는 아니다.** Firebase SMS 설정과 origin TLS, 아래 별도 출시 조건은 남아 있다.

## 실제 배포

- API: 서울 ECS `senior-club-api:25`, running 1, rollout `COMPLETED`, automatic rollback 활성화.
- Image: `sha256:a7c01a4561a39478742d0298ea8d2143c09cf2b579d0e9a0e321d60d20891314`.
- API: https://d33totqtaqpyfs.cloudfront.net
- Web: https://senior.toris.kr, Vercel `dpl_BB1p8gbJMzejdR7nv7nzQtjPvLYU`.
- QA APK: `apps/mobile/android/app/build/outputs/apk/release/app-release.apk`, 0.1.1 / versionCode 212215980 / target API 36, arm64.
- APK SHA-256: `bd35379fc93e53179698d677d5f70af26169ae5c73ece31f3ac5cbe19ffc7b17`. 기기에 설치된 base APK 해시가 이 값과 일치했다.
- APK는 standalone release 모드이며 debuggable=false다. 기존 기기 데이터를 보존하려고 **debug certificate로 서명한 QA 빌드**다. Play upload/signing artifact나 제출 AAB가 아니다. 공식 테스트 광고 ID를 사용했고 기기에서도 테스트 광고 표시를 확인했다.

## 장애 원인과 수정

1. 실제 API는 Lambda가 아닌 ECS였다. Kakao 로그인 transaction의 `$queryRaw`가 `pg_advisory_xact_lock`의 void 결과를 처리하다 Prisma P2010으로 실패했다. `$executeRaw`로 변경하고 실제 Postgres 재현·동시 로그인 회귀를 통과했다. 운영 카카오 로그인이 성공했고 새 API task의 ERROR 로그 개수는 0이었다.
2. 프로필 PATCH 후 과거 session의 이름/번호가 cache를 덮어쓰던 문제를 수정했다. profile cache와 session metadata를 함께 갱신하며 과거 profile GET이 새 저장 결과를 덮어쓰지 않게 했다.
3. 앱 초기 session 복원과 보호 화면 API가 같은 refresh token을 두 번 소비하는 경쟁 조건을 실제 HttpClient 회귀로 재현했다. session 소유자의 단일 refresh Promise로 합쳤다.
4. 운영 웹에서 SSR의 `/index`와 browser의 `/` 경로가 home navigation markup을 다르게 만들어 React #418이 발생했다. shell의 home 경로를 정규화했다. 세 회귀 테스트가 수정 전 실패하고 수정 후 통과했다.
5. Android 지난 모임 카드의 남은 좌석·신청 안내·지난 승인 대기 badge를 종료/취소 상태에 맞게 수정했다. 최종 설치 APK의 접근성 계층에 “종료된 모임”을 확인했다.
6. Expo source introspection만으로 APK 권한을 판단하지 않도록 compiled merged manifest gate를 추가하고 CI 회귀와 production Gradle build 이후 gate에 연결했다.
7. 운영 DB URL이 `sslmode=verify-full`을 사용하도록 시작 시 검사한다. 검증을 약화시키는 옵션, 중복/모호한 TLS query parameters와 `NODE_TLS_REJECT_UNAUTHORIZED=0`을 거절한다. 검증 오류에 DB URL을 노출하지 않는다. 이 변경은 API task 25에 배포했다.

## ADB 실기기 검사

| 검사 | 결과 |
| --- | --- |
| 이 기기 로그아웃 → Kakao-only 로그인 화면 | 통과, 다른 로그인 수단 없음 |
| 필수 동의 없이 로그인 클릭 | 서버 인증으로 진행하지 않고 동의 안내 표시 |
| 필수 동의 → 공식 kauth.kakao.com의 기존 계정 계속하기 → 앱 복귀 | 실제 카카오 재로그인 성공 |
| 새 세션에서 force-stop / cold start | 로그인·원래 이름·연락처·지역 유지 |
| 최종 APK 업데이트 후 해시 비교 / force-stop / cold start | 일치, 로그인 복원 성공 |
| 프로필 편집 원본 비교 및 원본 값으로 운영 API 저장 | 원본 비교 PASS, 저장 성공 표시 |
| 선택형 Phone Auth 동의 전 | 문자 요청 버튼 비활성화 |
| 정확히 `123` 입력을 확인한 뒤 인증 요청 | 로컬 번호 오류 안내, 실제 SMS 발송 없음 |
| 인증 화면 이탈 정리 | 프로필·카카오 session 유지, 동의/입력 시험 상태가 정상 화면으로 복구 |
| 홈·커뮤니티·모임·채팅·내 정보 이동 | 정상, 서버 데이터 및 실제 빈 상태 표시 |
| 운영 모임 필터 | 예정 0개, 지난 3개, 종료 상태 표시; 임의 모임 생성 없음 |
| 큰 글씨 모드 | 주요 컨트롤·탭 접근 가능, 검사 후 원래 설정 복구 |
| 최종 현재 앱 PID 로그 | FATAL EXCEPTION 0, ReactNativeJS Error 0, P2010 0 |

최종 cold activity start의 WaitTime은 959ms였다. 이는 Android Activity 시작 시간이며 사용자 화면 준비 시간이나 p95 성능 수치가 아니다. 이 실행은 부하 시험이 아니다. task 24 readiness 7회는 모두 200 / database ok, 클라이언트 왕복 중앙값 34ms였다. TLS 설정 검사만 추가한 task 25 readiness 3회도 모두 통과했고 중앙값 36ms였다. task 25의 phone/email/Google 로그인은 403, 비인증 프로필/번호 proof API는 401, 해당 새 task의 ERROR 로그는 0이었다. 실제 provider 로그인은 task 24와 최종 APK에서 검사한 결과이며 task 25에서 다시 수행했다고 주장하지 않는다.

## 실제 운영 DB TLS 검증

운영 task 24와 같은 image·secret reference·network로 API 서버를 실행하지 않는 일회성 ECS 검사를 수행했다. 사용자 데이터 대신 현재 연결의 `pg_stat_ssl`만 읽었다. 서버 인증서 검증 결과 `authorized=true`, socket 및 PostgreSQL TLS 1.3, 잘못된 hostname 거절과 신뢰하지 않는 CA 거절을 확인했고 task는 exit 0으로 종료했다. task 25는 같은 DB secret 및 CA bundle을 보존하며 위 시작 검사를 추가했다.

[DB TLS 증거](qa-evidence/20260930/database-tls-live.json), [task 25 smoke 증거](qa-evidence/20260930/api-tls-live.json). 이 검사는 백업 복구·네트워크 private 전환·부하 성능을 증명하지 않는다.

## 실제 DB 권한·데이터 검사

Node 24 / PostgreSQL 17.11의 별도 disposable DB에서 migration 10개와 seed 이후 auth/events 9개, reviews 1개, safety 2개를 실행했다. **12 passed / 0 failed / 0 skipped**다. 이전 email OTP fixture를 카카오 전용 정책으로 수정했으며 외부 KakaoTokenVerifier만 deterministic test response로 대체했다. Nest 서비스·인증 guard·Prisma transaction·session 발급은 실제 코드다.

회원, 담당 리더, 다른 리더, 관리자의 조회/승인 권한과 거절 후 DB 상태, refresh 회전과 재사용 거절, onboarding 저장/잘못된 관심사 rollback, 신청 idempotency/과거 모임 신청 거절, 이메일 없는 회원의 알림 queue, 계정 삭제 시 session 폐기 및 재인증 후 취소를 검사했다. 후기 lifecycle과 신고/차단 concurrency도 실제 DB에서 통과했다. fixtures 정리와 전용 DB 폐기를 확인했다.

실행 안전성 guard 4개는 운영/외부 DB, URL 불일치, 외부 발송 설정, credential 상속 및 skip 결과를 거절한다. CI에는 같은 전용 DB job을 추가했다. [실제 local DB 검사 증거](qa-evidence/20260930/database-roles-local.json)의 source hash를 parent가 다시 확인했다. local 통과와 hosted CI 관찰은 별개이며 공개 저장소 push가 보류되어 hosted 실행은 아직 없다. 운영 데이터 변경, 실제 역할별 웹/앱 UI E2E나 외부 카카오 provider 증거로 보고하지 않는다.

ADB 조작은 fresh UI hierarchy와 현재 foreground package를 확인했다. 다른 앱이 화면을 차지하면 입력을 거절했다. 개인 프로필 원본·원시 logcat·provider UI는 비공개 임시 파일에만 보존하고 이 보고서에는 포함하지 않았다. 기기 알림 권한 등 기존 선호를 변경하지 않았다.

## Playwright CLI 운영 웹 검사

4개 조건으로 각 5개 공개 페이지를 확인했다: Seoul 1440px 기본 글씨, LA 390px 큰 글씨+가짜 로컬 cache, UTC 360px 큰 글씨+날짜 경계, Seoul 390px 저장소 접근 차단. `/`, `/events`, `/clubs`, `/login?error=...`, `/privacy`와 client 이동·뒤로가기 및 font toggle을 검사했다.

- 공개 페이지 20개 + 화면 이동/설정 흐름 7개 통과.
- page error 0, console error 0, horizontal overflow 0, 실패 0.
- BFF session/interests 응답 200.
- 가짜 cache는 비인증 렌더링 fixture이며 실제 session으로 취급하지 않았다. 실제 계정/프로필 쓰기 0회.
- 원격 Next.js 16.3.4 Turbopack build와 실제 alias에서 검증했다. 로컬 webpack 결과로 운영 성공을 대신하지 않았다.
- [운영 웹 증거](qa-evidence/20260930/web-live.json), [API smoke 증거](qa-evidence/20260930/api-live.json).

## 코드와 artifact 검증

| 범위 | 통과 결과 |
| --- | --- |
| 웹 최종 source | 484 tests / TypeScript / ESLint / local production build |
| API 최종 source | 381 passed, 24 skipped / TypeScript; TLS env 회귀 90개. runtime TLS source build와 배포 통과 |
| 실제 local PostgreSQL auth | migration 10개, auth regression 12개 |
| 추가 실제 local DB 역할/후기/신고 | auth/events 9 + reviews 1 + safety 2 = 12 passed, 0 skipped |
| DB 실행 안전성 guard | 4 passed; root ESLint와 CI YAML/전용 DB 계약 검사 통과 |
| 모바일 최종 source | 273 tests / TypeScript / ESLint |
| 새 compiled manifest 회귀 | 33 tests |
| compiled release manifest | allowlist 권한 34개, 정확한 exported component 10개 |
| Play production workflow 계약 | 5 tests |
| 최종 root ESLint / diff whitespace | 통과 |
| 최종 native APK | Gradle release build / apksigner / 설치 hash 일치 |

manifest export 10개는 intent가 제한된 activity 4개와 권한으로 보호된 SDK component 6개다. Firebase reCAPTCHA/IDP callback을 임의 제거하지 않는다. camera/contacts/location/storage/SMS/audio 권한, unknown export, debug/backup/cleartext, 약화된 SDK protection을 거절하는 회귀가 포함된다. 이것은 최종 Play AAB 또는 모든 SDK 동작의 안전성을 포괄적으로 증명하지 않는다.

## 남은 운영 설정과 별도 출시 조건

- Firebase `clubsenior-app`: actual QA SHA-1/SHA-256 등록 및 native rebuild 완료. Auth config 초기화는 `BILLING_NOT_ENABLED`로 거절됨. 사용할 결제 계정, Phone provider/KR region policy와 서버 Admin ADC가 필요함. 실제 SMS/번호 linking, Play signing SHA는 미검증.
- 웹 OAuth callback/HttpOnly cookie/로그아웃의 실제 계정 E2E는 별도다. Android Kakao 성공으로 이를 대체하지 않음.
- CloudFront→ALB는 HTTP. direct origin 403과 CloudFront prefix ingress는 적용했으나 origin DNS/ACM을 통한 HTTPS 전환은 남아 있음. Cloudflare DNS 로그인/권한이 필요하며 서울 ACM 인증서는 `PENDING_VALIDATION`. [정확한 DNS 레코드와 전환 순서](ORIGIN_TLS_HANDOFF.md).
- RDS encrypted/backup/deletion protection 및 실제 strict DB certificate verification 확인. public endpoint는 켜져 있으며 SG는 전체 인터넷에 개방되지 않음. private 전환과 backup restore 훈련은 남아 있음.
- 이메일/SMS outbox/FCM 채널은 disabled. 회원/리더/관리자 신청·승인·취소와 후기/신고는 위 local DB 범위를 통과했다. 외부 알림 수신, 실제 Plus 구매/복원, 역할별 운영 웹/앱 UI에서의 신청·취소/UGC/채팅/신고/관리자 E2E, 최종 서명 AAB/Play screenshot provenance와 Play 공개는 이번 재검사에서 완료하지 않음.
- 화면 구조·접근성 상태는 XML/DOM으로 검사했다. 이 환경에서 screenshot pixels의 시각 검토는 수행하지 못했으므로 이미지 미감의 최종 승인으로 보고하지 않는다.

[운영 런북](DEPLOYMENT.md), [선택형 번호 인증 설정](../apps/mobile/src/phone-verification/NATIVE_SETUP.md).
