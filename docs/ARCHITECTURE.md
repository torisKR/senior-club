# Android 게임 아키텍처

시니어클럽은 Expo Router와 React Native로 만든 계정 없는 게임 앱이다. 마을과 세 가지 놀이의 진행은 기기에 저장되며 이전 모임·게시판·채팅 서버를 호출하지 않는다. `chat` 탭의 현재 화면은 사천성 게임이다.

- `apps/mobile/src/app/`: Android 진입점과 게임 탭
- `apps/mobile/src/arcade/`, `apps/mobile/src/rpg/`: 게임 화면·로직·저장
- `apps/mobile/src/context/`, `apps/mobile/src/utils/storage*`: 큰 글씨 설정과 기기 저장
- `shared/design/`, `shared/analytics/`: 모바일에서 직접 사용하는 디자인과 분석 정의
- `apps/mobile/src/ads/`, `apps/mobile/src/analytics/`, `apps/mobile/src/billing/`: 광고, 선택적 분석, Play 구매 및 복원
- `apps/mobile/src/config/public-policy-url.js`: 공개 개인정보 정책과 광고 판매자 파일 주소

게임은 오프라인으로 이용할 수 있지만 광고, 분석, 구매와 복원에는 각 공급자 연결이 필요하다. Android 서명과 Play 심사 준비는 [Android 릴리스 경계](../.github/DEPLOYMENT.md) 및 기존 스크린샷 증빙 검증을 따른다.
