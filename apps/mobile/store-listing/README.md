# Google Play Android 등록정보

`ko-KR/`에는 게임 이름과 설명, `icon-512-v2.png`에는 현재 Play 아이콘을 둔다. 게임 대표 이미지는 `feature-graphic-game-1024x500.png`를 사용하며, 생성 원본과 준비 상태는 [에셋 기록](../../../docs/ASSETS.md)에 남긴다. 이전 커뮤니티 화면과 설명은 게임 스크린샷으로 사용하지 않는다.

최종 스크린샷은 고정된 Android 빌드에서 촬영하고 Git 밖의 manifest와 함께 보관한다. 휴대전화 5~6장, 7인치와 10인치 태블릿 각 4~8장이 필요하다. [스크린샷 안내](screenshots/README.md)와 [Play 인수 문서](../../../docs/PLAY_UPLOAD_HANDOFF.md)에 따라 원본 해시와 여섯 검토 항목을 사람이 확인한다.

릴리스 검증은 `pnpm release:android:preflight -- --screenshot-manifest <경로>`로 실행한다. 기술 검사 통과는 실제 구매나 Play 승인·공개를 뜻하지 않는다.
