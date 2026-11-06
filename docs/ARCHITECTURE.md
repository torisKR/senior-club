# 시니어클럽 기술 아키텍처

> 운영 확인: 2026-09-30
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

웹은 Vercel의 `https://senior.toris.kr`, API·Socket.IO·worker는 서울 리전 AWS ECS, DB는 Amazon RDS PostgreSQL에 배포되어 있다. API의 공개 진입점은 CloudFront이며 실제 카카오 네이티브 로그인과 프로필 저장을 운영 API에서 확인했다. 상세 배포 증거와 남은 출시 조건은 `docs/QA_PRODUCTION_20260930.md`와 `docs/DEPLOYMENT.md`를 따른다.

### 사용 기술

| 영역 | 선택 | 역할 |
| --- | --- | --- |
| Android | Expo SDK 57, React Native 0.86, Expo Router | 네이티브 회원 경험, API 36 AAB |
| Web | Next.js 16, React 19 | 공개 SEO/GEO, BFF, 회원·리더·관리 UI |
| API | NestJS 11, Socket.IO | 인증, 권한, 상태 전이, 실시간 메시지 |
| Data | Prisma 7, PostgreSQL | 영속 상태, transaction, cursor feed |
| Async | PostgreSQL transaction outbox worker | 이벤트 알림·계정 삭제; 미설정 외부 발송 채널은 disabled |
| UI | Tailwind CSS 4, React Native StyleSheet | 반응형·접근성 UI |
| Test | Vitest 4, TypeScript strict, ESLint | 단위·계약·빌드 gate |

웹과 Android는 `shared/design/foundation.ts`의 공통 색상·버튼 역할·카드/터치 치수를 각 플랫폼 adapter에서 사용한다. Pretendard 1.3.9는 native OTF와 자체 호스팅 web variable subset으로 제공한다. 주제 사진 7개는 동일 파일이며, 서버가 제공한 유효한 사진이 우선이고 category fallback에는 참고 이미지 표시를 붙인다. 화면 폭과 네이티브 탐색 방식은 플랫폼에 맞게 유지한다.

### 인증 및 회원 프로필 아키텍처

1. **모바일 앱 로그인 단일화 (카카오 로그인)**:
   - 복잡한 휴대폰 SMS 인증을 로그인 진입점에서 걷어내고, 카카오 네이티브 SDK 기반 1-Click 간편 로그인으로 단일화.
   - 시니어 사용자(5060)의 인증 이탈 방지 및 간편한 접근성 보장.
   - 이름/별명, 휴대폰 번호, 활동 지역은 로그인 후 [내 정보] 화면에서 본인이 직접 설정 및 수정 가능.

2. **Firebase 휴대폰 인증 연동 구조 (Firebase Phone Auth)**:
   - Firebase Authentication(Identity Platform)의 Phone Auth 지원:
     - **클라이언트 흐름**: Firebase Phone Auth를 통해 안전한 SMS 인증코드 발송 및 사용자 확인 완료 후 Firebase ID Token 발급.
     - **백엔드 검증**: `FirebasePhoneService` (`POST /v1/auth/firebase/verify-phone`)가 `firebase-admin/auth`의 `verifyIdToken()`을 호출하여 토큰 위변조 여부 및 E.164 전화번호 claim(`phone_number`) 검증.
     - **프로필 동기화**: 검증된 전화번호를 `prisma.user` 레코드의 `phoneNumber` 필드에 안전하게 연결.

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

### 카카오 로그인과 선택형 휴대폰 인증

1. Android는 카카오 네이티브 SDK, 웹은 카카오 OAuth와 쿠키에 연결된 만료 가능한 state를 사용한다.
2. API는 카카오 토큰의 애플리케이션 ID와 사용자 식별자를 검증하고 앱 session을 발급한다. 이메일이 없어도 카카오 가입이 가능하다.
3. 이전 휴대폰·이메일·Google 로그인 API는 비활성화되어 있다. Firebase는 로그인 수단이 아닌 선택형 프로필 번호 증명이다.
4. refresh token은 DB에 hash로 저장되고 사용 시 회전한다. Android session 소유자가 복원과 보호 API 호출의 refresh를 하나의 Promise로 합쳐 중복 소비를 방지한다.
5. 이름·별명·연락처는 프로필에서 수정한다. 저장 결과는 프로필 cache와 session 표시 metadata에 함께 반영한다. 번호가 바뀌거나 지워지면 `phoneVerifiedAt`을 해제한다.

웹 BFF의 운영 session은 `__Host-` 접두어, `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookie를 사용한다. Android의 장기 session은 SecureStore에 보관하며 cache만으로 서버 권한을 부여하지 않는다.

Firebase Admin은 FCM과 별도 ADC app에서 폐기 여부를 포함해 ID token을 검증한다. phone provider, 전화번호 identity, 프로젝트 issuer/audience, E.164, 최근 `auth_time`을 검사한 뒤 현재 카카오 계정에 연결한다. 운영 Phone Auth의 결제/초기화와 서버 ADC가 아직 준비되지 않아 실제 SMS 성공은 검증되지 않았다.

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

- 이전 OTP 로그인과 관련 발송은 비활성화
- 신청 승인·거절·모임 취소 이메일/FCM
- 후기 요청 이메일/FCM
- Android FCM token 등록·해제와 수신 설정

현재 운영 email/SMS/push 외부 채널은 disabled다. 발송하지 않은 outbox를 DELIVERED로 기록하지 않으며, disabled 채널은 명시적 실패로 처리한다. 발송 실패는 이미 commit된 신청 상태를 되돌리지 않는다. 운영은 outbox oldest age, 실패 횟수와 terminal
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

실제 QA에서는 별도 PostgreSQL의 migration·카카오/profile/session·역할·후기·신고 회귀가 통과했다. 운영 DB의 공개 접근을 해제하고 새 strict TLS 연결을 확인했으며, read-only migration/catalog baseline과 임시 PITR 복구본의 동일 해시 및 리소스 정리를 검증했다. 범위와 증거는 [운영 QA 보고서](QA_PRODUCTION_20260930.md)를 따른다.

아직 필요한 검증:

- 실제 provider·역할별 운영 웹/앱 UI와 업무 데이터 복구 정합성
- production Resend·FCM·Socket.IO·계정 삭제 E2E
- 실기기 성능·접근성·푸시·딥링크
- 운영 교체·failback·장애 경보와 가용성 훈련
- 최종 screenshot provenance와 서명 AAB의 App Bundle Explorer 확인

## 관련 문서

- [제품 요구사항](./PRODUCT.md)
- [현재 API 명세](./API.md)
- [배포 런북](./DEPLOYMENT.md)
- [성능·비용 기준](./PERFORMANCE.md)
- [로컬 실행](../README.md)
