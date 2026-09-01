# 시니어클럽 릴리스 증거 스냅샷

기준 시각: 2026-08-09 (Asia/Seoul)

## 현재 산출물

- Android package: `com.toris.seniorclub`
- 표시 버전: `0.1.0`
- versionCode: `11`
- EAS build: `bcd2f57e-18d1-437a-9ec3-49f261028445`
- EAS build log: https://expo.dev/accounts/tony3000/projects/club-senior/builds/bcd2f57e-18d1-437a-9ec3-49f261028445
- EAS artifact: https://expo.dev/artifacts/eas/ZnzfwOXRLwGXnuMfYCrjbzW9ziaSfNhjvi4fCoTLOFU.aab
- AAB: `apps/mobile/build-output/app-seniorclub-v11.aab`
- AAB SHA-256: `6a25867e877fc021ef40db664a9b904ab59440d089342aee3217b19725d71d57`
- 업로드 인증서 SHA-1: `10:7B:34:40:34:72:38:55:F1:2E:67:62:8D:8D:5D:62:24:FD:02:26` (Play 요구값과 일치)
- AAB merged manifest 확인: target/compile SDK 36, `allowBackup=false`

## 검증

- Web: Vitest 71 files / 420 tests, TypeScript, Next production build 통과
- API: Vitest 32 files / 232 tests, TypeScript 통과
- Mobile: Vitest 21 files / 145 tests, TypeScript, ESLint 통과
- Play asset, Android manifest, 후보 스크린샷 규격 검증 통과
- Android release validator 23개 통과; `validate:store` 자산·병합 manifest·후보 스크린샷 검증 통과
- strict 최종 스크린샷 validator는 의도대로 `store-listing/screenshots/final/ko-KR/manifest.json` 부재로 차단
- Play Console v10 업로드는 기존 업로드 키와 불일치하여 거부됨; v11은 Play 요구 인증서로 재빌드 완료
- Play Console 프로덕션 초안에 v11 App Bundle 업로드·최적화·검증 완료, 출시명/ko-KR 출시 노트 저장 완료
- Play 공개 전환은 아직 실행하지 않음 (스토어 콘텐츠·운영 자격증명·정책 게이트와 최종 검토 필요)
- Android export: `/private/tmp/senior-club-export`, 10,652KB
- Vercel production: `clubsenior.vercel.app`, deployment `dpl_2DEiQV8Kx15XrppS9gS7teKkUDpi`, `READY` (2026-08-09 재확인 HTTP 200)
- Live ECS health/readiness: `/healthz` 200, `/readyz` 200 (2026-08-09 재확인)
- 휴대폰 인증 운영 smoke: `POST /v1/auth/phone/request` 빈 body는 `400 INVALID_REQUEST`, 형식이 맞는 테스트 번호는 `201`과 `challengeId`를 반환; Vercel BFF `POST /api/auth/phone/request`도 `201` 확인
- ECS 수정 배포: 서비스 `senior-club-api`, task definition `senior-club-api:4`, 실행 이미지 `senior-club-api:0.1.2`; 기존 task definition `:3`에서 롤링 교체 완료
- 비로그인 신청 차단: `POST /v1/events/:id/applications`는 `401 AUTHENTICATION_REQUIRED` 확인
- 현재 운영 DB의 공개 예정 모임은 0개이며 과거 모임만 남아 있어, 로그인 이후 실제 신청 시나리오는 새 모임 데이터와 SMS 공급자 설정이 필요

## 브랜드 자산

- 앱 로고: `apps/mobile/assets/images/senior-club-logo-ui-v3.png`
- 앱 스플래시: `apps/mobile/assets/images/senior-club-splash-v3.png`
- 웹 마크: `public/images/senior-club-mark-v3.png`
- sprite-gen 후보 큐레이션: `http://127.0.0.1:62469/`

## 공개 배포 전 차단

- ECS 서비스는 task definition `senior-club-api:4`로 갱신됐지만 `NODE_ENV=development`, `EMAIL_PROVIDER=console`, `PUSH_PROVIDER=disabled` 상태다.
- Secrets Manager에는 `senior-club/api`, `wax-balls/google-play-sa`만 확인되며 Twilio SMS, Resend 이메일, Firebase Admin/FCM 운영 자격증명이 필요하다.
- 최종 Play 스크린샷 manifest와 서명 APK 캡처 증거가 없다.
- 약관·개인정보·계정삭제 페이지의 운영 주체·연락처·보유기간이 임시 문구다.
- Play Console/AAB 공개 전환은 위 게이트와 App Bundle Explorer 확인 뒤에만 실행한다.

비밀값, 서비스 계정 JSON, Play 토큰은 이 문서와 저장소에 기록하지 않는다.
