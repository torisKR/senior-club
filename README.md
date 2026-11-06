# 시니어클럽 — Android 게임

Expo 기반의 계정 없는 Android 게임이다. 청솔마을의 이야기와 파크골프·알까기·사천성, 명인전당을 제공한다. 게임 진행과 설정은 기기에 저장한다. 이전 회원·모임·게시판·채팅 서비스와 커뮤니티 웹/API는 이 저장소의 현재 서비스가 아니다. 게임에 로그인은 필요하지 않지만 광고, 이용 분석, 구매 확인과 복원 등 외부 SDK 기능은 네트워크와 해당 서비스 상태에 영향을 받는다.

앱 설정의 패키지는 `com.toris.seniorclub`, 버전은 `0.1.5`다. 설정의 versionCode는 릴리스용 확정 번호가 아니다. Play workflow는 실행할 때 Play 이력을 조회해 새 번호를 할당한다. 코드는 `apps/mobile/`과 모바일이 공유하는 `shared/`에 있다.

## 개발과 확인

```bash
pnpm install --frozen-lockfile   # CI: Node 24, pnpm 9.14.2
pnpm mobile:start
pnpm mobile:android
pnpm mobile:typecheck
pnpm mobile:lint
pnpm test
pnpm build                       # Android Expo export, 서명된 AAB가 아님
pnpm mobile:test:release-validators
```

Firebase Analytics의 선택 동의, AdMob의 광고 동의와 개인정보 옵션, Google Play Billing 및 RevenueCat 연동이 있다. 각각의 동작과 확인 범위는 [이용 분석](docs/ANALYTICS.md)과 [수익화](docs/MONETIZATION.md)를 본다. 실제 광고 제공이나 구매·복원 성공은 구현만으로 확인되지 않는다.

## Android 출시

[Play 출시 안내](docs/PLAY_STORE.md)와 [업로드 인수 문서](docs/PLAY_UPLOAD_HANDOFF.md)가 현재 운영 절차다. `deploy-main.yml`은 CI를 실행하고, 같은 main SHA의 스크린샷 증거 run ID를 수동으로 제공한 경우에만 Android 후보 workflow를 호출한다. 자동 웹/API 배포는 없다. 모든 릴리스 모드에는 사람이 검토한 해당 SHA의 스크린샷 증거, 서명 및 AAB 검증이 필요하다.

기준 커밋 `c20a031`의 독립 작업 트리에서는 스토어 대표 이미지가 없어 자산 검증이 실패했다. 파일과 검증 상태는 [Play 출시 안내](docs/PLAY_STORE.md)에서 확인한다.

앱의 개인정보 처리방침 URL과 광고 판매자 파일 URL은 [`public-policy-url.js`](apps/mobile/src/config/public-policy-url.js)에 설정돼 있다. 실제 접근성과 내용은 출시 전 확인한다. 이 저장소의 정리는 기존 외부 서비스, 계정, 사용자 데이터 또는 서명 자격 증명에 대한 변경 지시가 아니다.

## 게임 자료와 이전 이력

- [Android 게임 기획](design/gdd/android-game-plan.md), [스토리](design/story/story-bible.md), [UI 사양](design/design/android-ui-spec.md)
- [픽셀 아트 파이프라인](design/art/pixel-art-pipeline.md): `node tools/pixel-art/build.mjs`
- 이전 커뮤니티 서비스와 출시 이력은 Git에서 확인한다. 예: `git show c20a031:docs/PLAY_STORE.md` 또는 `git log --all -- docs/PLAY_STORE.md`. 당시 기록을 현재 배포 지시나 새 릴리스의 검증 결과로 사용하지 않는다.
