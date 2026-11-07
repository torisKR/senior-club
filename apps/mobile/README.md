# 시니어클럽 게임 앱

Expo Router 기반의 계정 없는 게임 앱입니다. Android 패키지는 `com.toris.seniorclub`, 앱 버전은 `app.json`을 기준으로 확인합니다. 마을, 파크골프, 알까기, 사천성과 진행 데이터는 기기에 저장됩니다. 광고·선택적 이용 분석·Google Play 구매 및 복원은 네트워크와 해당 서비스가 필요합니다.

## 개발 및 검증

저장소 루트에서 Node 24와 pnpm 9.14.2로 실행합니다.

```bash
pnpm install --frozen-lockfile
pnpm mobile:start
pnpm mobile:typecheck
pnpm mobile:lint
pnpm test
pnpm build
```

개인정보 처리방침은 앱 설정에서 열 수 있으며, 광고 개인정보 선택과 이용 분석 동의도 설정에서 변경할 수 있습니다. 기존 구매는 플러스 카드에서 복원할 수 있습니다.

## Android 릴리스

기존 서명 키와 Play 검증을 유지하는 절차를 따릅니다. 릴리스 검증은 Android 게임 자산과 공개 정책, 광고 판매자 파일, 정확한 서명 AAB 및 사람이 검토한 스크린샷을 확인합니다. 앱 설정과 Expo export만으로 실기기 구매, Play 제출 또는 공개가 검증되지는 않습니다. 자세한 내용은 [배포 안내](../../.github/DEPLOYMENT.md)를 확인하세요.
