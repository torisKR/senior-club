# Android 게임 Data Safety 검토

기존 회원·웹 서비스에 관한 Data Safety 초안은 현재 게임의 신고 근거로 사용할 수 없다. 이전 내용은 Git 기록 `8201a93:docs/DATA_SAFETY.md`에 남아 있다.

현재 제출 답변은 대상 Android 빌드의 실제 SDK, 병합 manifest, 데이터 전송, 각 공급자 설정과 공개 개인정보 처리방침을 기준으로 담당자가 확인해야 한다. 앱은 선택적 Firebase Analytics 동의, Google Mobile Ads 개인정보 선택, Google Play 구매·복원 및 RevenueCat 연동을 포함한다. 확인 전에는 실제 전송이나 구매 성공을 검증된 것으로 기록하지 않는다.

공개 정책 URL은 `apps/mobile/src/config/public-policy-url.js`를 기준으로 하며, 검토 초안은 [게임 개인정보 초안](GAME_PRIVACY_DRAFT.md), 릴리스 검증 경계는 [Android 릴리스 안내](../.github/DEPLOYMENT.md)를 참조한다.
