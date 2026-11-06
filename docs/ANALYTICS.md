# Android 게임 이용 분석

대상은 Android 게임 `com.toris.seniorclub`이다. 이 문서는 저장소 구현을 설명하며 GA4 수신이나 콘솔 설정을 확인한 결과는 아니다. 이전 웹 스트림과 커뮤니티 기능은 현재 앱의 운영 기준이 아니다.

## 동의와 수집

- [`firebase.json`](../apps/mobile/firebase.json)은 Analytics 자동 수집과 자동 Activity 화면 보고를 기본적으로 끄고, Analytics의 광고 ID/SSAID 수집 및 동의 기본값도 끈다.
- 사용자는 명인전당의 **이용 분석 설정**에서 선택적으로 켜거나 끌 수 있다. 선택은 기기에 저장되고, 미선택·거부 상태에서는 분석 수집을 켜지 않는다. 앱 계정이나 로그인은 없다. 현재 게임 화면에 첫 실행 동의 카드가 자동으로 표시된다고 가정하지 않는다.
- 동의하면 Firebase Analytics의 `analytics_storage`를 허용하고 수집을 켠다. Analytics SDK의 `ad_storage`, `ad_user_data`, `ad_personalization`은 false로 둔다. 화면 전환 및 앱 복귀 시 허용된 고정 `screen_view`를 보내며, SDK의 기본 세션 이벤트는 동의 후 발생할 수 있다.
- 끄면 수집을 중지하고 `resetAnalyticsData`를 호출한다. 이 동작은 이미 서버에 집계된 통계의 즉시 삭제를 보장하지 않는다. 설정 저장에 실패하면 분석을 끄고 오류를 표시한다. SDK 오류는 표시하며 이후 다시 켜는 시도에서 재시도할 수 있다.
- 이 선택은 **AdMob UMP 광고 개인정보 선택과 별개**다. Analytics 설정의 광고 동의 값이 AdMob의 전체 처리나 광고 제공 상태를 증명하지 않는다.

## 화면 이름 해석

앱은 query/hash를 제거한 경로를 고정 허용 목록에 대조하고 `screen_name`과 `screen_class=SeniorClub`을 기록한다. 식별자, 검색어, 사용자 작성 텍스트를 화면 이름으로 보내지 않는다. 예전 이름이 코드에 남아 있으므로 보고서를 게임 화면으로 해석한다.

| 현재 게임 화면 | 내부 경로 | 기록되는 `screen_name` |
| --- | --- | --- |
| 마을 | `/home` | `home` |
| 파크골프 | `/clubs` | `clubs` |
| 알까기 | `/events` | `events` |
| 사천성 | `/chat` | `chat` |
| 명인전당 | `/me` | `profile` |

`clubs`, `events`, `chat`은 과거 경로명이지 현재 커뮤니티·모임·채팅 기능의 이용을 뜻하지 않는다. 매핑과 수집 구현은 [`measurement.ts`](../shared/analytics/measurement.ts), [`controller.ts`](../apps/mobile/src/analytics/controller.ts), [`sdk.native.ts`](../apps/mobile/src/analytics/sdk.native.ts)를 따른다.

## 운영 확인

승인된 테스트 환경에서 분석을 끈 상태와 켠 상태, 화면 이동·복귀, 철회 후 중단을 각각 확인한다. Firebase DebugView를 사용했다면 테스트 후 debug 설정을 제거한다. 실시간 수신과 일반 보고서 반영을 구분하고 광고·결제 검증과 혼동하지 않는다. SDK의 실제 네트워크 처리와 콘솔의 Data Safety 설정도 별도로 확인한다.

이전 웹/앱 분석 문서와 과거 확인 기록은 `git show c20a031:docs/ANALYTICS.md`에서 볼 수 있다. 그 기록을 현재 Android 게임의 수신 증거로 재사용하지 않는다.
