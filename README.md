# 시니어클럽

**목적 → 사람 → 활동 → 관계**를 온라인에서 이어 주는 시니어 커뮤니티 MVP입니다. 관심사와 지역에 맞는 모임을 발견하고, 참여하고, 후기와 다음 약속으로 관계를 이어 가는 흐름을 검증합니다.

![시니어클럽 모임 이미지](./public/images/club-senior-hero.jpg)

> 현재 단계는 실행 가능한 **Expo Android 앱 + Next.js 웹 + NestJS/PostgreSQL API**입니다. 휴대폰 SMS OTP,
> 세션 회전, 프로필·관심사, 커뮤니티, 모임, 게시글·댓글, 채팅, 후기, 알림, 신고·차단과 계정 삭제 요청은
> 실제 API 계약에 연결돼 있습니다. 다만 production DB 적용, Resend/Firebase/EAS 자격 증명, 실기기 검증,
> 최종 스크린샷 증빙과 AAB/Play Console 확인이 남아 있으므로 아직 운영 서비스로 사용하지 마세요.

## 앱 중심 구조

- `apps/mobile`: Expo SDK 57 / React Native 0.86 / Expo Router 회원 앱
- `apps/api`: NestJS, Prisma 7, PostgreSQL, Socket.IO API와 outbox worker
- 저장소 루트: Next.js 웹/BFF와 개인정보·계정 삭제 공개 페이지
- Android package: `com.toris.seniorclub`
- Play 배포 산출물: production AAB, Android 16 / API 36 대상

회원용 화면은 WebView가 아닌 네이티브 UI입니다. 홈, 커뮤니티, 모임, 대화, 내 정보의 5개 Android 네이티브 탭과 온보딩·신청·후기·알림 흐름을 포함합니다.

## 현재 구현된 핵심 흐름

- 휴대폰 SMS OTP 요청·검증, access/refresh token 회전과 로그아웃
- 공개 커뮤니티·모임 목록/상세, 로그인 후 신청·취소와 idempotency 처리
- 텍스트 게시글·댓글 작성/수정/삭제와 공개 피드
- 승인된 모임의 채팅방·메시지·읽음 처리와 증분 동기화
- 참석 자격을 확인하는 후기 작성/수정/삭제와 공개 후기 목록
- 인앱 알림 목록·읽음 처리, Android native FCM token 등록과 안전한 알림 경로 처리
- 실제 인앱 계정 삭제 요청과 세션·기기 credential 제거
- 관심사·지역·출생연도 온보딩의 서버 저장과 다중 기기 복원
- 담당 리더의 모임 생성/수정/공개/취소, 신청자 승인/거절·출석과 이메일·FCM outbox, 채팅 멤버십 동기화
- 콘텐츠·사용자 신고, 사용자 차단/해제와 관리자 신고 처리·감사 이력
- 시니어 사용자를 고려한 큰 글자, 분명한 상태, 키보드 포커스
- `/api/healthz`, upstream API/DB를 확인하는 `/api/readyz`
- Prisma baseline migration, Railway Docker 배포, Vercel/Railway CI 설정

## 빠른 시작

### 요구사항

- Node.js `24.x`
- pnpm `9.14.2`

### Android 회원 앱

```bash
pnpm install
cp apps/mobile/.env.example apps/mobile/.env.local
pnpm mobile:start
```

Expo Go에서 QR 코드를 열거나 Android 에뮬레이터가 실행 중일 때 `a`를 누릅니다. 앱 검증 명령은 다음과 같습니다.

```bash
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
./node_modules/.bin/expo export --platform android
```

Play Store AAB와 트랙별 절차는 [Google Play 출시 가이드](./docs/PLAY_STORE.md)를 따릅니다.

### 웹·API 로컬 실행

의존성은 저장소 루트에서 한 번만 설치합니다.

```bash
pnpm install
cp .env.example .env
cp apps/api/.env.example apps/api/.env
```

두 env 파일의 `DATABASE_URL`을 로컬 PostgreSQL에 맞춘 뒤 baseline migration과 Prisma Client를
준비합니다.

```bash
pnpm prisma:migrate:deploy
pnpm exec prisma generate
```

터미널을 나눠 API와 웹을 실행합니다.

```bash
pnpm api:dev
pnpm dev
```

[http://localhost:3000](http://localhost:3000)의 `/login`에서 휴대폰 SMS OTP 흐름을 사용할 수 있습니다.
개발 코드 노출은 `apps/api/.env`에서 `AUTH_DEV_OTP_EXPOSE=true`로 명시한 로컬 환경에서만 허용되며
production에서는 시작 자체가 거부됩니다.

Prisma 7에서는 연결 URL을 `schema.prisma`가 아니라 `prisma.config.ts`에서 읽습니다. 이 설정은 Node의 내장 환경 파일 loader로 저장소 루트의 `.env`를 읽으며, 이미 설정된 프로세스 환경 변수는 덮어쓰지 않습니다. `.env`는 git에 포함하지 않습니다.

## 주요 화면과 API

| 경로 | 내용 | 데이터 |
| --- | --- | --- |
| `/` | 공개 모임·커뮤니티와 로그인 사용자 맞춤 안내 | Nest API + 서버 동기화 프로필 캐시 |
| `/login` | 휴대폰 SMS OTP 로그인 | API + HttpOnly 세션 cookie |
| `/onboarding` | 관심사·지역·출생연도·이름 | Nest API + HttpOnly 세션 cookie |
| `/clubs` | 테마 커뮤니티 목록 | public API |
| `/clubs/[slug]` | 커뮤니티 상세와 예정 활동 | public API |
| `/clubs/[slug]/posts` | 공개 게시글 목록·작성 | Nest API + 인증 Next BFF |
| `/clubs/[slug]/posts/[id]` | 공개 게시글 상세·댓글·답글 | Nest API + 인증 Next BFF |
| `/events` | 모임 검색·필터 | public API |
| `/events/[id]` | 일정·장소·정원·신청 | public/authenticated API |
| `/chat` | 승인된 모임의 대화방·증분 메시지·읽음 처리 | Nest API + 인증 Next BFF |
| `/notifications` | 인앱 알림 목록·읽음 처리 | Nest API + 인증 Next BFF |
| `/leader` | 모임 생성/수정/공개/취소·신청/출석 관리 | Nest API + 인증 Next BFF |
| `/admin` | 신고 조회·처리(서버에 감사 이력 기록) | Nest API + 인증 Next BFF |
| `/reviews/new?eventId=…` | 참석 자격 확인·별점·텍스트 후기 CRUD | Nest API + 인증 Next BFF |
| `/me` | 서버 프로필·신청 내역·알림 설정·로그아웃 | Nest API + 인증 Next BFF |
| `/api/home` | 폐기된 초기 프로토타입 경로 | `410 Gone` |
| `/api/events` | 공개 모임 필터 목록 | Nest API adapter |
| `/api/healthz` | 웹 프로세스 liveness | 동적 JSON |
| `/api/readyz` | 웹·API·PostgreSQL readiness | upstream `/readyz` |

전체 요청·응답은 [API 명세](./docs/API.md)에 있습니다.

## 품질 검사

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

모바일 앱은 별도 패키지에서 검사합니다.

```bash
cd apps/mobile
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
env XDG_CACHE_HOME=/tmp/club-senior-pnpm-cache pnpm dlx expo-doctor@latest
./node_modules/.bin/expo export --platform android
```

Prisma 검증은 `DATABASE_URL`이 설정된 환경에서 별도로 실행합니다.

```bash
DATABASE_URL='postgresql://localhost:5432/senior_club?schema=public' pnpm prisma:validate
```

이 URL에는 저장된 비밀값이 없으며 로컬 무인증 PostgreSQL 예시일 뿐입니다. 실제 환경의 연결 정보는 배포 플랫폼의 encrypted environment에 설정하세요.

## 데이터 구조

회원·커뮤니티·모임·UGC·채팅·알림·운영 상태의 진실 원본은 API/PostgreSQL입니다. 웹의
`club-senior-profile`은 로그인 사용자의 서버 프로필을 홈에 빠르게 표시하기 위한 미러 캐시일 뿐이며,
인증이나 신청·후기 상태의 원본으로 사용하지 않습니다. 모바일도 세션 복원용 보안 저장소와 화면 캐시만
기기에 보관하고 서버 응답을 권위 데이터로 사용합니다. 과거 프로토타입 데이터 모듈은 활성 화면의
장애 대체 데이터로 사용되지 않습니다.

구현 모델은 [`prisma/schema.prisma`](./prisma/schema.prisma), baseline SQL은
[`prisma/migrations/20260729210000_init/migration.sql`](./prisma/migrations/20260729210000_init/migration.sql)에 있습니다.

- 계정: `User`, `AuthIdentity`, `Interest`, `UserInterest`
- 커뮤니티: `Club`, `ClubMember`, `Post`, `Comment`
- 활동: `Event`, `EventMember`, `Review`
- 관계: `ChatRoom`, `ChatMessage`, `Notification`, `Friendship`
- 운영: `Report`, `AdminAuditLog`, `Newsletter`

production 적용 전에는 빈 DB/업그레이드 migration과 실제 DB e2e를 별도로 검증합니다.

## 환경 변수

`.env.example`은 이름과 용도만 제공하며 실제 비밀값을 포함하지 않습니다.

| 변수 | 위치 | 용도 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | Vercel | canonical 공개 웹 origin |
| `SENIOR_CLUB_API_BASE_URL` | Vercel server-only | Railway API HTTPS origin |
| `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` | EAS | 앱에 노출 가능한 환경/API·정책 웹 origin |
| `DATABASE_URL`, pool/readiness 변수 | Railway | PostgreSQL/Prisma |
| `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_OTP_PEPPER` | Railway secret | token/OTP 서명·검증 |
| `AUTH_OTP_ENCRYPTION_KEY_BASE64` | Railway secret | 정확히 32바이트 OTP 암호화 키 |
| `EMAIL_PROVIDER`, `EMAIL_FROM`, `RESEND_API_KEY` | Railway | 선택적 이메일 알림 |
| `SMS_PROVIDER`, `TWILIO_*` | Railway | production SMS OTP |
| `PUSH_PROVIDER`, `FCM_SERVICE_ACCOUNT_JSON_BASE64` | Railway secret | Firebase Admin 발송 |
| `GOOGLE_SERVICES_JSON` | EAS file secret | Android Firebase client 설정 |
| `OUTBOX_*` | Railway | SMS·이메일·푸시·삭제 worker |

`NEXT_PUBLIC_` 접두사가 붙은 값은 브라우저 번들에 노출될 수 있습니다. secret에는 절대 사용하지 마세요.
Android `preview`/`production`의 `EXPO_PUBLIC_API_URL`과 `EXPO_PUBLIC_WEB_URL`은 공개 HTTPS origin이어야 하며
`localhost`, 사설·link-local IP, `.invalid`/`.example` 같은 예약·예시 호스트는 빌드 검증에서 거부됩니다.

Play 출시 직전의 로컬 source/config/store-evidence gate는 다음 한 명령으로 실행합니다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
EXPO_PUBLIC_WEB_URL=https://실제-웹-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  -- --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

이 명령은 최종 screenshot manifest strict 검사를 생략할 수 없습니다. AAB 바이너리 자체는 preflight
범위가 아니므로 EAS 빌드 후 Play App Bundle Explorer에서 package, versionCode, target API, signing과
merged manifest를 별도로 확인해야 합니다.

Google Play 내부 트랙 AAB는 `play-internal` GitHub Environment를 사용하는
[`android-play-internal.yml`](./.github/workflows/android-play-internal.yml)에서 수동으로만 빌드합니다.
EAS CLI `21.3.0`과 정확한 검증 build ID를 사용하며, 선택 제출도 내부 트랙 `draft`까지만 허용합니다.

## Vercel + Railway 배포

저장소 루트의 [`vercel.json`](./vercel.json)이 pnpm 고정 설치와 Next.js build를 설정합니다.

1. Vercel에서 저장소를 가져옵니다.
2. Framework Preset이 `Next.js`인지 확인합니다.
3. Vercel에 `NEXT_PUBLIC_APP_URL`, `SENIOR_CLUB_API_BASE_URL`을 설정합니다.
4. Railway는 [`railway.json`](./railway.json)과 `apps/api/Dockerfile`을 사용하고 production API secret을
   encrypted variables로 주입합니다.
5. 배포 전 `pnpm lint && pnpm typecheck && pnpm test && pnpm build`를 통과시킵니다.
6. 배포 후 `/api/healthz`, `/api/readyz`, SMS OTP·신청·삭제와 실제 SMS/푸시를 확인합니다.

CLI를 이미 사용하고 있다면 다음으로 preview를 만들 수 있습니다.

```bash
pnpm dlx vercel
```

### 프로덕션 원칙

- Next.js Web만 Vercel에 둡니다.
- NestJS API, Socket.IO, worker는 Railway 또는 AWS ECS 같은 상시 실행 환경에 배포합니다.
- PostgreSQL과 인증·Twilio·Firebase secret을 Railway에 설정합니다. Redis는 API 다중 인스턴스가
  필요할 때 검토합니다. 현재 텍스트 전용 MVP에는 S3가 필요하지 않습니다.
- Prisma migration을 Vercel build 명령에 넣지 않습니다. 승인된 릴리스 단계에서 한 번 적용한 뒤 앱을 배포합니다.
- `/api/readyz`는 Railway API의 PostgreSQL `SELECT 1` readiness까지 확인합니다.

## 로컬 캐시 초기화

온보딩 정보는 서버에 저장됩니다. 브라우저 표시 캐시나 큰 글자 설정만 초기화하려면 개발자 도구에서
`club-senior-profile`, `club-senior-large-text`를 지우고 새로고침합니다. 로그인 상태라면 서버 프로필이
다시 동기화되며 이 작업은 서버 데이터나 신청·게시글·후기·채팅을 삭제하지 않습니다.

## 알려진 한계

- 현재 출시 인증 수단은 휴대폰 SMS OTP입니다. 카카오·네이버·구글 OAuth는 MVP 필수 조건이 아니라 향후
  선택 기능입니다.
- 게시글·댓글·후기·채팅은 텍스트만 지원합니다. 사진/파일 업로드와 S3 저장소는 현재 Play 등록정보에
  약속하지 않으며, 미디어 기능을 추가하는 릴리스에서 별도 구현·권한·Data Safety 검토가 필요합니다.
- 채팅 클라이언트는 실제 REST 증분 동기화를 사용하고 API에는 Socket.IO gateway가 있습니다. API를
  여러 인스턴스로 확장할 때는 Redis adapter 또는 동등한 분산 fan-out 구성이 필요합니다.
- Resend/Firebase/EAS 자격 증명과 production DB가 없어 실제 production 메일·푸시는 미검증입니다.
- Prisma schema와 단위·계약 테스트는 통과했습니다. 이번 최종 실행에서는 PostgreSQL 테스트 환경이
  없어 DB 동시성 E2E 10개가 건너뛰어졌으며, 빈 DB/업그레이드 migration과 백업 복구 rehearsal은
  production 배포 전에 별도로 통과시켜야 합니다.
- 최종 Play 스크린샷, App Links/도메인, 운영 정책과 Data Safety 확정이 남아 있습니다.
- 결제, 환불, 본인 확인, 긴급 연락, 의료·돌봄 기능은 범위 밖입니다.

## 문서

- [제품 요구사항: P0/P1, 여정, 권한, 출시 게이트](./docs/PRODUCT.md)
- [아키텍처: 현재 앱·웹·API, 인프라와 데이터 무결성](./docs/ARCHITECTURE.md)
- [API: 현재 Nest 계약과 Next 웹 BFF 명세](./docs/API.md)
- [이미지 자산: 생성 목적, 최종 프롬프트, 배포 경로](./docs/ASSETS.md)
- [Google Play 출시: API 36, AAB, 테스트 트랙, 제출 체크리스트](./docs/PLAY_STORE.md)
- [Android 출시 준비 상태와 차단 조건](./docs/RELEASE_READINESS.md)
- [Vercel·Railway·EAS 프로덕션 배포 런북](./docs/DEPLOYMENT.md)
- [성능·API 비용 기준과 측정 방법](./docs/PERFORMANCE.md)
- [Google Play Data Safety 작성 초안](./docs/DATA_SAFETY.md)
- [모바일 앱 실행·EAS 빌드 안내](./apps/mobile/README.md)

## 프로젝트 철학

시니어클럽의 최종 결과는 더 많은 화면이나 게시글이 아닙니다. 같은 목적을 가진 사람이 실제 활동에 참여하고, 안전하고 편안한 경험을 한 뒤, 다음 만남을 선택하는 것입니다. 제품과 기술 결정은 이 반복을 더 쉽게 만드는지를 기준으로 판단합니다.
