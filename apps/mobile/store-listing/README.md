# Google Play 등록정보 자산

- `ko-KR/title.txt`: 앱 이름
- `ko-KR/short-description.txt`: 짧은 설명
- `ko-KR/full-description.txt`: 전체 설명
- `ko-KR/release-notes-0.1.0.txt`: 첫 릴리스 노트
- `icon-512-v2.png`: Play Console용 512×512 RGBA 앱 아이콘
- `feature-graphic-1024x500-v2.png`: Play Console용 1024×500 RGB 피처 그래픽
- `../assets/images/senior-club-icon-v2.png`: 앱 빌드용 1024×1024 아이콘
- `../assets/images/senior-club-adaptive-foreground-v2.png`: Android adaptive foreground
- `../assets/images/senior-club-splash-v3.png`: imagegen 생성·알파 검증을 마친 투명 스플래시 심벌

## 스크린샷

- `screenshots/phone/`: 휴대전화 실제 앱 캡처 6장
- `screenshots/tablet-7/`: 7인치 논리 해상도 실제 앱 캡처 4장
- `screenshots/tablet-10/`: 10인치 논리 해상도 실제 앱 캡처 4장

현재 캡처는 `시니어클럽` 브랜드와 실제 휴대폰 SMS OTP 로그인·모임 API를 연결한
Android 앱에서 생성했다. 모든 파일은 1080×1920, 세로 9:16, 알파가 없는
8-bit RGB PNG이며 다음 명령으로 후보 자산 규격을 검사한다.

```bash
pnpm --dir apps/mobile validate:screenshots
```

Play Console에 올리기 전에는 서명된 제출 APK에서 같은 흐름을 다시 확인하고,
`screenshots/final/ko-KR/manifest.json`에 Git commit과 APK SHA-256, 캡처 환경 및
사람의 검토 결과를 기록한 뒤 더 엄격한 출시 검증을 실행한다.

```bash
pnpm --dir apps/mobile validate:screenshots:release
```

production manifest와 모든 스토어 검사를 포함한 단일 출시 gate는 저장소 루트의
`pnpm release:android:preflight -- --screenshot-manifest <경로>`를 사용한다. 이 명령은 strict screenshot
검사를 건너뛰는 옵션을 제공하지 않는다.

설명 문구는 실제 서버 기능과 심사용 앱이 일치하는 상태에서 사용합니다. 화면 캡처는 Android 테스트 빌드에서 생성하고 개인정보가 포함되지 않았는지 확인합니다.
