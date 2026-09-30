# 시니어클럽 운영 배포 런북

운영 확인일: 2026-09-30. 현재 웹은 Vercel, API는 AWS ECS, DB는 Amazon RDS다. 이번 로그인 장애의 원인은 Lambda 타임아웃이 아니라 Prisma의 advisory lock 쿼리가 PostgreSQL void 결과를 역직렬화한 오류였다.

```text
Android / Vercel BFF → CloudFront → ALB → ECS API → RDS PostgreSQL
                      서울 리전 ap-northeast-2
```

## 운영 리소스와 배포 증거

| 대상 | 현재 값 |
| --- | --- |
| 웹 canonical | https://senior.toris.kr |
| 웹 보조 alias | https://clubsenior.vercel.app |
| Vercel 배포 | dpl_9fK6bmYnVLeaP9PVhbY3HCFSuYcG |
| API 공개 origin | https://d33totqtaqpyfs.cloudfront.net |
| ECS cluster / service | senior-club / senior-club-api |
| ECS task | senior-club-api:25, running 1, deployment COMPLETED |
| API image digest | sha256:a7c01a4561a39478742d0298ea8d2143c09cf2b579d0e9a0e321d60d20891314 |
| RDS | senior-club-db, PostgreSQL 18.3, encrypted, 7일 backup, deletion protection |
| Firebase project | clubsenior-app |

API health 경로는 `/healthz`, DB readiness는 `/readyz`다. `/v1/readyz`를 사용하지 않는다. 웹 BFF의 health/readiness는 `/api/healthz`, `/api/readyz`다. 실제 로그인과 QA 결과는 `QA_PRODUCTION_20260930.md`에 기록한다.

## 인증과 환경변수

카카오만 로그인 수단으로 제공한다. 이전 phone/email/Google 로그인 경로는 차단한다. 휴대폰 번호는 프로필에서 인증 없이 저장·삭제할 수 있고, Firebase 번호 인증은 선택 사항이다.

| 위치 | 설정 |
| --- | --- |
| Vercel server | `SENIOR_CLUB_API_BASE_URL`, 카카오 REST key/client secret/redirect URI |
| Vercel public | `NEXT_PUBLIC_APP_URL=https://senior.toris.kr` |
| ECS API | `NODE_ENV=production`, `KAKAO_APP_ID=1539455`, HTTPS `CORS_ORIGINS`, DB 및 독립적인 auth secrets |
| Android bundle | `EXPO_PUBLIC_APP_ENV=production`, CloudFront API URL, canonical web URL, Kakao native client key |
| Android native build | package와 일치하는 `GOOGLE_SERVICES_JSON` client file |
| 선택형 Firebase proof API | `FIREBASE_PROJECT_ID`, 권한 있는 Firebase Admin ADC |

운영 CORS에는 위 두 웹 alias만 등록되어 있다. 네이티브 요청은 Origin이 없을 수 있다. DB/auth/Admin credentials는 서버 secret store에 두고, `NEXT_PUBLIC_*`나 `EXPO_PUBLIC_*`에 넣지 않는다. Android client JSON은 서버 Admin credential이 아니다. 개발자 CLI 로그인 token을 런타임 credential로 재사용하지 않는다.

`AUTH_ACCESS_TOKEN_SECRET`, `AUTH_OTP_PEPPER`, 32바이트 OTP encryption key는 독립적으로 생성한다. 이전 OTP 데이터 처리 때문에 legacy secret 계약은 남아 있지만 OTP 로그인은 비활성화되어 있다. `AUTH_DEV_OTP_EXPOSE=false`를 유지한다.

현재 `EMAIL_PROVIDER=disabled`, `SMS_PROVIDER=disabled`, `PUSH_PROVIDER=disabled`다. 운영에서 console sender를 허용하지 않는다. 미설정 발송을 성공으로 기록하지 않는다. Resend/Twilio/FCM은 자격증명·정책·실제 수신 검증 후에만 활성화한다. Firebase Phone Auth는 이 SMS outbox 설정과 별개다.

## API 배포

Node 24.16.0 / pnpm 9.14.2 및 루트 workspace lockfile을 사용한다. API typecheck/test/build와 DB 회귀를 통과한 후 저장소 루트에서 `apps/api/Dockerfile`로 Linux amd64 image를 빌드한다.

1. ECR에 image를 push하고 변경 불가능한 repository digest를 얻는다.
2. 현재 ECS service가 사용하는 task definition을 읽는다.
3. `.github/scripts/prepare-api-task.mjs`로 production 설정, HTTPS CORS, Kakao app ID, secret reference와 digest를 검사한다. 원래 secret reference를 보존하고 emulator/legacy Google 설정을 제거한다.
4. 새 task를 등록하고 deployment circuit breaker의 rollback을 켠다.
5. 안정화 후 readiness, 기존 로그인 차단, 실제 Kakao login, refresh/프로필과 해당 새 task의 CloudWatch error를 검사한다.
6. 실패 시 직전 ECS task로 rollback한다. DB migration의 호환성은 별도로 판단한다.

`.github/workflows/deploy-main.yml`의 API job은 CI 성공 후 이 경로를 사용한다. 이 workflow의 Sites job은 별도 artifact 생성이며 Vercel live 배포를 대신하지 않는다. 현재 Vercel 웹 배포는 Vercel CLI로 수행했다.

Prisma production migration은 `migrate deploy`를 사용한다. `db push`나 seed로 운영 모임을 만들지 않는다. 빈 local PostgreSQL 17에 10개 migration과 기존 auth DB 회귀 12개를 검증했다. 추가로 전용 DB에서 카카오·프로필·역할·후기·신고 12개를 실제 실행했으며 상세 범위는 QA 보고서를 확인한다. 운영 backup 복구 훈련이나 실제 provider·기기의 모든 역할 E2E를 증명하지 않는다.

## 안전한 실제 DB QA 실행

API의 test:e2e:db 명령은 카카오 전용 정책과 맞지 않던 email OTP 테스트 실행을 대체했다. 전용 local DB가 먼저 준비되어 있어야 한다. Node 24에서 아래 explicit 환경으로 실행한다.

```sh
env NODE_ENV=test RUN_DATABASE_E2E=true \
  DATABASE_QA_URL='postgresql://postgres:senior-qa-local-only@127.0.0.1:55432/senior_role_qa_20260930?sslmode=disable' \
  DATABASE_URL='postgresql://postgres:senior-qa-local-only@127.0.0.1:55432/senior_role_qa_20260930?sslmode=disable' \
  EMAIL_PROVIDER=disabled SMS_PROVIDER=disabled PUSH_PROVIDER=disabled \
  OUTBOX_WORKER_ENABLED=false \
  pnpm --filter @senior-club/api test:e2e:db
```

위 비밀번호는 일회성 local QA fixture다. 운영 credential을 사용하지 않는다. runner는 loopback·전용 DB 이름·포트·명시적인 두 URL의 일치를 요구하고 다른 DB와 추가 URL option을 거절한다. migration/seed/test를 실행할 때 프로젝트 .env와 상속된 cloud/provider/PG/TLS credential을 전달하지 않는다. 세 suite의 실행 결과에 누락·실패·skip이 있으면 실패한다. fixture 정리는 해당 suite가 담당하며 local DB의 폐기는 생성한 QA 환경에서 수행한다.

CI의 database-quality job은 전용 PostgreSQL 17 service와 이 명령을 사용한다. main API 배포는 reusable CI 전체 성공 이후에 진행하므로 DB suite 실패도 배포를 차단한다. 현재 local 실행은 통과했으며 hosted CI 실행은 아직 관찰하지 않았다.

## 웹 배포와 QA

Vercel encrypted production environment를 유지한 채 프로젝트 루트에서 배포한다. CLI로 sensitive env를 pull하면 `[SENSITIVE]` sentinel이 반환될 수 있으므로 그 문자열을 실제 credential로 사용하지 않는다. `.vercelignore`는 env, keystore, Firebase/Admin credential과 AWS 설정의 업로드를 제외한다.

배포 후 실제 canonical 주소를 `playwright-cli`로 검사한다. `/index`로 prerender되는 home pathname을 `/`로 정규화하는 회귀가 이번 배포에 포함되어 있다. 360/390/1440px, 큰 글씨, 시간대·날짜 경계, localStorage 차단, 클라이언트 이동·뒤로가기, 로그인 오류·동의, 정책 페이지를 검사한다. 로컬 webpack build 통과만으로 원격 Turbopack/live 결과를 대신하지 않는다.

웹 OAuth는 승인된 실제 계정으로 callback·cookie·로그아웃까지 추가 검증해야 한다. Android Kakao 성공만으로 웹 BFF 인증 성공을 보고하지 않는다.

공통 색상·버튼 역할·터치 높이는 `shared/design/foundation.ts`에서 관리하고 웹 CSS adapter와 네이티브 theme이 함께 사용한다. 웹은 native OTF와 같은 Pretendard 1.3.9의 공식 variable subset을 자체 호스팅한다. 버전 경로의 font 파일은 immutable cache를 사용하며 모든 subset을 preload하지 않는다. 웹·앱의 주제 사진 7개는 byte 단위로 동일하고 실제 활동 사진이 없는 경우 참고 이미지라고 표시한다. 사진 `sizes`는 실제 container 폭을 반영한다. 최초 font 전송량 증가와 측정 한계는 QA 보고서에 함께 기록한다.

운영 웹의 27개 렌더링·이동 검사, 익명 인증 경계 15개, 페이지당 3회의 성능/이미지 검사 24개를 실행했다. OAuth 진입/상태 쿠키/취소, anonymous logout 및 보호 API 거절은 실제 배포에서 확인했지만 실제 계정의 웹 provider 로그인·token exchange를 수행한 결과는 아니다.

## Android 배포와 QA

ADB 재검사 기기: Galaxy M33, Android 16. 실제 운영 API를 사용하는 standalone release-mode QA APK를 설치했다. QA APK는 기존 기기의 데이터를 보존하기 위해 debug certificate로 서명했다. Play upload/signing artifact나 production AAB로 취급하지 않는다.

릴리스는 `apps/mobile/scripts/release-android-preflight.mjs`와 최종 스크린샷 provenance gate를 통과한 후 Android App Bundle의 package/versionCode/target36, upload 및 Play signing, **병합 manifest**를 검사한다. Expo introspection은 SDK manifest merge 결과까지 검사하지 않는다. 미서명/QA APK를 스토어에 제출하지 않는다.

현재 main 배포 workflow의 Android 호출은 `submit_to_play:false`다. binary 생성과 Play 공개는 별개다. Play 제출 전에 실제 최종 서명 AAB·Firebase certificate·정책/Data Safety·결제/푸시 검증·스크린샷을 마무리한다.

## Firebase Phone Auth의 남은 설정

- 올바른 Android app의 실제 QA SHA-1/SHA-256 등록과 native rebuild는 완료했다.
- Auth config GET은 `CONFIGURATION_NOT_FOUND`, initializeAuth는 `BILLING_NOT_ENABLED`를 반환했다.
- 권한 있는 프로젝트 결제 계정 연결 후 Authentication을 초기화하고 Phone provider와 KR SMS region policy를 설정해야 한다.
- ECS의 proof verification은 프로젝트 ID와 승인된 Admin ADC가 추가로 필요하다. FCM credential과 독립적이다.
- upload/Play signing SHA-1/SHA-256도 등록하고 실제 SMS, Play Integrity/reCAPTCHA, 만료·재발송·backend linking을 기기에서 검증해야 한다.

결제 계정이나 서버 credential을 임의 생성·추정하지 않는다. 현재 실제 SMS 성공은 미검증이다. 휴대폰 인증은 카카오 로그인이나 일반 연락처 편집을 차단하지 않는다.

## 인프라 보호와 남은 출시 조건

CloudFront가 생성한 secret origin header를 ALB forward 조건으로 검사하고 기본 응답은 403이다. ALB ingress는 CloudFront origin-facing managed prefix list만 허용한다. ECS ingress는 ALB SG, DB ingress는 기존 승인 SG/관리 IP로 제한되어 있다. direct ALB 요청 403, CloudFront readiness 200을 확인했다.

CloudFront→ALB는 아직 HTTP다. 공개 NS 조회로 `toris.kr`의 DNS 관리 서비스가 Cloudflare임을 확인했다. origin 전용 DNS 레코드와 서울 리전 ACM certificate 요청은 준비했고 `PENDING_VALIDATION`이다. 현재 CLI 인증은 DNS API에서 403을 받으므로 Cloudflare 계정 로그인/권한이 필요하다. [DNS 레코드와 HTTPS 전환 순서](ORIGIN_TLS_HANDOFF.md)를 사용한다. TLS 완료로 보고하지 않는다.

RDS public endpoint가 켜져 있으나 SG는 인터넷 전체에 개방되어 있지 않다. 운영 DB의 일회성 read-only ECS 검사에서 TLS 1.3, 인증서 검증 authorized=true, 잘못된 hostname 및 신뢰하지 않는 CA 거절을 실제 확인했다. task 25는 sslmode=verify-full과 모호하지 않은 TLS URL을 시작 시 요구하며 검증을 전역 해제하는 설정도 거절한다. [실제 DB TLS 증거](qa-evidence/20260930/database-tls-live.json)를 확인한다. private endpoint 전환·백업 복구 훈련·단일 인스턴스의 가용성 검토는 추가 작업이다.

readiness/5xx/p95/DB pool/outbox failure/계정 삭제 worker를 모니터링한다. 구조화 로그·QA 보고서에 사용자 이름·연락처·token·origin secret·Admin credential을 기록하지 않는다. 최종 출시 전에는 실제 역할별 UGC/신청·취소/채팅·차단·관리자 E2E와 웹 OAuth, SMS, 푸시·결제를 검증한다.
