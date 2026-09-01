# Google Play 스크린샷 패키지

이 디렉터리는 실제 Android 빌드에서 캡처한 Google Play 등록용 스크린샷을
관리한다. 스크린샷을 생성하거나 앱 화면을 위조하는 디렉터리가 아니라, 최종
캡처본의 이력과 규격을 검증하는 패키지다.

## 현재 후보 자산

실행 중인 `시니어클럽` Android 앱에서 캡처한 후보 자산은 다음 위치에 있다.

```text
screenshots/
├── phone/       # 6장: 로그인, 홈, 목록, 상세, 신청, 신청 완료
├── tablet-7/    # 4장: 홈, 커뮤니티, 목록, 상세
└── tablet-10/   # 4장: 홈, 커뮤니티, 목록, 상세
```

모두 1080×1920 세로 9:16, 알파가 없는 8-bit RGB PNG다. 아래 명령은 파일 수,
크기, 색상 형식, 비율과 동일 기기군 내 중복 여부를 검사한다.

```bash
pnpm --dir apps/mobile validate:screenshots
```

이 검사는 스토어 후보 자산의 기술 규격 검사다. 서명된 제출 APK와의 동일성까지
증명하는 최종 출시 검사는 아래 `final/ko-KR` 구조와 manifest를 사용한다.

## 최종 구조

```text
screenshots/
├── manifest.example.json
├── manifest.json              # 실제 캡처 메타데이터, 자격 증명 금지
└── final/
    └── ko-KR/
        ├── phone-01-home.png
        ├── ...
        ├── phone-06-interests.png
        ├── tablet-7-01-home.png
        ├── ...
        ├── tablet-7-04-applications.png
        ├── tablet-10-01-home.png
        └── ...
```

## 필수 세트

| 기기 | 수량 | 권장 크기 | 방향·비율 |
| --- | ---: | ---: | --- |
| 휴대전화 | 5~6장 | 1080×1920 | 세로 9:16 |
| 7인치 태블릿 | 4~8장 | 1080×1920 | 세로 9:16 |
| 10인치 태블릿 | 4~8장 | 1080×1920 이상 | 세로 9:16 |

시니어클럽 앱은 세로 고정이므로 태블릿도 세로로 캡처한다. 가로 에뮬레이터에
세로 앱을 띄워 생기는 검은 여백은 제출하지 않는다.

## manifest 사용

1. `manifest.example.json`을 `manifest.json`으로 복사한다.
2. `REPLACE_WITH_*` 값을 실제 빌드·캡처 정보로 바꾼다.
3. 최종 PNG를 `final/ko-KR/`에 넣고 manifest의 `files` 순서와 맞춘다.
4. 각 파일의 `altText`를 140자 이하로 확정한다.
5. 사람이 실제 화면과 정책 적합성을 확인한 뒤만 `attestations`를 `true`로 바꾼다.
6. 앱 디렉터리에서 검증한다.

```bash
cd apps/mobile
pnpm validate:screenshots:release
```

Android 출시 전체 사전 검사에서는 이 strict gate가 마지막 단계로 항상 실행된다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

다른 manifest를 검사하려면 경로를 인자로 전달한다.

```bash
node scripts/validate-play-screenshots.mjs store-listing/screenshots/manifest.example.json
```

예시 manifest는 플레이스홀더와 없는 파일을 포함하므로 그대로는 반드시 실패한다.

## 검증 범위

`validate-play-screenshots.mjs`는 다음을 검사하고 파일을 수정하지 않는다.

- 휴대전화·7인치·10인치 세트의 존재와 파일 개수
- manifest 순서와 `phone-01-home.png` 형식의 파일명
- 세로 9:16 비율, 선언한 폭·높이, Play 해상도 범위
- PNG signature, chunk 구조와 CRC
- 8-bit 24-bit RGB PNG, alpha·`tRNS` 투명도 없음
- 파일당 8MiB 이하
- `assetRoot`에 있지만 manifest에 누락된 PNG
- 선택적 `sha256` 무결성 값
- 빌드 이력, 캡처 환경, 수동 검토 확인 항목

로고, 체험 문구, 개인정보, 기능의 실제 도달 가능 여부는 픽셀 형식만으로 자동
판정할 수 없다. 이 부분은 `attestations`와 최종 사람 검토로 차단한다.

## 보안

manifest에 다음을 기록하지 않는다.

- 심사용 계정 이메일과 비밀번호
- OAuth·FCM·EAS·Play Console token
- Google 서비스 계정 JSON
- API key, private key, session cookie

manifest에는 `reviewerCanReachShownFeatures: true`와 같은 결과만 기록하고, 실제 심사
자격 증명은 Play Console의 보호된 앱 액세스 항목에만 입력한다.

실제 캡처 절차와 제출 차단 조건은
[`../../../../docs/PLAY_SCREENSHOTS.md`](../../../../docs/PLAY_SCREENSHOTS.md)를 따른다.
