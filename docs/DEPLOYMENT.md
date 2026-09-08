# 시니어클럽 프로덕션 배포 런북

MVP의 기준 구성은 비용과 운영 복잡도를 낮춘 서울 리전의 단일 API 구조다.

```text
Android 앱 ─┐
            ├─ HTTPS ─ ECS API 1개 ─ Railway PostgreSQL
ChatGPT Sites 웹 ──┘                │
                            ├─ Resend 이메일
                             ├─ Twilio SMS
                             └─ Firebase Cloud Messaging
```

Redis는 첫 단일 API 인스턴스에서는 사용하지 않는다. Socket.IO를 둘 이상의 인스턴스로 확장하거나
분산 presence가 필요해질 때 관리형 Redis adapter를 추가한다. 알림 outbox와 계정 삭제 작업의 진실의
원본은 PostgreSQL이다.

## 1. 출시 전 필수 준비

- GitHub 저장소, 보호된 `main` 브랜치, GitHub Actions 실행 권한
- ChatGPT Sites 프로젝트와 고정 production HTTPS 도메인
- Railway 프로젝트, API 서비스, PostgreSQL 서비스와 백업 정책
- 검증된 발신 도메인이 있는 Resend 계정
- Twilio Messaging Service 또는 검증된 Twilio 발신번호
- Android 앱과 연결된 Firebase 프로젝트, Firebase Admin 서비스 계정, EAS/Android FCM 자격 증명
- Play App Signing, privacy/terms/account-deletion 공개 URL, 최종 AAB와 스토어 스크린샷
- 검증된 Prisma baseline migration

baseline SQL은 `prisma/migrations/20260729210000_init/migration.sql`에 생성돼 있다. 다만 빈
PostgreSQL 전체 적용, 대표 seed 데이터, 직전 schema에서의 업그레이드와 rollback 가능성을 실제 DB에서
검증하기 전에는 production DB에 적용하지 않는다. production에서 `prisma db push`를 사용하지 않는다.

실제 값은 저장소 파일에 기록하지 않는다. 로컬 키 이름은 [`.env.example`](../.env.example)을
기준으로 하되 ChatGPT Sites, ECS, GitHub Environment, EAS의 encrypted environment에 각각 저장한다.

## 2. 환경변수 배치

| 위치 | 필요한 값 | 주의 사항 |
| --- | --- | --- |
| ChatGPT Sites Web | `NEXT_PUBLIC_APP_URL`, `SENIOR_CLUB_API_BASE_URL` | API URL은 서버 전용이다. DB·FCM·인증 secret을 `NEXT_PUBLIC_*`로 만들지 않는다. |
| ECS API | 아래 API production 변수 전체 | Railway가 주입하는 `PORT`를 사용하며 실제 secret을 이미지에 bake하지 않는다. |
| EAS Build | `EXPO_PUBLIC_APP_ENV=production`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | 세 값은 앱 번들에 노출된다. 서버 secret과 서비스 계정 JSON을 넣지 않는다. |
| GitHub CI | workflow의 테스트 전용 placeholder | production secret을 repository variable이나 로그에 노출하지 않는다. |
| GitHub `play-internal` Environment | secret `EXPO_TOKEN`, secret `GOOGLE_SERVICES_JSON_BASE64`, variables `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | required reviewer를 권장한다. Firebase client JSON은 runner 임시 파일에만 복원한다. |
| GitHub `play-store-production` Environment | 위와 동일한 secret/variable | `main` push production draft 제출용. required reviewer를 권장한다. |

ECS API에는 다음 값을 등록한다.

```dotenv
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_POOL_MAX=5
DATABASE_CONNECT_TIMEOUT_MS=1500
DATABASE_IDLE_TIMEOUT_MS=10000
READINESS_TIMEOUT_MS=2000
CORS_ORIGINS=https://실제-웹-도메인

AUTH_ACCESS_TOKEN_SECRET=<독립적으로 생성한 32자 이상 secret>
AUTH_OTP_PEPPER=<다른 32자 이상 secret>
AUTH_OTP_ENCRYPTION_KEY_BASE64=<정확히 32바이트를 base64 인코딩한 값>
AUTH_ACCESS_TOKEN_TTL_SECONDS=900
AUTH_REFRESH_TOKEN_TTL_DAYS=30
AUTH_OTP_TTL_SECONDS=600
AUTH_DEV_OTP_EXPOSE=false
CONSENT_DOCUMENT_VERSION=2026-07-01

EMAIL_PROVIDER=resend
EMAIL_FROM="시니어클럽 <no-reply@검증된-도메인>"
RESEND_API_KEY=<Railway secret>

SMS_PROVIDER=twilio
TWILIO_ACCOUNT_SID=<Railway secret>
TWILIO_AUTH_TOKEN=<Railway secret>
TWILIO_MESSAGING_SERVICE_SID=<Railway secret>
# 또는 TWILIO_FROM_NUMBER=+8210xxxxxxxx

PUSH_PROVIDER=firebase
FCM_SERVICE_ACCOUNT_JSON_BASE64=<Railway secret>
OUTBOX_POLL_INTERVAL_MS=5000
ACCOUNT_DELETION_POLL_INTERVAL_MS=300000
OUTBOX_WORKER_ENABLED=true
```

API는 production에서 다음 상태를 fail-closed로 거부한다.

- 빈 `CORS_ORIGINS`
- 저장소의 development 인증 키
- `AUTH_DEV_OTP_EXPOSE=true`
- `EMAIL_PROVIDER`가 `resend`가 아니거나 빈 `RESEND_API_KEY`
- `SMS_PROVIDER`가 `twilio`가 아니거나 Twilio 자격증명이 누락됨
- `PUSH_PROVIDER`가 `firebase`가 아니거나 유효하지 않은 FCM 서비스 계정 JSON

`AUTH_ACCESS_TOKEN_SECRET`, `AUTH_OTP_PEPPER`, OTP 암호화 키는 각각 별도로 생성한다. OTP 암호화 키는
`openssl rand -base64 32`처럼 정확히 32바이트를 생성해 base64로 보관한다. FCM JSON은 로컬에서
base64 한 줄로 변환해 Railway secret에 직접 입력하고 terminal/CI 로그에 출력하지 않는다.

`.env.example`의 Redis, S3, Sentry 변수는 향후 연동을 위한 예약 이름이며 현재 API가 읽지 않는다.
현재 단일 API·텍스트 UGC 출시에는 Redis와 S3가 필수가 아니다. API 다중 인스턴스 또는 미디어 업로드를
실제로 추가하는 릴리스에서만 해당 서비스와 Data Safety/삭제 계약을 함께 구성한다.

## 3. CI와 dependency freeze

[CI workflow](../.github/workflows/ci.yml)는 Node 24와 pnpm 9.14.2로 다음을 검증한다.

1. root workspace lockfile의 frozen install
2. Prisma schema 검증
3. 웹 lint, typecheck, test, production build
4. API typecheck, test, build
5. Android lint, typecheck, Play asset/manifest 검사와 production bundle export
6. API production container build
7. EAS build ID parser와 수동 내부 트랙 workflow의 fail-closed 정적 계약

`main`에는 CI 성공과 최소 한 명의 리뷰를 필수로 둔다. `pnpm-lock.yaml`은 저장소 루트의 workspace
lockfile을 authoritative source로 사용한다. dependency가 바뀐 후에는 Node 24/pnpm 9.14.2로 lockfile을
한 번 재생성하고 `pnpm install --frozen-lockfile`을 다시 통과시킨다.

`validate:store`는 후보 자산·manifest·후보 스크린샷의 기술 규격 검사다. Play 제출 직전에는 실제
제출 빌드 화면을 캡처해 final manifest를 채우고, production config와 strict screenshot provenance를
묶은 아래 release gate를 통과시킨다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
EXPO_PUBLIC_WEB_URL=https://실제-웹-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  -- --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

release preflight는 `EXPO_PUBLIC_APP_ENV=production`을 강제하고 `localhost`, 사설·link-local·예약 IP,
`.invalid`/`.example`/문서 예시 도메인을 API URL로 허용하지 않는다. 최종 screenshot strict gate에는
skip 옵션이 없다. 이 검사는 AAB 파일 구조나 서명을 검사했다고 주장하지 않는다. EAS AAB 생성 뒤에는
Play App Bundle Explorer에서 package, versionCode, target API 36, signing과 merged manifest를 확인해야
출시 gate가 완결된다.

[`android-play-internal.yml`](../.github/workflows/android-play-internal.yml)은 push나 tag가 아니라
`workflow_dispatch`로만 실행한다. 위 preflight를 먼저 통과하고 EAS CLI `21.3.0`으로 `playInternal`
AAB를 기다려 JSON 결과를 받는다. 단일 `FINISHED` Android UUID만 허용하며 원본 build JSON,
검증 evidence, final screenshot manifest 해시와 source commit을 artifact로 보관한다. 선택 입력이
켜졌을 때만 그 정확한 ID를 내부 트랙 `draft`로 제출하며 `--latest`와 production 승격은 사용하지 않는다.

[`android-play-production.yml`](../.github/workflows/android-play-production.yml)은 `main` push/merge와
수동 실행으로 production AAB를 만들고, 성공 시 Play production 트랙 `draft`에 제출한다.
GitHub Environment는 `play-store-production`이다.

## 4. ECS API 최초 구성

1. Railway에서 프로젝트와 PostgreSQL 서비스를 만든다.
2. API 서비스를 같은 GitHub 저장소에 연결한다.
3. build context는 저장소 루트로 둔다. [railway.json](../railway.json)이 Dockerfile,
   `/readyz` deployment health check, 단일 replica와 restart/draining policy를 적용한다.
4. PostgreSQL `DATABASE_URL`을 API의 reference variable로 연결한다.
5. 위 production 변수들을 Railway Variables에 등록한다.
6. 한 인스턴스로 시작하고 `OUTBOX_WORKER_ENABLED=true`를 한 worker에서만 유지한다.
7. deployment health check path를 `/readyz`로 지정한다.
8. migration을 승인된 release job에서 먼저 적용한 뒤 새 revision을 배포한다.

API는 `0.0.0.0:$PORT`에서 수신한다. Docker liveness는 `/healthz`, Railway의 traffic readiness는
`/readyz`를 사용한다. `/readyz`는 제한시간 안에 PostgreSQL `SELECT 1`이 실패하면 503을 반환한다.
DB 장애 때 liveness까지 실패시켜 불필요한 container 재시작을 반복하지 않는다.

## 5. 데이터베이스 migration

baseline migration을 만든 뒤 다음 두 경로를 모두 검증한다.

- 빈 PostgreSQL에 모든 migration 순차 적용
- 직전 release schema와 대표 seed 데이터에서 새 migration 적용

```bash
# 실제 DB 연결 없이 schema 문법 검증
DATABASE_URL='postgresql://ci:ci@127.0.0.1:5432/senior_club?schema=public' \
  pnpm prisma:validate

# 승인된 release runner에서만 실행
pnpm prisma:migrate:deploy
```

migration을 애플리케이션 시작 명령에 넣지 않는다. 실패하면 새 API 배포를 중단한다. 이미 적용된
production migration을 수정하거나 삭제하지 말고 후속 migration으로 고친다. 첫 배포 전에 Railway
PostgreSQL backup에서 별도 인스턴스로 복구하는 연습을 완료한다.

## 6. ChatGPT Sites Web 배포

1. `pnpm build:sites`로 OpenNext Worker를 빌드한다.
2. 공식 Sites 패키징 helper로 아카이브를 만들고 저장·배포한다.
3. `NEXT_PUBLIC_APP_URL`을 canonical production HTTPS origin으로 지정한다.
4. `SENIOR_CLUB_API_BASE_URL`을 ECS API의 HTTPS origin으로 지정한다.
5. preview에는 production DB나 production 인증 secret을 연결하지 않는다.
6. 배포 후 `/api/healthz`, canonical/robots/sitemap, 정책 페이지, 로그인 복귀와 API CORS를 확인한다.

`NEXT_PUBLIC_API_URL`은 현재 웹 계약이 아니다. API origin은 server-only 변수로 유지한다. Prisma
migration은 웹 build에서 실행하지 않는다.

## 7. Android / EAS와 FCM

`eas.json`은 internal/preview/production 환경을 분리하고 각 profile의 `EXPO_PUBLIC_APP_ENV`를
명시하며 CLI를 `21.3.0`으로 고정한다. 해당 EAS environment에는 다음 공개 API URL과 Android client
file secret을 등록한다.

```dotenv
EXPO_PUBLIC_APP_ENV=production
EXPO_PUBLIC_API_URL=https://실제-Railway-API-도메인
EXPO_PUBLIC_WEB_URL=https://senior.toris.kr
GOOGLE_SERVICES_JSON=<EAS file secret: Android client google-services.json>
```

production API·웹 URL에는 공개 HTTPS FQDN 또는 공개 IP만 사용한다. `localhost`, 단일 레이블 host,
RFC1918/loopback/link-local/ULA 주소, `.invalid`·`.example`·`example.com` 같은 placeholder는 앱 런타임
환경 파서와 release endpoint gate에서 거부된다. 웹 origin의 개인정보 처리방침·약관·계정 삭제
페이지도 동일 origin의 200 HTML 응답이어야 한다. 빌드 후에는 해당 FQDN의 실제 DNS가 사설 IP로
변경되지 않았는지도 배포 smoke test에서 확인한다.

앱은 Android notification channel을 만든 뒤 권한을 요청하고 `getDevicePushTokenAsync()`로 native FCM
token을 받아 `/v1/devices`에 등록한다. 이는 Expo Go가 아니라 Firebase가 포함된 development/production
build와 Play Services가 있는 실제 기기에서 검증한다. `app.config.js`는 EAS file secret 경로만
`android.googleServicesFile`로 주입한다. `eas-build-post-install` manifest gate는 production에서 파일이
없거나 `com.toris.seniorclub` Android client가 아닌 경우 빌드를 중단한다. Firebase Admin 서비스 계정은
이 client 파일과 별개이며 API에만 둔다.

최종 AAB에서는 다음을 다시 확인한다.

- Play App Signing의 package/signing certificate와 Firebase Android client 일치
- 병합 manifest의 permission/exported component
- 알림 권한 거부 시 로그인·모임 기능 정상 동작
- foreground/background/terminated 상태의 수신과 allowlist 딥링크
- privacy/terms/account-deletion URL과 실제 인앱 계정 삭제 요청
- `versionCode` 증가, Data Safety와 데이터 삭제 응답 일치

GitHub의 `GOOGLE_SERVICES_JSON_BASE64`는 preflight용 Android client file을 `RUNNER_TEMP`에 권한
`0600`으로 복원하기 위한 별도 전달 경로다. 로그에 JSON을 출력하지 않고 workflow 종료 때 정확한
임시 경로만 삭제한다. 이것은 Railway의 Firebase Admin secret이나 Google Play 서비스 계정이 아니다.
원격 EAS build에는 EAS `production` environment의 `GOOGLE_SERVICES_JSON` file secret이 필요하고,
선택 submit에는 EAS credentials에 등록된 최소 권한 Play 서비스 계정이 필요하다.

## 8. 배포 및 smoke test 순서

1. CI 전체 통과
2. DB backup/snapshot 확인
3. 승인된 migration 적용
4. ECS API 배포 후 `/healthz` 200, `/readyz` 200 확인
5. 회원 smoke: OTP 요청/검증, refresh rotation, 관심사·프로필, 공개 클럽·모임, 신청/취소,
   게시글·댓글, 후기, 채팅·읽음, 인앱 알림, 신고·차단, 기기 등록과 계정 삭제 확인
6. 리더 smoke: 담당 클럽 조회, 모임 생성/수정/공개/취소, 신청 승인·거절, 출석, 채팅 권한
   부여·회수와 이메일·FCM outbox 확인
7. 관리자 smoke: 신고 조회·상태 변경, 처리 메모와 감사 이력 확인
8. Resend 실제 수신과 FCM 실제 기기 수신 확인
9. ChatGPT Sites Web 배포와 SEO/GEO·정책·로그인/온보딩 복귀 흐름 확인
10. 내부 테스트 AAB에서 production API smoke test
11. 오류율, p95, DB connection, outbox 지연을 관찰한 뒤 Play 단계적 출시

## 9. 롤백과 운영

- API: 직전 Railway revision으로 rollback한다. schema 변경은 expand → data migration → contract 순으로
  나눠 이전 revision도 새 schema를 읽을 수 있게 한다.
- Web: 직전 ChatGPT Sites production version으로 rollback한다.
- Android: 이미 배포된 `versionCode`는 되돌릴 수 없으므로 수정한 더 높은 versionCode를 내부 트랙부터
  다시 배포한다.
- 발송 장애: outbox worker를 중지하되 행은 보존하고 원인 수정 후 같은 idempotency key로 재시도한다.

운영 알림에는 `/readyz`, 5xx 비율, p95, PostgreSQL connection/용량, outbox oldest age와 실패 횟수,
계정 삭제 worker 실패를 포함한다. 구조화 로그에는 이메일, 이름, OTP, access/refresh token, FCM token,
채팅 본문, signed URL, 서비스 계정 내용을 남기지 않는다.

## 10. 현재 외부/출시 blocker

- GitHub 저장소/remote와 `play-internal` Environment가 없으면 CI·수동 Android workflow와
  ChatGPT Sites/ECS Git 연동을 시작할 수 없음
- production domain, Railway/PostgreSQL, Resend 발신 도메인, Firebase/EAS 자격 증명이 필요함
- Prisma schema와 단위·계약 테스트는 통과했지만 이번 최종 실행에서는 PostgreSQL 테스트 환경이 없어
  DB 동시성 e2e가 건너뛰어짐. 빈 DB·업그레이드 migration, 백업 복구 rehearsal과 Railway 적용 승인이
  필요함
- 최종 AAB, 실기기 FCM 검증, Play 스크린샷과 콘솔 입력이 필요함
- 실제 production 환경에서 커뮤니티·모임·텍스트 UGC·채팅·알림·신고/차단을 포함한 역할별 e2e와
  운영 모니터링을 완료해야 함

소셜 로그인과 사진/파일 업로드는 현재 출시 범위가 아니다. 휴대폰 SMS OTP와 텍스트 UGC만으로 출시하며,
스토어 문구에서도 OAuth·사진·파일 기능을 약속하지 않는다. 나중에 해당 기능을 범위에 넣을 때만
공급자 설정, S3 같은 저장소, Android 권한과 개인정보/삭제 정책을 별도 출시 조건으로 추가한다.
