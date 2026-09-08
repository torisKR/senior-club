# 시니어클럽 Android 출시 준비 상태

기준일: 2026-07-30

## 현재 결론

앱·웹·API는 로컬 통합 검증과 Play 내부 테스트 AAB를 준비할 수 있는 단계다. 휴대폰 SMS OTP 인증, 세션
회전, 프로필·관심사, 공개 클럽·모임, 신청/취소, 텍스트 게시글·댓글·후기·채팅, 인앱 알림,
신고·차단, native FCM token 등록과 계정 삭제 요청은 더 이상 기기 내 체험 흐름이 아니라 실제 API
계약에 연결돼 있다.

다만 production DB 적용, Resend/Firebase/EAS 자격 증명, 실제 메일·푸시 실기기 검증, 운영 정책과
최종 스크린샷 증빙·AAB/Play Console 검증이 남아 있으므로 현재 상태로 Play production 트랙에
제출하지 않는다.

## 완료된 구현

- Expo SDK 57 / React Native 0.86, Android target·compile SDK 36 기반
- `com.toris.seniorclub`, 앱 이름 `시니어클럽`, EAS 원격 `versionCode` 자동 증가
- 직접 설치 APK(`internal`, `preview`)와 Play AAB(`playInternal`, `production`) 프로필 분리
- `allowBackup=false`, cleartext/debuggable 차단 검사, 민감 권한 remove marker
- adaptive/monochrome icon, splash, Play 512×512 icon과 1024×500 feature graphic
- 한국어 ASO 제목·짧은 설명·전체 설명·릴리스 노트 초안
- 휴대폰 SMS OTP 요청/검증, access token 메모리 보관, refresh token SecureStore 보관·rotation
- 401 single-flight refresh 후 원요청 1회 재시도와 인증 실패 시 credential fail-closed 제거
- 웹·Android 모두 로그인과 서버 프로필 완료 전 모임 신청 차단, 로그인·온보딩 뒤 원래 신청 화면 복귀
- 실제 관심사 목록·이름·지역·출생연도·관심사 1~3개를 PostgreSQL에 저장하고 기기 간 복원
- 실제 모임 목록·상세·신청·취소 API와 재시도에도 유지되는 `Idempotency-Key`
- React Native에서도 동작하는 `expo-crypto` UUID 기반 `Idempotency-Key` 생성과 실패 시 fail-closed 처리
- 실제 공개 클럽 목록·상세와 클럽별 텍스트 게시글·댓글 작성/수정/삭제
- 참석 자격·작성 시점을 서버에서 확인하는 텍스트 후기 작성/수정/삭제와 공개/개인화 후기 목록
- 승인된 모임의 채팅방·텍스트 메시지·읽음 처리, cursor pagination과 20초 증분 동기화
- 실제 인앱 알림 목록·미읽음 수·개별/전체 읽음 처리와 알림 수신 설정
- 리더의 담당 클럽/모임 cursor 목록, 모임 생성/수정/공개/취소, 신청 승인·거절·출석, 정원·상태
  동시성 검사와 이메일·FCM outbox 연결
- 승인 시 채팅 멤버십 부여, 취소 시 회수, 재승인 시 복원 및 실시간 전송 직전 현재 세션·권한 일괄 재검증
- 모바일 UGC의 콘텐츠/사용자 신고와 사용자 차단/해제, 관리자 신고 조회·처리와 감사 이력
- Android channel → 알림 권한 → native FCM token 순서와 `/v1/devices` 등록/해제
- EAS 환경별 `EXPO_PUBLIC_APP_ENV`, production `GOOGLE_SERVICES_JSON` file-secret 및 post-install
  manifest/Firebase Android client gate
- foreground/background/cold-start 알림 탭의 내부 경로 allowlist와 중복 응답 차단
- 인앱 `POST /v1/me/deletion-request`, 확인 문구·선택 사유·최근 인증 오류 UX, 성공 후 credential 제거
- PostgreSQL schema, baseline migration SQL, outbox, health/readiness, non-root API Docker image
- ChatGPT Sites Web + ECS API/PostgreSQL 기준 CI·환경변수·배포 런북

## 검증 게이트

테스트 파일·테스트 case·번들 모듈 개수는 기능 추가 때마다 바뀌므로 문서에 통과 개수를 고정하지 않는다.
기능 구현 과정에서 아래 게이트의 통과 이력은 있지만, Play 제출 증거는 하나의 release candidate commit에서
전부 다시 실행한 로그와 산출물만 인정한다.

| 영역 | release candidate 필수 게이트 |
| --- | --- |
| 의존성 | Node 24 / pnpm 9.14.2에서 `pnpm install --frozen-lockfile` |
| 웹 | `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `next start` 핵심 route smoke |
| API | API lint/typecheck/test/build, Prisma validate, production Docker build·non-root 실행 |
| DB | 빈 DB 전체 migration, 직전 schema upgrade, 역할별 PostgreSQL e2e와 backup 복구 rehearsal |
| 모바일 | lint/typecheck/Vitest, Expo Doctor, Android production export |
| Play 정적 검사 | 아이콘·피처 그래픽·문구, Android manifest, release endpoint/EAS build ID/workflow validator |
| Play 실행 검사 | final screenshot manifest, EAS AAB, App Bundle Explorer, 실기기 OTP·FCM·핵심 여정 |

현재 14장의 후보 스크린샷은 실제 Android 앱 UI에서 캡처했고 기술 규격 검사를 통과했다. 다만
서명된 제출 APK/AAB의 commit·SHA-256과 사람의 검토를 담은 `final/ko-KR/manifest.json`은 아직
없으므로 출시 증명 검사는 제출 전 release gate로 남겨 둔다. Play App Bundle Explorer의 최종
merged manifest도 AAB 업로드 후 다시 확인한다.

## 프로덕션 제출 차단 조건

1. Railway PostgreSQL에 baseline migration을 적용하고 OTP → refresh rotation → 신청/취소 → 기기 등록
   → 계정 삭제까지 실제 DB e2e를 통과시켜야 한다.
2. Resend 발신 도메인, Railway Firebase Admin secret, EAS `GOOGLE_SERVICES_JSON` Android client
   file-secret과 Twilio SMS 발신 번호를 구성하고 실제 SMS 수신 및 foreground/background/terminated FCM 수신을
   실기기에서 확인해야 한다.
3. `privacy@clubsenior.kr` 등 공개 연락처를 실제 수신 가능하게 만들고 약관·개인정보 처리방침의
   운영 주체, 위탁처리자, 보유 기간, 삭제 SLA와 `CONSENT_DOCUMENT_VERSION`을 확정해야 한다.
4. 준비된 후보 세트를 서명된 제출 APK/AAB와 동일 commit에서 다시 확인하고 APK 해시·캡처 환경·
   수동 확인을 기록한 screenshot release manifest 검사를 통과해야 한다.
5. Play Console 앱, Play App Signing, EAS keystore, 서비스 계정 최소 권한, Data Safety와 계정 삭제
   URL을 실제 소유 계정에서 구성해야 한다.
6. production HTTPS 도메인과 딥링크 범위를 확정해야 한다. 이메일/웹의 HTTPS 링크를 앱에서 직접
   열겠다고 약속할 경우 Android App Links와 `assetlinks.json`을 함께 배포한다.
7. 실제 production 데이터로 클럽·모임·게시글·댓글·후기·채팅·알림과 리더/관리자 흐름을 역할별로
   끝까지 검증해야 한다.
8. 신고·차단 API와 운영 이력은 모바일 UGC 화면 및 관리자 처리 흐름까지 end-to-end로 검증해야 한다.
   게시글·댓글·후기·채팅마다 콘텐츠 신고와 사용자 차단을 구분해 제공하고, 차단 결과가 서버의
   콘텐츠 노출·상호작용에도 반영되는지 확인한다. 이용약관 동의 없이 UGC를 작성할 수 없어야 한다.

현재 인증 범위는 휴대폰 SMS OTP이며 OAuth는 출시 blocker가 아니다. 이메일은 선택 알림 채널로만 사용한다. 현재 UGC 범위도 텍스트뿐이므로 S3
또는 사진/파일 권한은 필요하지 않다. 소셜 로그인이나 미디어 업로드를 Play 설명에 포함하는 향후
릴리스에서만 공급자 설정, 저장소, 권한과 Data Safety/삭제 연계를 새 차단 조건으로 추가한다.

production API origin은 공개 HTTPS만 허용한다. 예약·예시 도메인이나 localhost, 사설/link-local IP로
빌드가 조용히 진행되지 않도록 런타임 환경 파서와 manifest validator가 동일한 판정을 사용한다.

## 내부 트랙 순서

```bash
cd apps/mobile
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/eslint .
EXPO_PUBLIC_APP_ENV=production \
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
EXPO_PUBLIC_WEB_URL=https://실제-웹-도메인 \
  ./node_modules/.bin/expo export --platform android --clear
npx eas-cli@21.3.0 build --platform android --profile playInternal
```

실제 내부 AAB는 [수동 GitHub workflow](../.github/workflows/android-play-internal.yml)로 만드는 경로를
기준으로 한다. GitHub Environment `play-internal`의 `EXPO_TOKEN`,
`GOOGLE_SERVICES_JSON_BASE64` secret과 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` variables 중 하나라도 없으면 빌드 전에
실패한다. production preflight와 final screenshot manifest strict 검사를 먼저 통과한 뒤에만
EAS CLI `21.3.0`의 `playInternal` 빌드를 실행한다.

빌드 결과 JSON은 단일 `FINISHED` Android UUID인지 fail-closed로 검증해 evidence artifact로 보관한다.
`submit_to_play=true`를 선택한 경우에만 그 정확한 ID를 `playInternal`의 `draft`로 제출한다.
`--latest`와 production 트랙 승격은 워크플로에 없다. 첫 Play 업로드는 Console에서 수동으로 package와
Play App Signing을 연결하고 EAS에 최소 권한 서비스 계정을 구성한 뒤 선택 제출을 활성화한다.

EAS build/submit은 외부 계정, 서명 자격 증명과 유료 사용량을 사용하므로 workflow 수동 실행에도
승인이 필요하다. 이 저장소 검증에서는 실제 EAS build/submit을 호출하지 않는다.

최종 캡처 manifest와 Firebase Android client file을 준비한 뒤에는 빌드 전에 아래 단일 gate를 실행한다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
EXPO_PUBLIC_WEB_URL=https://실제-웹-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  -- --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

현재 final screenshot manifest와 실제 production client file, GitHub/EAS/Play 자격 증명이 없으므로
이 gate와 수동 workflow는 의도적으로 실행 준비 완료가 아니다. 또한 preflight 성공은 AAB binary
검증을 뜻하지 않는다. 실제 AAB 생성 후 App Bundle Explorer의 package/versionCode/target
API/signing/merged manifest 확인은 별도 제출 차단 조건이다.
