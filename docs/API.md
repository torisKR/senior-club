# 시니어클럽 API 명세

> 기준일: 2026-07-30  
> Nest API 기본 경로: `/v1` · 웹 BFF 기본 경로: `/api`

이 문서는 현재 저장소에 구현된 계약만 기록한다. 요청·응답 필드의 최종 소스는
`apps/api/src/**/**.contracts.ts`, 모바일의 엄격한 응답 parser, 해당 테스트다. 초기 prototype의 fixture
계약은 서비스 API가 아니며, `GET /api/home`은 `410 ENDPOINT_RETIRED`를 반환한다.

## 1. 공통 규칙

### 인증

- Nest 보호 API는 `Authorization: Bearer <access-token>`을 요구한다.
- 휴대폰 SMS OTP 검증 뒤 access token과 회전 가능한 refresh token을 발급한다.
- Android 앱은 `401` 시 refresh를 한 번만 수행한 뒤 원요청을 한 번 재시도한다.
- 웹은 Next BFF가 두 token을 `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookie로 보관한다.
- 보호 응답은 `Cache-Control: private, no-store`다.

### 요청·오류·추적

- JSON은 Zod strict schema로 검사한다. 알 수 없는 필드, 잘못된 enum·범위·cursor는 `400`이다.
- 도메인 오류는 `{ "error": { "code": "...", "message": "...", "details": ... } }` 형태다.
- 모든 API 응답에는 `X-Request-ID`가 붙는다.
- 공개 목록은 짧은 CDN cache와 stale-while-revalidate를 사용한다. 사용자별 목록은 공유 cache에
  저장하지 않는다.
- 목록은 opaque cursor를 사용한다. `nextCursor: null`은 마지막 페이지다.

### 멱등성과 재시도

| 변경 작업 | 현재 보장 |
| --- | --- |
| 모임 신청 `POST /v1/events/:id/applications` | 8~160자 `Idempotency-Key` 필수. 동일 사용자·route·key는 첫 결과 재사용 |
| 리더 모임 생성 `POST /v1/events` | 8~160자 `Idempotency-Key` 필수. 동시 동일 요청도 한 모임만 생성 |
| 채팅 전송 | 방·사용자·`clientMessageId` 조합으로 중복 저장 방지 |
| 게시글·댓글 생성 | 서버 멱등성 미지원. 불명확한 결과는 자동 재전송하지 않고 목록을 다시 확인 |
| 후기·신고 생성 | 별도 `Idempotency-Key` 계약 없음. 응답 유실 시 자동 재전송하지 않음 |

## 2. 상태 확인

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/healthz` | 공개 | API 프로세스 liveness |
| GET | `/readyz` | 공개 | 제한 시간 내 PostgreSQL query 성공 시 `200`, 아니면 `503` |
| GET | `/api/healthz` | 공개 | Next 웹 liveness |
| GET | `/api/readyz` | 공개 | API와 DB readiness 확인, 실패 시 `503` |

## 3. 인증·프로필·계정

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/v1/auth/email/request` | 공개 | 기존 이메일 OTP 호환 경로 |
| POST | `/v1/auth/email/verify` | 공개 | 기존 이메일 OTP 호환 경로 |
| POST | `/v1/auth/phone/request` | 공개 | 휴대폰 SMS OTP 요청 |
| POST | `/v1/auth/phone/verify` | 공개 | SMS OTP 검증 및 session 발급 |
| POST | `/v1/auth/refresh` | refresh token | token 회전 |
| POST | `/v1/auth/logout` | refresh token | session 폐기 |
| GET | `/v1/me` | 회원 | 현재 사용자·역할·온보딩 상태 |
| GET | `/v1/interests` | 공개 | 활성 관심사 목록 |
| PATCH | `/v1/me/profile` | 회원 | 이름·출생연도·지역·관심사·동의 갱신 |
| GET | `/v1/me/deletion-request` | 회원 | 현재 계정 삭제 요청 상태 |
| POST | `/v1/me/deletion-request` | 회원 | 최근 인증 확인 후 7일 유예 삭제 요청 |
| DELETE | `/v1/me/deletion-request` | 회원 | 유예 기간 안의 삭제 요청 취소 |

웹의 `/api/auth/*`, `/api/me/profile`, `/api/me/deletion-request`는 위 Nest API를 중계하며 session
cookie를 발급·회전·폐기한다.

## 4. 커뮤니티·모임·신청

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/v1/clubs` | 공개 | 커뮤니티 cursor 목록 |
| GET | `/v1/clubs/:slug` | 공개 | 공개 커뮤니티 상세 |
| GET | `/v1/events` | 공개 | `view`, `category`, `region`, `q`, `limit`, `cursor` 목록 |
| GET | `/v1/events/:id` | 공개 | 공개 모임 상세 |
| POST | `/v1/events/:id/applications` | 회원·온보딩 | 모임 신청. `Idempotency-Key` 필수 |
| GET | `/v1/events/:id/applications/me` | 회원 | 내 신청 상태 |
| DELETE | `/v1/events/:id/applications/me` | 회원 | 내 신청 취소 |
| GET | `/v1/me/applications` | 회원 | 내 신청 목록 |
| GET | `/v1/events/:id/applications` | 해당 운영진 | 신청자 cursor 목록 |
| PATCH | `/v1/applications/:id` | 해당 운영진 | 승인 또는 사유가 있는 거절 |
| PATCH | `/v1/applications/:id/attendance` | 해당 운영진 | 참석 또는 불참 처리 |

신청은 로그인과 온보딩 완료가 필수다. 정원·마감·모임 상태·중복 신청을 같은 DB transaction에서
확인한다. 승인·거절·일정·취소는 인앱 알림과 사용자 설정에 따른 선택적 이메일/FCM outbox를 생성한다.

## 5. 리더 모임 관리

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/v1/leader/clubs` | LEADER/ADMIN | 실제 운영 권한이 있는 활성 커뮤니티 |
| GET | `/v1/leader/events` | LEADER/ADMIN | `upcoming`, `attendance`, `drafts` 관리 목록 |
| GET | `/v1/leader/events/:id` | 해당 운영진 | 비공개 draft를 포함한 관리 상세 |
| POST | `/v1/events` | 해당 운영진 | draft 또는 즉시 공개 생성. 멱등성 key 필수 |
| PATCH | `/v1/events/:id` | 해당 운영진 | 모임 수정 |
| POST | `/v1/events/:id/publish` | 해당 운영진 | draft 공개 |
| POST | `/v1/events/:id/cancel` | 해당 운영진 | 참가 상태·채팅 권한·알림까지 원자적으로 취소 |

전역 `LEADER` role만으로 다른 커뮤니티를 관리할 수 없다. 해당 커뮤니티의 활성 리더·운영진 관계도
서버에서 검사한다.

## 6. 게시글·댓글

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/v1/clubs/:slug/posts` | 공개 | 게시글 cursor 목록, 페이지당 최대 20 |
| POST | `/v1/clubs/:slug/posts` | 회원·온보딩 | 제목 2~100자, 본문 10~5,000자 생성 |
| GET | `/v1/posts/:id` | 공개 | 게시글 상세 |
| PATCH | `/v1/posts/:id` | 작성자 | 게시글 수정 |
| DELETE | `/v1/posts/:id` | 작성자 | 게시글 삭제 |
| GET | `/v1/posts/:id/comments` | 공개 | 댓글·답글 cursor 목록, 페이지당 최대 20 |
| POST | `/v1/posts/:id/comments` | 회원·온보딩 | 댓글 또는 `parentId` 답글 생성 |
| PATCH | `/v1/comments/:id` | 작성자 | 댓글 수정 |
| DELETE | `/v1/comments/:id` | 작성자 | 댓글 삭제 |

공개 응답의 작성자는 `{ id, name }`을 포함한다. 앱은 서버 ID로 수정 권한과 신고·차단 대상을
판단하며 표시 이름을 권한 근거로 사용하지 않는다.

## 7. 후기

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/v1/events/:eventId/reviews` | 공개 | 공개 후기와 공개 집계 |
| GET | `/v1/me/events/:eventId/reviews` | 회원 | 내가 차단한 작성자를 제외한 개인화 후기·집계 |
| GET | `/v1/events/:eventId/reviews/me` | 회원 | 내 후기와 작성 자격 |
| POST | `/v1/events/:eventId/reviews` | 참석 회원 | 별점 1~5, 본문 10~800자 생성 |
| PATCH | `/v1/reviews/:id` | 작성자 | 내 후기 수정 |
| DELETE | `/v1/reviews/:id` | 작성자 | 내 후기 삭제 |

승인 참가자의 `ATTENDED` 기록과 후기 공개 시각을 모두 만족해야 작성할 수 있다. 한 사용자는 한
모임에 활성 후기 하나만 가질 수 있다.

## 8. 채팅

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/v1/chat/rooms?limit=&cursor=` | 승인 참가자/운영진 | 최근 활동순 방 목록 |
| GET | `/v1/chat/rooms/:roomId/messages?limit=&cursor=` | 방 권한 보유자 | 과거 방향 cursor 조회 |
| GET | `/v1/chat/rooms/:roomId/messages?limit=&after=` | 방 권한 보유자 | watermark 이후 증분 조회 |
| POST | `/v1/chat/rooms/:roomId/messages` | 방 권한 보유자 | `clientMessageId`, 본문, 선택 답글 전송 |
| PATCH | `/v1/chat/rooms/:roomId/read` | 방 권한 보유자 | 읽음 갱신 |

`cursor`와 `after`는 함께 보낼 수 없다. 앱은 증분 poll과 주기적 전체 정합성 검사를 결합해 전체
메시지 재다운로드를 줄인다.

Socket.io namespace는 `/chat`, transport는 WebSocket 전용이다. handshake `auth.token`으로 인증하고
`room:join`, `message:send`, `message:new` event를 사용한다. 전송 직전 활성 session·방 권한·상호 차단을
다시 검사한다. REST 전송은 DB에 저장되며, 다중 인스턴스 event bus가 아직 없으므로 증분 조회가 REST
전송과 socket 유실을 최종 보정한다.

## 9. 알림·기기

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| GET | `/v1/me/notifications` | 회원 | cursor 알림 목록 |
| GET | `/v1/me/notifications/unread-count` | 회원 | 읽지 않은 알림 수 |
| PATCH | `/v1/me/notifications/:id/read` | 회원 | 소유 알림 읽음 |
| POST | `/v1/me/notifications/read-all` | 회원 | 전체 읽음 |
| POST | `/v1/devices` | 회원 | Android FCM token 등록·갱신 |
| DELETE | `/v1/devices` | 회원 | FCM token 해제 |
| GET | `/v1/me/notification-preferences` | 회원 | 푸시·이메일 수신 설정 |
| PATCH | `/v1/me/notification-preferences` | 회원 | 수신 설정 갱신 |

DB 변경과 발송 요청은 transaction outbox로 묶인다. `OUTBOX_WORKER_ENABLED=true`인 worker가 lease,
재시도, dedup key를 적용해 SMS·이메일과 FCM을 보낸다. 실제 발송에는 production Twilio·Resend·Firebase 자격
증명이 필요하다.

## 10. 신고·차단·관리자

| Method | 경로 | 인증 | 설명 |
| --- | --- | --- | --- |
| POST | `/v1/reports` | 회원 | USER, POST, COMMENT, REVIEW, CHAT_MESSAGE 신고 |
| GET | `/v1/me/blocks` | 회원 | 내 차단 목록. 계정당 최대 500명 |
| POST | `/v1/me/blocks` | 회원 | 사용자 차단. 본인 차단 불가 |
| DELETE | `/v1/me/blocks/:userId` | 회원 | 차단 해제 |
| GET | `/v1/admin/reports` | ADMIN | 신고 관리 목록 |
| PATCH | `/v1/admin/reports/:id` | ADMIN | 검토·해결·기각과 감사 로그 기록 |

모바일 UGC 화면은 타 사용자의 콘텐츠 신고, 사용자 신고, 사용자 차단을 각각 제공한다. 차단 직후 로컬
목록에서 숨기고 보호된 서버 목록을 다시 읽는다. 채팅은 양방향 차단 관계를 history, 방 preview,
socket fan-out에 모두 적용한다.

## 11. Next 웹 BFF

브라우저는 token을 직접 다루지 않고 같은 origin의 `/api` route를 사용한다. 현재 BFF는 휴대폰 SMS OTP,
프로필, 공개 모임·신청, 리더 운영, 게시글·댓글, 후기, 채팅, 알림, 계정 삭제, ADMIN 신고 처리를
중계한다. upstream `401`에서는 refresh를 한 번만 시도하고 cookie를 회전한다. refresh도 실패하면
cookie를 제거한다. 보호 응답은 `private, no-store`와 `Vary: Cookie`를 사용한다.

## 12. 아직 이 계약에 없는 기능

- 카카오·네이버·Google OAuth
- 사용자 사진·파일 업로드와 S3 presigned URL
- 앱 내 결제·구독
- 관리자 회원 검색·통계 dashboard·뉴스레터 작성 UI
- Redis Socket.io adapter 또는 broker 기반 다중 인스턴스 fan-out
- Swagger/OpenAPI 자동 문서 endpoint

이 기능을 추가할 때는 API 계약, 개인정보 처리방침, Data Safety, Android 권한, 비용 기준을 같은
릴리스에서 갱신한다.
