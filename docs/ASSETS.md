# Android 게임 에셋

게임의 마을, 인물, 파크골프 장비, 알까기 돌과 사천성 패는 `apps/mobile/assets/game/rpg/`에 있다. 움직이는 픽셀 이펙트는 `apps/mobile/src/fx/fx-manifest.ts`의 프레임 정보와 함께 사용한다. 화면에 보이는 대국 상태와 장비는 실제 게임 상태를 따른다.

Android 런처·적응형 아이콘과 스플래시는 `apps/mobile/assets/images/`에서, 한국어 글꼴은 `apps/mobile/assets/fonts/`에서 관리한다. 기존 게임의 저장 데이터나 구매 상태와는 별개다.

스토어 대표 이미지용 새 그림 원본은 `apps/mobile/store-listing/artwork/feature-graphic-game-source.png`이다. 청솔마을과 세 종목을 함께 보여 주도록 imagegen으로 제작했다. 원본은 1794×877이며, Google Play에 쓰기 전에 1024×500 PNG 규격으로 내보내고 글자·이미지 상태를 검토해야 한다. 이전 커뮤니티 서비스의 대표 이미지는 게임 대표 이미지로 사용하지 않는다.

출시 검증 전에는 실제 앱에서 캡처한 화면과 스토어 그림이 게임에서 접근할 수 있는 내용과 일치하는지 확인한다. 스크린샷은 원본 촬영 정보와 사람의 검토 기록을 함께 보존한다.
