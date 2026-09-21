# 시니어클럽 Android 앱

시니어클럽(Senior Club)의 회원용 Android 앱입니다. Expo SDK 57과 Expo Router를 사용하며 Google Play 제출 파일은 Android App Bundle(AAB)로 생성합니다.

## 앱 식별 정보

| 항목 | 값 |
| --- | --- |
| 앱 이름 | 시니어클럽 |
| Expo slug | `club-senior` |
| Android package | `com.toris.seniorclub` |
| URL scheme | `clubsenior://` |
| 표시 버전 | `0.1.0` |
| 초기 versionCode | `1` |

`com.toris.seniorclub`은 이미 앱 설정과 기존 출시 후보 AAB에서 사용하는 Android package입니다. Play Console에서 앱을 만든 뒤에는 package 이름을 바꿀 수 없습니다.

## 로컬 실행

```bash
cd apps/mobile
pnpm install
pnpm start
```

Android 에뮬레이터에서 실행하려면 Android Studio와 에뮬레이터를 시작한 뒤 다음을 실행합니다.

```bash
pnpm android
```

설정 확인:

```bash
npx expo config --type public
npx expo-doctor
npx tsc --noEmit
```

출시 후보의 자산, production manifest/Firebase client, 후보 스크린샷과 최종 캡처 증빙을 한 번에
검사하려면 다음 명령을 사용합니다. `EXPO_PUBLIC_APP_ENV`는 production으로 강제되며 final manifest가
없거나 예약·로컬·사설 API URL이면 fail-closed로 중단합니다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

검증기 자체의 URL 경계값과 preflight 순서 테스트는 `pnpm test:release-validators`로 실행합니다.
preflight는 AAB 바이너리를 검사하지 않습니다. EAS build 뒤 Play App Bundle Explorer에서 package,
versionCode, target API 36, signing, merged manifest를 확인하기 전에는 제출 준비 완료로 간주하지 않습니다.

## Android release — current path

Release builds now run Expo prebuild + signed Gradle AAB directly on GitHub Actions and upload the exact verified artifact through the Google Play API. No EAS cloud/local build or EAS Submit is used. Follow [ANDROID_DIRECT_RELEASE.md](../../docs/ANDROID_DIRECT_RELEASE.md) for required existing-signing secrets, version allocation, artifact gates and authorization. The automatic published-binary-update path retains production/completed; manual releases retain draft status.

The EAS instructions below are **historical/development reference only**, not current release commands. Do not use them for release deployment.

## EAS 초기 연결 (legacy)

앱은 현재 문서에 적힌 EAS 프로젝트에 연결돼 있습니다. 소유 계정을 변경할 때만 다시 초기화하고,
출시 작업에서는 [`eas.json`](./eas.json)에 고정한 EAS CLI `21.3.0`을 사용합니다.

```bash
npx eas-cli@21.3.0 login
npx eas-cli@21.3.0 init
```

`eas init`이 선택한 Expo 프로젝트의 실제 `extra.eas.projectId`를 앱 설정에 추가합니다. 팀 계정으로 출시한다면 개인 계정이 아니라 해당 organization을 선택합니다.

## 빌드 프로필

| 프로필 | 산출물 | 목적 |
| --- | --- | --- |
| `internal` | APK | 개발팀 내부 기기 설치 |
| `preview` | APK | QA·이해관계자 미리보기 |
| `playInternal` | AAB | Google Play 내부 테스트 트랙 |
| `production` | AAB | Google Play 트랙 업로드 |

```bash
# 내부 설치용 APK
npx eas-cli@21.3.0 build --platform android --profile internal

# QA 설치용 APK
npx eas-cli@21.3.0 build --platform android --profile preview

# Play 내부 테스트용 AAB
npx eas-cli@21.3.0 build --platform android --profile playInternal

# Play Store 제출용 AAB
npx eas-cli@21.3.0 build --platform android --profile production
```

`production`은 EAS의 원격 versionCode와 `autoIncrement`를 사용합니다. 최초 원격 버전을 설정할 때 현재 Play Console의 마지막 versionCode와 충돌하지 않는지 확인합니다.

## Play Console 제출

첫 AAB는 Play Console에서 직접 업로드해 앱, package, Play App Signing을 연결하는 흐름이 가장 단순합니다. 이후 자동 제출을 쓰려면 Play Console과 연결한 Google Cloud 서비스 계정을 만들고 EAS에 실제 키를 등록합니다. JSON 키를 이 저장소에 커밋하지 마세요.

```bash
# 실제 자격 증명을 EAS에 구성한 뒤, 내부 테스트 트랙에 초안으로 제출
npx eas-cli@21.3.0 submit --platform android --profile playInternal

# 검토 후 production 트랙에 초안으로 제출
npx eas-cli@21.3.0 submit --platform android --profile production
```

제출 프로필은 실수로 즉시 공개되지 않도록 `draft` 상태입니다. 출시 승인은 Play Console에서 사람이 최종 확인합니다.

### GitHub Actions 내부 트랙 빌드

[`android-play-internal.yml`](../../.github/workflows/android-play-internal.yml)은 `workflow_dispatch`로만
실행됩니다. GitHub Environment `play-internal`에 아래 값을 등록하고 required reviewer를 권장합니다.

- secret `EXPO_TOKEN`
- secret `GOOGLE_SERVICES_JSON_BASE64` — Android client `google-services.json`의 base64
- variable `EXPO_PUBLIC_API_URL` — 공개 production HTTPS API origin
- variable `EXPO_PUBLIC_WEB_URL` — 공개 production HTTPS web origin

워크플로는 final screenshot manifest를 포함한 production preflight를 먼저 실행합니다. 그 뒤
`playInternal` AAB를 `--non-interactive --wait --json`으로 만들고, 단일 `FINISHED` Android UUID만
추출해 증빙과 함께 보관합니다. 수동 입력 `submit_to_play=true`일 때만 그 UUID를 내부 트랙 `draft`로
제출합니다. `--latest`와 production 트랙 승격은 이 워크플로에서 허용하지 않습니다.

### GitHub Actions production 트랙 배포

[`android-play-production.yml`](../../.github/workflows/android-play-production.yml)은 `main` push/merge와
수동 `workflow_dispatch`로 실행됩니다. GitHub Environment `play-store-production`에 위와 동일한
secret/variable을 등록합니다. `main` push에서는 검증된 `production` AAB를 Play production 트랙
`draft`로 자동 제출합니다. 최종 공개 승인은 Play Console에서 사람이 합니다.

GitHub의 Firebase client secret은 runner 임시 파일로만 복원되고 작업 종료 시 삭제됩니다. 원격 EAS
`production` environment에도 별도로 `EXPO_PUBLIC_API_URL`과 `GOOGLE_SERVICES_JSON` file secret을
구성해야 합니다. 선택 제출 전에 Play 서비스 계정은 EAS credentials에 최소 권한으로 등록합니다.

## 정책 URL

- 서비스 이용약관: `https://senior.toris.kr/terms`
- 개인정보 처리방침: `https://senior.toris.kr/privacy`
- 계정 삭제 요청: `https://senior.toris.kr/account-deletion`

위 주소는 ChatGPT Sites에 연결된 custom production domain입니다. 앱과 Play Console은 동일한 운영 origin을 사용합니다. 현재 페이지의 문의 이메일도 수신 가능한 운영 주소로
교체하고 실제 요청 처리 절차를 점검하기 전에는 Play 심사를 제출하지 않습니다.

한국어 Play 등록 문구와 512px 아이콘 안내는 [`store-listing`](./store-listing)에 있습니다. 자세한 출시 절차는 [`../../docs/PLAY_STORE.md`](../../docs/PLAY_STORE.md), 현재 차단 조건은 [`../../docs/RELEASE_READINESS.md`](../../docs/RELEASE_READINESS.md), 성능 측정은 [`../../docs/PERFORMANCE.md`](../../docs/PERFORMANCE.md), Data Safety 초안은 [`../../docs/DATA_SAFETY.md`](../../docs/DATA_SAFETY.md)를 확인하세요.
