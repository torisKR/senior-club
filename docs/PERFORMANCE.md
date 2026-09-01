# 시니어클럽 성능·API 비용 기준

기준일: 2026-07-30

## 측정 원칙

앱 화면용 로고를 launcher 원본과 분리하고, 번들 JPEG를 화면 용도에 맞게 축소한 최적화는 현재
소스에 반영돼 있다. 기능과 의존성이 계속 바뀌는 동안의 export 바이트·모듈·자산 개수는 출시
증거로 고정하지 않는다. 출시 후보 commit마다 같은 명령으로 새 export를 만들고 전체 크기,
`assets`와 Hermes bundle을 기록한다.

검증 명령:

```bash
cd apps/mobile
./node_modules/.bin/expo export --platform android --output-dir /tmp/senior-club-export --clear
du -sk /tmp/senior-club-export
find /tmp/senior-club-export -type f -print0 | xargs -0 ls -lhS | head -20
```

Expo Router 공통 번들에 포함되는 심볼 폰트는 앱 코드에서 탭 PNG만 사용해도 남을 수 있다. 패키지
패치나 비공식 alias는 업데이트 안정성을 해치므로, 실제 release export에서 회귀 예산을 넘을 때만
공식 지원 경로로 교체 여부를 검토한다.

## 네트워크와 API 비용

- 웹과 Android 앱의 공개 클럽·모임·게시글·댓글·후기와 로그인 사용자의 프로필·신청·채팅·알림·
  신고/차단·계정 삭제는 Nest API를 사용한다. 리더 모임 관리와 관리자 신고 처리도 같은 API와
  PostgreSQL을 진실 원본으로 사용한다.
- 초기 프로토타입이 번들 이미지를 원격 도메인에서 다시 받던 경로를 제거했다. 현재 포함된 브랜드·
  행사 이미지는 앱 bundle에서 읽으므로 같은 파일에 대한 불필요한 호스팅 전송이 없다.
- 외부 사용자 이미지가 도입되면 `expo-image`의 `memory-disk` 캐시와 content-hash CDN URL을
  사용한다. 목록에는 원본 대신 640~960px 썸네일을 내려준다.
- 공개 모임 API는 브라우저 30초, 공유 캐시 120초, stale-while-revalidate 300초 정책을 응답하고,
  Next 서버 fetch도 120초 Data Cache를 사용한다.
- 공개 관심사 목록은 브라우저 300초, 공유 캐시 3600초, stale-while-revalidate 86400초로 재사용한다.
  이름·지역·출생연도·관심사 저장과 조회는 사용자별 서버 진실이며 공유 캐시에 넣지 않는다.
- 사용자별 프로필·신청·채팅·알림처럼 개인 데이터가 섞인 응답은 `private, no-store`를 유지한다.
- 현재 출시 범위의 게시글·댓글·후기·채팅은 텍스트 전용이며 사용자 사진/파일 업로드 요청이 없다.
  미디어 기능을 도입할 때에는 클라이언트 축소, private object storage의 presigned upload,
  썸네일/CDN, MIME·크기 검사와 계정 삭제 연계를 별도 설계한다.
- 이메일과 FCM은 화면 조회마다 보내지 않고 신청 접수·승인·일정 변경 같은 상태 전이에서만
  outbox/idempotency key를 통해 한 번 발송한다.

### 유휴 worker 비용

단일 worker의 비어 있는 큐를 기준으로, 트랜잭션 `BEGIN/COMMIT`은 제외하고 애플리케이션 SQL만
계산했다.

| 항목 | 변경 전/일 | 변경 후/일 |
| --- | ---: | ---: |
| outbox claim 조회 | 43,200 | 17,280 |
| outbox terminal lease 정리 | 43,200 | 288 |
| 계정 삭제 due 조회 | 17,280 | 288 |
| 합계 | 103,680 | 17,856 |

기본 outbox 주기를 2초에서 5초로 조정하고 terminal lease 정리를 5분 주기로 제한했으며, 7일 유예
계정 삭제 확인은 별도 5분 주기로 분리했다. 유휴 SQL은 약 82.8% 감소한다. 계정 삭제는 시작 시 한 번
즉시 확인하고 주기마다 최대 25건을 배치 처리하므로 주기를 늘려도 적체되지 않는다. outbox 배치도
10건에서 25건으로 늘렸고, 만료된 OTP는 이메일 제공자를 호출하지 않고 종료한다. stale lease 조회는
`(status, locked_at)` 인덱스를 사용하도록 별도 migration을 추가했다.

리더가 동일한 승인·거절 상태를 재전송하거나 두 요청이 동시에 도착하면 event lock 뒤 최신 신청
상태를 다시 확인한다. 이미 목표 상태라면 transition, 인앱 알림, Resend, FCM outbox를 다시 만들지
않는다. 반대 결정이 먼저 완료됐거나 신청·모임이 더 이상 처리 가능한 상태가 아니면 부작용 없이
`409`로 중단한다.

리더 운영 목록은 모임 최대 50개, 신청 최대 100개 단위의 opaque cursor pagination을 사용한다.
신청자 projection에서는 이메일·내부 사용자 ID·정확한 출생연도를 제외하고 연령대만 반환한다.
페이지에 포함된 모임들의 정확한 승인 대기 수는 `EventMember` groupBy 한 번으로 함께 집계해
화면별 N+1 조회와 100건 이후 과소 집계를 피한다.

Socket.IO 채팅 메시지를 배포하기 전 방 권한 projection 1회와 해당 방 socket session batch 조회 1회로
현재 권한·세션 만료·폐기 여부를 검증한다. socket마다 DB를 조회하는 N+1 경로 없이 권한이 사라진
socket을 방에서 제거하고 허용된 대상에만 전송한다.

웹과 Android 채팅 화면은 20초 증분 polling에서 마지막 `after` cursor 이후 메시지만 받고, 한 번의
poll에서 최대 3개 page만 비운다. 5분마다 또는 수동 새로고침 때 최신 page를 완전 재조정해 누락을
복구한다. 방 목록과 과거 메시지는 opaque cursor pagination을 사용하며 개인 응답은 캐시하지 않는다.

공개 모임 목록·상세의 Prisma 쿼리는 같은 명시적 projection을 사용한다. 응답에 필요하지 않은
`clubId`, `creatorId`, 위·경도, 생성·수정 시각 6개 Event scalar를 DB에서 읽지 않으며, club·interest·
leader와 승인 인원 집계만 계약에 맞게 선택한다.

## 웹 비용 최적화

- 홈·클럽·모임·공개 게시글 페이지와 그 공개 API fetch는 120초 ISR/Data Cache를 사용한다.
  `/sitemap.xml`은 한 시간(`revalidate = 3600`) 단위로 갱신하고, 모임과 클럽 catalog를 각각 최대
  4 page까지 제한해 sitemap 요청 한 번이 upstream을 무제한 순회하지 않게 한다.
- 검색 파라미터를 쓰는 목록과 동적 상세는 요청 시 렌더링될 수 있지만 내부 공개 catalog fetch의
  120초 Data Cache는 유지한다. 로그인 사용자 응답은 이 캐시에 섞지 않는다.
- 기본 모임 목록에서는 조회 조건과 전체 신청 가능 집계 조건이 같을 때 동일 catalog 결과를
  재사용한다. 검색·카테고리·지난 모임처럼 조건이 다른 경우만 두 요청을 병렬 실행한다.
- 모임 신청 상태와 계정 삭제 상태는 각각 보호된 상태 API의 `200/401`만으로 인증 여부까지 판단한다.
  기존 `/api/auth/session` 선행 요청을 제거해 로그인 사용자의 초기 BFF/API 요청을 2회에서 1회로
  줄이고 네트워크 waterfall을 없앴다.
- Next Image breakpoint를 실제 화면 폭으로 제한하고 변환 결과 TTL을 30일로 설정했다.
- 게시글 쓰기/수정/삭제는 관련 공개 tag를 즉시 무효화한다. 모임·클럽 공개 페이지는 현재 최대
  120초 stale을 명시적으로 허용하며, 운영상 즉시 반영이 필요해지면 event/club tag 무효화를 추가한다.
- 공개 catalog와 개인 추천 응답을 같은 캐시 키에 섞지 않는다.

## 회귀 예산

- Android export: 6MB 이하
- 앱 화면 로고: 50KB 이하
- 번들 JPEG: 파일당 250KB 이하
- 번들 이미지의 의도하지 않은 외부 재요청: 0건
- Play vitals 목표: user-perceived crash < 1.09%, ANR < 0.47%
