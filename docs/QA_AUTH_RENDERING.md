# 인증 렌더링 QA (2026-09-21)

## 범위와 기준

- 기준: `origin/main`의 `d9f0657`. 브랜치 `fix/web-auth-snapshot-hydration`.
- PR #30 (`ci/android-direct-gradle`, `2c21154`)은 별도 보존. Android 배포 변경을 이 PR에 포함하지 않는다.
- 운영 DB, 계정, SMS/OAuth 공급자, 유료 빌드/Play 배포에는 접근하지 않았다.
- Node 24.16.0 / pnpm 9.14.2 사용. 최초 PATH의 Node 26은 engine-strict로 거부되어 설치된 Node 24로 전환했다. 환경의 NODE_ENV=production 때문에 React act가 없던 테스트 실행도 NODE_ENV=test로 바로잡았다.

## 재현 및 수정

1. **P1: 캐시된 프로필이 있으면 AuthNav 무한 업데이트**
   - 실제 React createRoot + jsdom에서 유효한 localStorage 프로필을 넣고 렌더링.
   - 수정 전 `The result of getSnapshot should be cached` 및 `Maximum update depth exceeded` 발생.
   - 원인: snapshot 호출마다 JSON.parse가 새 객체를 반환.
   - 수정: 직렬화된 원시 문자열 snapshot을 비교하고 useMemo에서 프로필 객체를 복원.
   - 캐시 이름 변경과 삭제, 로그아웃 상태 갱신까지 검증.
2. **P2: OAuth error URL의 서버/클라이언트 hydration 불일치**
   - window 없이 renderToString 후 `/login?error=qa-oauth-error`에서 hydrateRoot.
   - 수정 전 onRecoverableError에 `Hydration failed ... tree will be regenerated`가 기록됨. 실제 Next dev 서버에도 동일 오류가 기록됨.
   - 수정: useSyncExternalStore의 빈 서버 snapshot으로 hydration을 맞추고 이후 URL 오류를 읽는다. 사용자 입력/동의로 오류를 지우는 기존 동작 유지.

회귀 테스트: `src/components/auth-hydration.test.ts`. 기존 테스트는 서버 정적 마크업 중심이어서 두 결함을 잡지 못했다. jsdom은 테스트 전용 개발 의존성이다. lockfile은 pnpm이 생성했으며 peer-resolution 정규화도 포함된다.

## 실행 결과

모든 pnpm 명령의 PATH 앞에 `/Users/toris/.nvm/versions/node/v24.16.0/bin`을 사용했다.

| 명령 | 결과 |
| --- | --- |
| `NODE_ENV=test pnpm exec vitest run src/components/auth-hydration.test.ts` (수정 전) | 두 원인에 대해 RED 확인 |
| 같은 명령 (수정 후, 신청/취소/로그아웃 검사 추가) | 4 passed |
| `NODE_ENV=test pnpm lint` | 통과 |
| `NODE_ENV=test pnpm typecheck` | 통과 |
| `NODE_ENV=test pnpm test` | 83 files / 453 tests passed |
| `NODE_ENV=development pnpm install --frozen-lockfile` | 통과 |
| `SENIOR_CLUB_API_BASE_URL=http://127.0.0.1:4999 pnpm build` | Next production build 통과 |
| `pnpm --filter @senior-club/api typecheck` / `test` / `build` | 통과, 257 passed / 10 skipped (35 passed files / 3 skipped files) |
| `pnpm --filter mobile lint` / `typecheck` / `test` | 통과, 27 files / 170 tests passed |
| `pnpm mobile:test:release-validators` | 23 passed |
| `EXPO_NO_DOTENV=1 EXPO_PUBLIC_APP_ENV=development EXPO_PUBLIC_API_URL=http://127.0.0.1:4999 EXPO_PUBLIC_WEB_URL=http://127.0.0.1:3100 KAKAO_NATIVE_APP_KEY=0123456789abcdef0123456789abcdef pnpm --filter mobile exec expo export --platform android --output-dir /tmp/senior-club-qa-android-export` | Android JS/Hermes export 통과. 테스트 키이며 실제 공급자 인증 아님 |

## 브라우저와 데이터 경계

Next production 서버를 로컬 3100에서 실행하고 Chromium으로 확인했다. upstream은 의도적으로 실행되지 않는 로컬 4999로 고정했다.

- `/login?error=qa-oauth-error`: 실제 URL 오류 표시, 모두 동의 클릭 후 오류 제거, 새 console error 없음.
- `/me`: 비로그인에서 `/login?returnTo=%2Fme`로 이동.
- `/events`, `/clubs`: 탐색 화면 렌더링 및 API 불가 안내 표시. 가짜 목록으로 대체하지 않음. 실제 목록 내용/검색 결과 정확성 검증은 아님.
- `GET /api/healthz`: 200. 비인증 `GET /api/events/qa-event/applications`: 401.
- 로컬 프로필 fixture 삽입 + cache-change 이벤트: 로그인된 모양의 헤더가 무한 렌더 없이 표시됨. **실제 인증은 아니다.**
- `http://localhost:3100`에서 로그아웃 클릭: 실제 로컬 BFF POST 200, localStorage 캐시 null, console error 없음. 쿠키 없는 세션이므로 실제 서버 토큰 폐기까지 증명하지 않는다.
- `127.0.0.1` origin에서는 동일 POST가 INVALID_ORIGIN 403, `localhost`에서는 200. 로컬 URL 정규화/기동 설정 차이로 기록하며 보안 origin 검사를 완화하지 않았다.
- 모임 신청 → 승인 대기 → 취소 확인 → 취소 완료는 jsdom에서 mock fetch 응답으로 검증했다. 실제 DB 변경은 없다.

## 미검증 및 후속 우선순위

- 실제 계정 OTP/SMS·Google·Kakao OAuth·refresh 회전·서버 로그아웃, 로그인 후 프로필 저장/다중기기 동기화, 실제 모임 신청/취소 및 역할별 DB E2E.
- 모바일 실기기/에뮬레이터 화면 조작, 네이티브 Kakao SDK 인증, 딥링크 복귀, 푸시, 결제, 서명 APK/AAB. export 성공은 native runtime 검증이 아니다.
- 모바일 로그인 코드는 휴대폰 및 Kakao 경로를 확인했으며 Google UI 구현 완료로 보고하지 않는다.
- API DB 관련 skipped 테스트, Docker image, Cloudflare build는 이 로컬 QA에서 실행하지 않았다. PR CI의 별도 결과를 확인해야 한다.
- 추가 검증은 테스트 계정과 폐기 가능한 로컬 DB를 확보한 뒤 인증 → 프로필 → 신청/취소 → 로그아웃 순으로 진행한다. 현재 보고만으로 출시 준비 완료라 판단하지 않는다.
