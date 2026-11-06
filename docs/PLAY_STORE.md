# Android 게임 Google Play 출시 안내

이 문서는 저장소의 현재 소스와 workflow 계약이다. 대상은 `com.toris.seniorclub`, Expo 앱 설정의 versionName은 `0.1.5`다. 계정 없는 마을 게임이며 파크골프·알까기·사천성과 명인전당을 제공한다. 심사 접근 안내도 실제 게임을 기준으로 작성한다. 이전 커뮤니티 웹/API, 카카오 로그인, 회원·모임 기능을 현재 심사 경로로 안내하지 않는다.

## 빌드 및 출시 경로

| 항목 | 저장소 기준 |
| --- | --- |
| 앱 | [`apps/mobile/app.json`](../apps/mobile/app.json), Expo SDK 58, 세로 Android |
| 후보 | [production workflow](../.github/workflows/android-play-production.yml)가 Expo prebuild와 직접 Gradle `:app:bundleRelease`로 AAB 생성 |
| 서명 | 등록된 upload key로 서명하고 AAB의 인증서 SHA-256을 `ANDROID_UPLOAD_CERT_SHA256`과 대조. debug 서명으로 대체하지 않음 |
| 버전 | Play tracks/bundles/APKs를 조회해 versionCode 할당, 업로드 직전 재대조. app.json의 값은 다음 출시 번호 보장이 아님 |
| 바이너리 검사 | bundletool 검증, 전체 서명·package·version·target API 36 이상·merged manifest·정책 URL·광고 측정 지연 설정 확인 |
| 증거 | 모든 모드가 같은 main SHA의 사람이 검토한 [스크린샷 발급 run](../.github/workflows/android-play-screenshot-evidence.yml)과 전체 preflight를 요구 |

[`deploy-main.yml`](../.github/workflows/deploy-main.yml)의 main push는 CI만 실행한다. 수동 dispatch에서 같은 SHA의 `screenshot_evidence_run_id`를 입력하고 CI가 성공하면 `binary_update=true`, `submit_to_play=false`로 Android 후보 workflow를 호출한다. 웹/API를 배포하지 않는다. EAS 설정은 저장소에 남아 있지만 이 workflow의 빌드·제출은 직접 Gradle과 Android Publisher 경로다.

[내부 wrapper](../.github/workflows/android-play-internal.yml)와 production workflow는 각각 `play-internal`, `play-store-production` GitHub Environment를 사용한다. 해당 환경에 `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_UPLOAD_CERT_SHA256`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_SERVICES_JSON_BASE64`가 필요하다. Firebase client JSON은 패키지 일치를 검사하고 Play 서비스 계정은 workflow에 지정된 계정을 검사한다. 비밀값을 문서, 로그, 캡처에 넣지 않는다.

upload 인증서와 사용자가 Play에서 설치하는 앱의 Play App Signing 인증서는 구별한다. workflow의 upload 인증서 검사는 Play 배포본의 서명이나 기기 설치 검증을 대신하지 않는다.

## 스크린샷과 출시 게이트

1. 최종 소스를 main의 전체 40자리 소문자 SHA로 고정하고, 그 소스의 실제 서명 APK에서 게임 화면을 캡처한다. 휴대전화 5~6장, 7인치·10인치 태블릿 각 4~8장이다.
2. 실제 사람이 최종 UI, 오래된 브랜드/데모 문구 부재, 개인정보 부재, 화면 도달 가능성, 콘텐츠 사용권, 상태 바를 검토한다. APK와 각 PNG의 SHA-256 및 캡처 조건을 기록한다.
3. 검토된 원본 manifest와 이미지 ZIP을 같은 저장소의 해당 SHA 전용 published prerelease asset으로 전달한다. 같은 검토자가 issuer를 수동 실행하고 `manual_review=true`를 명시한다. 자세한 이름, 식별자, 입력과 검증은 [인수 문서](PLAY_UPLOAD_HANDOFF.md)를 따른다.
4. 성공한 특정 issuer run ID를 release에 전달한다. receiver는 저장소·workflow·사람·main SHA·첫 실행·artifact digest 및 원본 파일을 검증하고 strict screenshot validator와 전체 preflight를 실행한다. `binary_update=true`도 이 증거를 생략하지 않는다.

스토어 스크린샷은 이 저장소의 strict 조건인 세로 9:16, 8-bit RGB PNG, 파일당 8 MiB 이하, 짧은 변 1080px 이상·긴 변 3840px 이하 등을 만족해야 한다. 검사는 캡처의 진위나 실제 사람의 시각 검토를 대신하지 않는다. 샘플 manifest, 예전 화면, 테스트용 synthetic PNG 또는 자동 생성된 확인 값은 최종 증거가 아니다. 캡처부터 발급·소비까지 main SHA가 바뀌면 새 SHA로 다시 준비한다.

preflight는 스토어 자산, production Expo/manifest 설정, 공개 정책·app-ads.txt endpoint, 최종 스크린샷을 검사한다. 그 뒤 AAB와 merged manifest를 별도 검사한다. 한 단계의 성공을 실제 기기 동작이나 Play 승인으로 해석하지 않는다.

기준 커밋 `c20a031`의 독립 작업 트리에서 `node scripts/validate-play-assets.mjs`를 `apps/mobile`에서 실행했을 때 `store-listing/feature-graphic-game-1024x500.png`가 없어 실패했다. 이 파일은 해당 커밋에 포함돼 있지 않다. CI와 preflight도 같은 자산 검사를 호출하므로 출시 담당자는 적절한 게임 대표 이미지를 준비한 뒤 최신 소스에서 전체 검사를 다시 실행해야 한다. 이 기록은 다른 출시 게이트의 통과 여부를 뜻하지 않는다.

## 실행 모드

| 경로 | 명시 입력 | 요청하는 결과 |
| --- | --- | --- |
| internal wrapper | `submit_to_play=false` | 후보 빌드·검증 |
| internal wrapper | `submit_to_play=true` | internal / draft |
| production | `binary_update=false`, `submit_to_play=true` | production / draft |
| production | `binary_update=true`, `submit_to_play=true` | production / completed |
| production 또는 deploy-main 후보 | `submit_to_play=false` | 후보 빌드·검증 |

모든 행에 구체적인 screenshot issuer run ID가 필요하다. `binary_update=true`는 기존 스토어 등록정보를 유지하는 바이너리 갱신이지 증거 생략 옵션이 아니다. `internal_release=true`와 `binary_update=true`는 함께 사용할 수 없다. 수동 production dispatch의 제출 기본값은 false지만 reusable `workflow_call`의 기본값은 true이므로 호출자는 의도를 명시한다. Play 업로드는 reviewed main에서만 허용된다. 후보도 versionCode 할당을 위해 Play edit를 만들고 삭제하므로 읽기 전용이 아니다. `completed` 요청은 draft가 아니며 Play 심사·게시 설정·실제 공개 상태는 별도로 확인한다.

## 스토어 및 수용 확인

- 앱의 [개인정보 처리방침 설정](../apps/mobile/src/config/public-policy-url.js), 공개 본문과 `https://toris.kr/app-ads.txt`를 실제 확인한다. Play에 등록된 개인정보 처리방침을 앱 설정과 대조하고, 개발자 웹사이트와 판매자 파일의 관계 및 AdMob 인식도 확인한다. URL 설정이나 HTTP 검사만으로 개인정보 내용의 적합성이 증명되지는 않는다.
- 이전 계정 보유자의 문의는 공개 방침의 연락 경로를 확인한다. 저장소의 서비스 제거만으로 이전 사용자 데이터 처리가 완료됐다고 추정하지 않는다.
- Data Safety 및 광고 선언은 실제 Analytics, UMP/AdMob, Play Billing, RevenueCat의 데이터 처리와 콘솔 설정을 기준으로 검토한다. [이용 분석](ANALYTICS.md)과 [수익화](MONETIZATION.md)는 구현 설명이다.
- 테스트 기기에서 게임 진행과 데이터 보존, 선택 동의 및 광고 옵션, 테스트 광고, 상품 가격·구매·복원·광고 제거를 각각 확인한다. 현재 문서는 실제 광고나 구매 성공을 주장하지 않는다.
- CI 결과, 사람의 스크린샷 검토, AAB 해시·upload 인증서, Play 업로드 및 track read-back, 심사 제출·승인·공개를 각각 증거로 남긴다. 어느 단계도 다음 단계의 완료를 대신하지 않는다.

이전 커뮤니티 서비스 및 구버전 후보 기록은 `git show c20a031:docs/PLAY_STORE.md`와 `git log --all -- docs/PLAY_STORE.md`에 남아 있다. 이전 증거를 현재 게임의 출시 완료 기록으로 사용하지 않는다.
