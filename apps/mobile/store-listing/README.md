# Google Play 등록정보 자산

- `ko-KR/title.txt`: 앱 이름
- `ko-KR/short-description.txt`: 짧은 설명
- `ko-KR/full-description.txt`: 전체 설명
- `ko-KR/release-notes-0.1.1.txt`: 현재 카카오 전용 로그인·프로필·Android 디자인 수정 안내
- `ko-KR/release-notes-0.1.0.txt`: 과거 첫 릴리스 기록
- `icon-512-v2.png`: Play Console용 512×512 RGBA 앱 아이콘
- `feature-graphic-1024x500-v2.png`: Play Console용 1024×500 RGB 피처 그래픽
- `../assets/images/senior-club-icon-v2.png`: 앱 빌드용 1024×1024 아이콘
- `../assets/images/senior-club-adaptive-foreground-v2.png`: Android adaptive foreground
- `../assets/images/senior-club-splash-v3.png`: imagegen 생성·알파 검증을 마친 투명 스플래시 심벌

## 스크린샷

- `screenshots/phone/`: 휴대전화 실제 앱 캡처 6장
- `screenshots/tablet-7/`: 7인치 논리 해상도 실제 앱 캡처 4장
- `screenshots/tablet-10/`: 10인치 논리 해상도 실제 앱 캡처 4장

이 14장은 과거 Android 앱의 후보 캡처이며 현재 카카오 전용 로그인·글자·하단 탐색 디자인의
최종 증거가 아니다. SMS OTP 안내나 과거 UI를 현재 등록정보로 재사용하지 않는다.
모든 파일은 1080×1920, 세로 9:16, 알파가 없는 8-bit RGB PNG이며 다음 명령은
후보 자산의 규격만 검사한다.

```bash
pnpm --dir apps/mobile validate:screenshots
```

Play Console에 올리기 전에는 최종 고정 소스의 실제 서명 APK에서 카카오 로그인과 기능 흐름을 확인하고,
`screenshots/final/ko-KR/manifest.json`에 Git commit과 APK SHA-256, 캡처 환경 및
사람의 검토 결과를 기록한 뒤 더 엄격한 출시 검증을 실행한다.

```bash
pnpm --dir apps/mobile validate:screenshots:release
```

production manifest와 모든 스토어 검사를 포함한 단일 출시 gate는 저장소 루트의
`pnpm release:android:preflight -- --screenshot-manifest <경로>`를 사용한다. 이 명령은 strict screenshot
검사를 건너뛰는 옵션을 제공하지 않는다.

현재 설명은 카카오 전용 로그인과 선택형 프로필 연락처에 맞췄다. 문구·PNG 규격 검사 통과를
Console 반영·정책 확정·사람의 검토 완료로 취급하지 않는다. 최신 디자인의 실기기 QA는
[디자인 보고서](../../../docs/MOBILE_DESIGN_REVISION_20260930.md), 실제 제출 절차는
[현재 Play 인수 문서](../../../docs/PLAY_UPLOAD_HANDOFF.md)를 따른다.
