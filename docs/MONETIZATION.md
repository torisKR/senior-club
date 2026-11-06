# Android 게임 광고와 구매

대상은 계정 없는 Android 게임 `com.toris.seniorclub`이다. 이 문서는 코드에 구현된 동작과 출시 전 확인 항목을 설명한다. 실제 광고 노출, 상품 활성화, 결제나 복원 성공을 확인한 기록은 아니다.

## 광고와 개인정보 선택

[`AdsProvider`](../apps/mobile/src/ads/AdsProvider.tsx)는 광고 제거 소유 여부 확인이 끝나고 광고가 허용될 때 UMP 동의를 모은다. `canRequestAds`가 허용이면 Mobile Ads를 초기화하고, 동의 수집이 실패하면 이전 동의 정보를 조회해 허용 여부를 다시 판단한다. 확인할 수 없으면 광고 요청을 막는다. 광고 제거 소유 상태에서는 새로운 광고 요청을 하지 않는다.

현재 마을 화면의 [`HomeBannerAd`](../apps/mobile/src/ads/HomeBannerAd.tsx)는 Android, 화면 포커스, 구매 상태, UMP 허용과 유효한 광고 단위를 확인한 뒤 실제 너비의 적응형 배너를 표시한다. 배너에는 `광고` 표시가 있고 로드 실패 시 숨긴다. 광고 개인정보 옵션이 UMP에서 필요하다고 판단되면 명인전당에 해당 설정이 나타난다. 분석 선택과 광고 선택은 별도다. 전면·보상형 광고를 현재 배치로 안내하지 않는다.

코드에는 production AdMob 앱/배너 ID가 설정돼 있다. 개발 모드의 배너와 `internal`, `qaInternalLocal`, `preview` EAS 프로필은 Google 테스트 ID를 사용하도록 설정돼 있다. QA에서는 빌드의 실제 설정과 테스트 기기 조건을 확인하고 실제 광고를 클릭하지 않는다. 설정된 ID만으로 광고 게재, 동의 UI 또는 수익이 검증되지는 않는다.

앱에 설정된 정책 URL과 판매자 파일 URL은 [`public-policy-url.js`](../apps/mobile/src/config/public-policy-url.js)의 [개인정보 처리방침](https://plume-mine-90a.notion.site/40d4269dc8c0818d9035ed4b0596d183)과 `https://toris.kr/app-ads.txt`다. 릴리스 preflight는 정책 및 판매자 파일 응답을 검사한다. 별도로 공개 정책 내용, Play 등록정보의 개발자 웹사이트와 AdMob의 실제 app-ads.txt 인식·광고 상태를 확인한다.

## 일회성 상품

| 상품 ID | 용도 |
| --- | --- |
| `seniorclub.remove_ads` | 광고 제거 |
| `seniorclub.cosmetic.nacre_putter` | 파크골프 퍼터 꾸미기 |
| `seniorclub.cosmetic.celadon_stones` | 알까기 바둑알 꾸미기 |
| `seniorclub.cosmetic.plum_tiles` | 사천성 패 꾸미기 |

명인전당에서 구매·복원 UI를 제공한다. 코드는 `expo-iap`로 Google Play 일회성 비소모성 상품과 가격을 조회하므로 가격과 상품 활성화 상태는 Play에서 확인해야 한다. 가격을 못 불러오면 구매를 진행하지 않고 재시도를 제공한다. 구독이나 모임 참가비 상품은 현재 구현된 게임 상품이 아니다.

Play가 보유 여부의 기준이다. 구매 대기 상태는 소유로 부여하지 않으며 완료된 구매는 기기에 토큰을 저장하고 Play 확인 처리를 시도·재시도한다. Play 조회가 불가능할 때 기존 저장 토큰을 유지하고, Play가 정상 응답했으나 상품이 없으면 캐시를 지운다. 같은 Google Play 계정의 구매 복원을 시도할 수 있지만 실제 기기·계정 간 복원은 별도 검증이 필요하다. 테스트나 진단 중 기존 토큰과 게임 저장 데이터를 지우지 않는다.

RevenueCat은 앱 자체가 구매를 완료하는 observer 구성이다. 앱 계정 없이 SDK의 기기 캐시 ID를 사용하고 구매 또는 사용자가 요청한 복원 뒤 동기화를 시도한다. RevenueCat 관측·동기화는 Play 구매 완료나 권한 부여의 증거가 아니다. 구현은 [`AppBillingProvider`](../apps/mobile/src/billing/AppBillingProvider.tsx), [`remove-ads.ts`](../apps/mobile/src/billing/remove-ads.ts), [`revenuecat-observer.ts`](../apps/mobile/src/billing/revenuecat-observer.ts)를 본다.

출시 전 승인된 Play 테스트에서 상품·표시 가격, 구매 취소·대기·완료, 확인 처리, 재실행·오프라인·환불 후 재조회, 복원과 광고 제거를 각각 확인한다. 실제 테스트 결과는 기기, 설치 출처, 빌드와 시점을 포함해 별도 기록한다. 과거 수익화 계획은 `git show c20a031:docs/MONETIZATION.md`에서 찾는다.
