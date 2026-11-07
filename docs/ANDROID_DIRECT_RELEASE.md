# Android 직접 릴리스

GitHub Actions의 [Android Play production workflow](../.github/workflows/android-play-production.yml)는 고정된 main 소스를 Expo Android prebuild와 Gradle `bundleRelease`로 빌드한다. `deploy-main.yml`의 수동 실행은 검토된 스크린샷 증거가 있을 때 후보 빌드만 요청하며 Play 제출을 실행하지 않는다.

모든 모드는 동일한 스크린샷 증거와 production preflight를 요구한다. [인수 문서](PLAY_UPLOAD_HANDOFF.md)의 절차에 따라 사람이 고정 SHA의 화면과 여섯 항목을 직접 검토하고 같은 계정으로 업로드·발급한 결과를 사용한다. 자동 검사나 미리보기로 사람의 검토를 대신하지 않는다.

`play-store-production` 환경에는 기존 업로드 키의 `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_UPLOAD_CERT_SHA256`과 앱에 권한이 있는 `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, Android Firebase 클라이언트의 `GOOGLE_SERVICES_JSON_BASE64`가 필요하다. 값은 로그나 저장소에 넣지 않는다. 게임은 이전 API·웹 주소 또는 Kakao 인증 키를 요구하지 않는다.

워크플로는 Play 이력과 비교해 새 versionCode를 할당하고, AAB의 패키지·버전·권한·광고 동의 설정·정책 URL·서명 및 업로드 인증서를 검증한다. 제출할 때에는 같은 AAB 바이트와 Play의 응답을 재확인한다. 빌드, 업로드, 검토 제출, 승인과 실제 공개는 서로 다른 상태다.

검토된 증거 run ID와 공개 출시 권한이 준비된 뒤, production workflow의 `binary_update=true` 및 `submit_to_play=true`는 production 완료 배포를 요청한다. 중간 실패나 결과가 불명확하면 Play 상태를 먼저 확인하고 같은 업로드를 무작정 반복하지 않는다.
