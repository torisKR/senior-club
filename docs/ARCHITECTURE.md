# 시니어클럽 기술 아키텍처

> 구현 기준선: 2026-07-30  
> 현재 저장소는 Expo Android 앱, Next.js 웹/BFF, NestJS/Socket.IO API, Prisma/PostgreSQL을 함께 둔다.

## 1. 현재 구조

```text
Expo Android App                       Next.js Web / BFF
  네이티브 5개 탭                       공개 SEO·회원·리더·관리 화면
  SecureStore + 화면 cache              HttpOnly session cookies
           │ HTTPS / Bearer                        │ HTTPS / server token
           └──────────────────┬────────────────────┘
                              ▼
                 NestJS API + Socket.IO Gateway
                 strict DTO · 권한 · transaction
                     │                 │
                     ▼                 ▼
              Prisma / PostgreSQL   Outbox Worker
                                      ├─ Resend email
                                      └─ Firebase FCM
```

웹은 ChatGPT Sites, API·Socket.IO·worker는 AWS ECS 같은 상시 실행 환경, DB는 관리형 PostgreSQL에
배포하는 구성을 사용한다. 현재 코드는 준비됐지만 production 인프라와 자격 증명은 아직 연결·검증되지
않았다.

### 사용 기술

| 영역 | 선택 | 역할 |
| --- | --- | --- |
| Android | Expo SDK 57, React Native 0.86, Expo Router | 네이티브 회원 경험, API 36 AAB |
| Web | Next.js 16, React 19 | 공개 SEO/GEO, BFF, 회원·리더·관리 UI |
| API | NestJS 11, Socket.IO | 인증, 권한, 상태 전이, 실시간 메시지 |
| Data | Prisma 7, PostgreSQL | 영속 상태, transaction, cursor feed |
| Async | PostgreSQL transaction outbox worker | SMS/email OTP·이벤트 email/FCM, 계정 삭제 |
| UI | Tailwind CSS 4, React Native StyleSheet | 반응형·접근성 UI |
| Test | Vitest 4, TypeScript strict, ESLint | 단위·계약·빌드 gate |

## 2. 소스 경계

```text
apps/mobile/src/app/       Expo Router route
apps/mobile/src/screens/   네이티브 화면
apps/mobile/src/api/       Bearer API adapter와 strict response parser
apps/mobile/src/auth/      SecureStore session·single-flight refresh
apps/mobile/src/notifications/ FCM 등록·알림 route
apps/api/src/              Nest module, controller, service, worker
src/app/                   Next route·server component·BFF
src/components/            웹 UI
src/lib/auth/              HttpOnly cookie BFF와 server auth
src/lib/**/server.ts       공개/보호 API adapter
prisma/schema.prisma       관계형 모델과 index
prisma/migrations/         baseline과 후속 index migration
docs/                      제품·API·배포·Play 문서
```

`src/lib/data.ts`와 일부 오래된 순수 로직 fixture는 회귀 테스트·표시 자산을 위해 남아 있을 수 있지만,
활성 공개 catalog나 회원 신청·게시글·후기·채팅의 장애 fallback으로 사용하지 않는다. 서버가 반환하지
않은 회원·모임 상태를 클라이언트가 만들어 권한 판단에 사용하지 않는다.

## 3. 인증과 session

### 휴대폰 SMS OTP

1. `POST /v1/auth/phone/request`가 E.164 전화번호로 OTP를 생성·hash하고 outbox에 SMS 요청을 기록한다.
2. 개발은 콘솔 sender, production은 Twilio Messaging sender를 사용하며 운영 자격증명이 없으면 시작을 거부한다.
3. `POST /v1/auth/phone/verify`가 만료·시도 횟수·소비 여부를 확인하고 session을 발급한다.
4. refresh token은 DB에 hash로 저장하며 사용할 때 회전한다.
5. 로그아웃·계정 삭제 요청은 session을 폐기한다.

웹 BFF는 access/refresh token을 `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookie로 저장한다.
upstream `401`에서 refresh를 한 번만 수행하고 원요청을 한 번 재시도한다. Android는 refresh token을
SecureStore에, access token을 메모리에 보관하며 동일한 single-flight 규칙을 사용한다.

OAuth와 비밀번호 인증은 현재 출시 범위가 아니다.

## 4. 요청과 데이터 흐름

### 공개 읽기

1. 웹 server component, Next 공개 BFF 또는 앱이 Nest API를 호출한다.
2. API는 공개 상태의 필드만 명시적 Prisma select로 읽는다.
3. mapper가 DB 모델을 외부 DTO로 변환한다.
4. clubs/events/posts/reviews 공개 feed는 cursor와 짧은 공유 cache를 사용한다.
5. API 오류 시 fixture URL이나 회원 상태를 만들지 않고 오류·빈 상태를 표시한다.

Prisma 모델을 그대로 JSON으로 반환하지 않는다. 내부 역할 관계, 출생연도, 신고 메모, token 같은 값이
노출되고 DB 변경이 API breaking change가 되는 것을 막기 위해 public/managed projection을 분리한다.

### 모임 신청

```text
인증·활성·온보딩 확인
  → Idempotency-Key 확인
  → 모임 공개/마감/정원·기존 신청 확인
  → EventMember와 전이 이력 기록
  → 인앱 알림·email/FCM outbox 기록
  → 한 transaction commit
```

동시 승인과 동일 key 모임 생성은 관련 사용자·모임 행을 잠가 직렬화한다. 클라이언트의 참가자 수나
역할 표시는 신뢰하지 않는다.

### 게시글·댓글·후기

- 공개 feed와 상세는 명시적 작성자 `{ id, name }` projection을 사용한다.
- 작성은 활성·온보딩 사용자, 수정·삭제는 작성자 ID로 검사한다.
- 후기는 승인 참가자의 `ATTENDED` 기록과 공개 시각을 검사한다.
- 삭제는 현재 `HIDDEN` soft delete이며 공개 query에서 제외한다.
- 사용자 사진·파일 첨부는 schema에 확장 모델이 있어도 현재 API·앱에서 제공하지 않는다.

## 5. 채팅

### 권한

- 승인된 참가자와 현재 활성 커뮤니티 리더·운영진만 방에 들어갈 수 있다.
- HTTP 요청과 socket join/send마다 DB의 현재 session·운영 관계를 다시 확인한다.
- 취소·권한 상실 사용자는 과거 `ChatRoomMember` 행이 남아도 목록·history·전송 권한이 없다.
- 상호 차단 관계는 방 preview, 메시지 history, socket fan-out에서 필터링한다.

### 동기화

1. 방 목록은 최근 활동 시각 cursor를 사용한다.
2. 과거 history는 `cursor`, 새 메시지는 `after` watermark로 읽는다.
3. 클라이언트는 짧은 증분 poll에서 최대 3페이지를 읽고 5분/수동 새로고침에 전체 정합성을 맞춘다.
4. Socket.IO `/chat`은 `room:join`, `message:send`, `message:new`을 제공한다.
5. `(roomId, userId, clientMessageId)`로 중복 메시지를 막는다.

현재 socket fan-out은 한 API 프로세스 안에서 보장된다. REST 전송은 DB에 저장되며 증분 poll이 최종
보정한다. API를 여러 인스턴스로 늘리기 전에는 Redis adapter나 동등한 broker를 추가해야 한다.

## 6. 알림·outbox·계정 삭제

상태 변경 transaction은 `Notification`과 `OutboxEvent`를 함께 기록한다. worker는 `SKIP LOCKED` 방식의
batch lease, 만료 lease 회수, 최대 시도, backoff, dedup key를 적용한다.

지원 발송:

- OTP 이메일
- 신청 승인·거절·모임 취소 이메일/FCM
- 후기 요청 이메일/FCM
- Android FCM token 등록·해제와 수신 설정

발송 실패는 이미 commit된 신청 상태를 되돌리지 않는다. 운영은 outbox oldest age, 실패 횟수와 terminal
failure를 감시해야 한다.

계정 삭제 요청은 즉시 session과 push token을 해제하고 7일 유예 상태를 만든다. 사용자가 다시
로그인하면 유예 기간 안에 취소할 수 있다. 별도 worker가 기한이 지난 계정을 비식별화한다. production
DB, cache, 로그와 순환 backup에 같은 삭제 상태를 적용하는 E2E는 출시 gate다.

## 7. 안전·관리자 경계

- 신고 대상은 USER, POST, COMMENT, REVIEW, CHAT_MESSAGE 중 정확히 하나다.
- 열린 중복 신고와 동시 차단 생성을 신고자/차단자 행 잠금으로 직렬화한다.
- 본인·본인 콘텐츠 신고와 본인 차단은 거부한다.
- 차단은 사용자당 500명이며 초과·기존 overflow를 명시적 `409`로 반환한다.
- 관리자 신고 처리 transaction은 상태 변경과 `AdminAuditLog`를 함께 기록한다.
- 관리자는 현재 신고 feed와 처리 endpoint만 가지며 비공개 채팅 자동 우회 권한은 없다.

후기는 보호된 개인화 feed가 DB query에서 내가 차단한 작성자와 집계를 제외한다. 게시글·댓글 공개 feed는
앱이 차단 직후 숨기고 서버 차단 목록을 다시 확인하지만, 별도 DB 수준 개인화 feed는 아직 없다.

## 8. 데이터 모델과 무결성

스키마 원본은 [`prisma/schema.prisma`](../prisma/schema.prisma)다.

| 영역 | 주요 모델 |
| --- | --- |
| 계정 | `User`, `AuthIdentity`, `AuthSession`, `EmailVerification`, `PhoneVerification`, `ConsentRecord` |
| 취향 | `Interest`, `UserInterest` |
| 커뮤니티 | `Club`, `ClubMember`, `Post`, `Comment` |
| 활동 | `Event`, `EventMember`, `EventMemberTransition`, `Review` |
| 관계 | `ChatRoom`, `ChatRoomMember`, `ChatMessage`, `Friendship`, `UserBlock` |
| 전달 | `Notification`, `DevicePushToken`, `NotificationPreference`, `OutboxEvent` |
| 운영 | `Report`, `AdminAuditLog`, `AccountDeletionRequest`, `Newsletter` |

핵심 유일성:

- `(userId, interestId)`: 관심사 중복 방지
- `(clubId, userId)`: 커뮤니티 관계 중복 방지
- `(eventId, userId)`: 모임 신청·후기 각각 1개
- `ChatRoom.eventId`: 모임당 방 하나
- `(roomId, userId, clientMessageId)`: 채팅 재전송 중복 방지
- `(userId, route, key)`: 멱등성 결과 중복 방지
- `(blockerId, blockedId)`: 차단 중복 방지

feed는 상태·시각·ID 복합 index를 사용한다. 주요 후속 migration은 outbox lease, 공개 club, notification,
post/comment, review, event draft, report와 chat activity index를 추가한다.

## 9. 캐시와 API 비용

- 관심사: 장기 public cache
- 공개 club/event/post/review: 짧은 `s-maxage`와 stale-while-revalidate
- profile, applications, chat, notification, admin: `private, no-store`
- sitemap: 한 시간 재사용, event/club cursor 순회 상한
- Android 응답: strict parser로 잘못된 cache·서버 응답을 fail closed
- Next BFF: upstream `401` refresh 한 번, 중복 재시도 금지
- outbox: 25개 batch와 유휴 poll 간격

캐시 키·로그에 이메일, 이름, token, 채팅 본문을 넣지 않는다.

## 10. 배포 구조

| 대상 | 배포 | 필수 값 |
| --- | --- | --- |
| Web | ChatGPT Sites + Cloudflare | `NEXT_PUBLIC_APP_URL`, server-only API origin |
| API/Socket/Worker | Railway 또는 ECS | DB, auth, email, FCM, CORS secret |
| DB | 관리형 PostgreSQL | TLS, backup, migration 승인 |
| Android | EAS Build → Google Play | production API/web URL, Firebase client file, signing |

Redis와 S3는 현재 단일 API·텍스트 UGC 출시에 필수가 아니다. 다중 socket 인스턴스 또는 미디어 업로드를
도입할 때 추가한다. migration은 웹 build에서 실행하지 않고 승인된 release 단계에서 한 번 적용한다.

## 11. 검증과 남은 위험

현재 자동 gate:

- 웹·API·모바일 Vitest, TypeScript, ESLint
- Next production build와 Nest build
- Prisma schema validate
- Android Expo bundle export
- Play icon·feature graphic·splash·manifest·후보 screenshot 규격
- production release script와 GitHub workflow 계약

아직 필요한 검증:

- 실제 PostgreSQL에서 migration과 동시 승인·중복 신고/차단 E2E
- production Resend·FCM·Socket.IO·계정 삭제 E2E
- 실기기 성능·접근성·푸시·딥링크
- backup 복구, 장애 경보와 보안 운영
- 최종 screenshot provenance와 서명 AAB의 App Bundle Explorer 확인

## 관련 문서

- [제품 요구사항](./PRODUCT.md)
- [현재 API 명세](./API.md)
- [배포 런북](./DEPLOYMENT.md)
- [성능·비용 기준](./PERFORMANCE.md)
- [로컬 실행](../README.md)
