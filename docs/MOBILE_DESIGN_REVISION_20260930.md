# Android 모바일 디자인 수정 기준 · 2026-09-30

사용자 요청: 기본 글자, 하단 내비게이션, 그래픽과 사진 비율을 다시 설계한다.
검토 기준은 `9a376d9`의 소스와 이미지 파일 크기다. 화면 픽셀을 직접 검수한 결과나 구현 완료 보고서가 아니다.
숲색 `#356347`, 밝은 배경 `#eef2e9`, Pretendard, 공통 AppText/Card/CoverImage/Button 역할을 유지한다.
웹과 브랜드·역할·에셋을 공유하되 Android의 글자 밀도와 시스템 여백은 플랫폼에서 결정한다.

## 소스에서 확인한 문제

| 위치 | 현재 구현 | 수정 방향 |
| --- | --- | --- |
| `apps/mobile/src/constants/theme.ts` | 기본 caption 16, body 18, key 20, title 28, display 34 | 보조 정보와 본문을 구분하고 제목의 과도한 크기를 줄인다. |
| `apps/mobile/src/app/(tabs)/_layout.tsx` | Android 고정 inset 80, `minHeight: 68 + 80`, 라벨 16 ExtraBold, PNG 아이콘 | 실제 safe inset을 한 번만 반영하고 5개 탭의 시각적 무게를 통일한다. |
| `apps/mobile/src/screens/home/home-screen.tsx` | 폭 420 미만 사진 4:3, 이후 16:9; 설명·큰 글씨 스위치·CTA가 모두 큰 히어로 안에 있다 | 사진 비율을 고정하고 인사와 다음 행동을 먼저 보여 준다. |
| `apps/mobile/src/components/ui/cover-image.tsx` | `contentFit="cover"`, caller style로 비율 변경, 참고 이미지마다 별도 caption 블록 | 명시적 이미지 슬롯과 작은 참고 표기로 일관성을 만든다. |
| `apps/mobile/src/screens/discovery/{event,club}-detail-screen.tsx` | 휴대폰 4:3, 태블릿 2.4:1 | 사진의 피사체가 급격히 잘리지 않도록 상세 슬롯을 통일한다. |
| `apps/mobile/src/screens/auth/login-screen.tsx` | 사진 높이 250 고정, title 30/40, 보조 문구 16–18, CTA 글자 20 | 공통 타입 역할을 사용하고 사진 높이를 가용 폭으로 계산한다. |

현재 CoverImage는 `cover`로 원본 비율을 유지하며 자른다. 소스만으로 사진의 늘어남을 확정할 수는 없다.
대표 사진은 1812×868(약 2.09:1), 두 주제 사진은 1536×1024(3:2), 나머지 네 장은 1264×848(약 3:2)다.
따라서 동일 사진을 휴대폰 4:3로 보여 줄 때 원본 좌우가 크게 잘리는 현상과 실제 왜곡을 구분해 QA한다.

## P0 · 기본 글자와 큰 글씨 모드

| 역할 | 기본 크기/줄 높이 | 큰 글씨 크기/줄 높이 | 굵기 |
| --- | --- | --- | --- |
| caption · 날짜/배지/보조 정보 | 13 / 19 | 15 / 22 | Regular 또는 SemiBold |
| body · 본문/설명 | 16 / 24 | 18 / 28 | Regular |
| bodyStrong · 중요한 본문 | 16 / 24 | 18 / 28 | SemiBold |
| key · 버튼/핵심 값 | 17 / 24 | 19 / 28 | SemiBold |
| sectionTitle · 카드/섹션 제목 | 20 / 28 | 22 / 31 | SemiBold |
| title · 화면 제목 | 24 / 32 | 27 / 36 | SemiBold |
| display · 한 화면의 대표 문구 | 28 / 36 | 31 / 40 | ExtraBold |

숫자는 Android 논리 글자 크기이며 시스템 font scale이 추가로 적용된다. 기본 모드는 기존 사용자 선택을 바꾸지 않는다.
AppText의 `allowFontScaling`을 유지하고 임의로 시스템 확대를 차단하지 않는다. 큰 글씨 선택과 시스템 확대는 별개다.
중요 정보는 줄바꿈으로 수용한다. 카드와 버튼에는 고정 높이 대신 minHeight와 세로 여백을 사용한다.
본문을 모두 굵게 만들지 않는다. 버튼도 key와 동일한 SemiBold로 정리한다.
큰 글씨 제어는 내 정보의 접근성 설정에 유지/제공하고 홈에서는 작은 설정 행으로 안내한다. 큰 설명 패널은 히어로에서 분리한다.
공유 색상·버튼 역할을 변경할 필요가 없다. Native 타입 토큰으로 적용하고 로그인 화면의 별도 fontSize를 같은 역할로 정리한다.

## P0 · 하단 내비게이션

5개 목적지와 순서를 유지한다: 홈 / 커뮤니티 / 모임 / 채팅 / 내 정보.
기본 콘텐츠 영역 60dp + 런타임 `insets.bottom`으로 구성한다. Android 상수 80은 제거한다.
safe inset의 소유자는 탭 바 하나다. 라이브러리 자동 inset과 수동 padding을 겹쳐 더하지 않는다.
아이콘은 한 벡터 계열의 24dp, 동일한 획 굵기와 시각 중심을 사용한다. 기존 Expo 호환 아이콘 라이브러리를 우선한다.
혼합 emoji나 다섯 개의 별도 장식 PNG 대신 home / people / calendar / chat / person의 간결한 기호를 쓴다.
라벨은 기본 11–12sp SemiBold, 큰 글씨 13sp. 아이콘과 라벨 간격 3–4dp, 콘텐츠 상하 여백은 각각 6–8dp다.
활성 탭은 아이콘 뒤의 작은 sage pill과 primary 라벨로 표시한다. 셀 전체를 진한 색으로 채우지 않는다.
비활성 탭은 textSecondary, 경계는 얇은 divider, 표면은 theme.surface를 사용한다. 다크 테마도 같은 역할을 쓴다.
각 탭의 실제 누를 수 있는 영역은 최소 48×48dp다. 접근성 이름, selected 상태, 기존 testID를 유지한다.
큰 시스템 글자에서 라벨이 잘리면 콘텐츠 영역을 늘리거나 라벨을 두 줄로 수용한다. 자동 축소로 읽기 어려워지게 하지 않는다.
키보드가 열린 채팅에서는 기존 hideOnKeyboard를 유지한다. 시스템 3버튼 영역과 앱 탭 바를 시각적으로 구분한다.

## P0 · 사진 비율과 그래픽

CoverImage에 이미지 슬롯의 ratio를 명시한다. 이미지가 slot 전체를 채우고 `cover`를 사용하며 width와 ratio로 높이를 계산한다.
하나의 이미지에 aspectRatio와 독립적인 고정 height를 함께 적용하지 않는다. fallback에도 동일한 slot을 사용한다.
홈/로그인 히어로는 16:9, 목록 카드도 16:9, 상세는 3:2로 고정한다. 폭 420 경계에서 비율을 바꾸지 않는다.
아바타/정사각형 썸네일은 1:1, 사진 모아보기는 4:3처럼 별도 역할을 선언한다. 각 caller의 임의 숫자 반복을 줄인다.
제공 사진에 별도 초점 정보가 없다면 center crop을 기본으로 사용한다. 얼굴·손·활동이 잘리는지는 실제 화면 검수 대상으로 남긴다.
참고 사진임을 알리는 문구는 12–13sp의 한 줄로 표시한다. 본문급 큰 배너나 매 카드의 두꺼운 흰 띠로 만들지 않는다.
공용 사진을 실제 해당 모임 사진이라고 표시하지 않는다. 실패한 원격 사진의 fallback과 기존 오류 상태 초기화를 보존한다.
UI 버튼/탭/알림의 기호를 일관된 벡터로 통일한다. 모임의 주제 emoji는 콘텐츠 태그로만 사용한다.
이번 수정은 레이아웃·그래픽 표현의 수정이다. 사진 픽셀 변경이나 생성이 필요하면 별도 imagegen 결과로 다룬다.

## P1 · 홈 밀도와 여백

화면 좌우 16dp, 카드 내부 16dp, 섹션 간 24dp, 카드의 정보 그룹 간 8–12dp를 Native 토큰에서 적용한다.
HomeScreen의 카드 폭 계산은 Screen의 실제 좌우 padding과 동일해야 한다. 태블릿 2열에서도 카드가 넘치지 않아야 한다.
인사·지역·알림을 짧은 상단 행으로 만들고, 히어로 아래 CTA는 하나만 강조한다. 오늘 일정과 추천을 다음에 배치한다.
목적/사람/활동/관계 설명은 축약된 보조 섹션으로 내려 둔다. 주요 일정 전에 긴 안내 카드가 반복되지 않게 한다.
Screen의 status-bar inset을 화면별 `paddingTop`으로 덮어쓰지 않는다. 상단 safe inset과 콘텐츠 여백을 분리한다.
모든 원격 데이터의 로딩/오류/빈 상태를 보존한다. 화면 밀도를 줄이기 위해 신청 상태·마감·가격 정보를 숨기지 않는다.

## 구현 파일과 수용 기준

핵심: `constants/theme.ts`, `components/ui/{app-text,cover-image,screen}.tsx`, `app/(tabs)/_layout.tsx`.
화면: `screens/home/{home-screen,home-event-card}.tsx`, `screens/discovery/{club-card,event-detail-screen,club-detail-screen}.tsx`, `components/ui/event-card.tsx`, `screens/auth/login-screen.tsx`.
하단 바와 이미지 슬롯의 순수 계산/컴포넌트 검증을 수행하고, 최종 실제 APK는 부모 작업의 ADB QA에서 검증한다.

- 360 / 393 / 430dp 폭: 기본 body 16, caption 13, 5개 탭 라벨 표시, 가로 넘침 없음. 홈 사진 비율은 모든 폭에서 16:9.
- 기본/큰 글씨 각각: 주요 날짜·가격·신청 CTA가 잘리지 않고 줄바꿈하며 설정 선택이 재실행 후 유지된다.
- 시스템 font scale 1.0 / 1.3 / 2.0: 큰 글씨 선택과 조합해 탭, 폼, 긴 제목을 확인한다. 작은 글자로 축소해 통과시키지 않는다.
- 라이트/다크: 텍스트 대비, 활성 탭 상태, 작은 caption의 가독성, 아이콘의 균일한 무게를 확인한다.
- 제스처/3버튼: 실제 바닥 inset을 한 번만 적용하고 마지막 콘텐츠/CTA가 가려지지 않는다. 상단 상태 바도 겹치지 않는다.
- 로컬 참고/정상 원격/실패 원격/세로 원격 사진: slot의 가로·세로 비율은 고정되고 사진은 늘어나지 않으며 대체 표기가 유지된다.
- 카드→상세→뒤로, 탭 변경, 채팅 키보드: 내비게이션 동작·인증 복원·스크롤을 유지한다. 개인 정보와 원본 장치 캡처는 저장소에 넣지 않는다.

수치·레이아웃 검증 통과와 실제 시각 검수 완료를 구분해 보고한다. 이 문서의 항목은 계획이며 현재 QA 통과를 뜻하지 않는다.

## 구현과 코드 검증

위 Native 토큰, 확대 가능한 하단 탐색, 한 계열의 Material Symbols, 고정 이미지 슬롯과 화면 밀도를 구현했다. 하단 탐색과 홈 알림 아이콘은 설치된 Expo font를 사용한다. 관심사 category와 기존 상세 정보의 emoji 표시는 유지한다. 앱의 인증·공유 foundation·서버 데이터·버전은 변경하지 않았다.

Mobile 348개 테스트 / 45개 파일, TypeScript와 ESLint가 통과했다. 신규 검사에는 360/393/430dp와 시스템 배율 1.0/1.3/2.0의 하단 탐색 계산, 탭 이벤트/keyboard hide, AppText 확대, 이미지 height 충돌·세로 원격 사진·fallback, Screen inset 소유권을 포함한다. 이 결과는 실제 기기 스크린샷이나 전체 수용 기준의 시각 검수 결과가 아니다. 최종 APK의 실기기 결과는 QA 보고서와 별도 증거에 기록한다.

최종 입력란 보강 source `e9410c4…`는 프로필·선택형 번호 인증·채팅에도 같은 body 토큰을 적용한다. 인증 controller·프로필 저장·채팅 전송 로직은 그대로다. 이후 전체 mobile 348 tests / 45 files와 TypeScript, 변경 파일 ESLint가 다시 통과했다.

실기기 시스템 배율 2.0 캡처에서 두 줄 커뮤니티 라벨만 icon이 위로 이동하는 문제를 발견했다. 탭의 그래픽 줄을 상단에 동일하게 정렬하고 커뮤니티를 두 줄에서 2+2 음절로 나눠 수정했다. 기존 하단 탐색 12 tests / 2 files, TypeScript, scoped ESLint가 통과했다. 이 부분은 소스 검토만으로 통과한 것으로 보고하지 않으며 새 APK 캡처로 다시 확인한다.

## 최종 실기기 확인

최종 source `0d91c279bb8d14c210a9dbac89326da9234a8428`에서 새 QA APK를 설치하고 8개 core 검사와 6개 기본/큰 글씨·시스템 배율 조합을 통과했다. 확대된 두 줄 탭에서도 icon의 Y가 모두 같았고 홈 사진 16:9가 유지됐다. 실제 정상/최대 확대 캡처를 직접 확인했으며 임시 설정은 원복했다. 앱은 기존 light 고정 설정을 유지하므로 시스템 night에서 layout 유지와 실제 앱 dark palette 검증을 구분한다. 실제 모임 목록 16:9·상세 3:2 사진을 측정하고 pixels를 직접 확인했다. 탭 변경 뒤 선택 배경이 사각형으로 보이던 문제도 고정 14dp radius와 native view 유지로 보완한 뒤 5개 선택 상태를 실제 캡처로 확인했다. 전체 수용 기준 통과나 Play screenshot 승인을 주장하지 않는다. [실기기 보고서](QA_PRODUCTION_20260930.md), [정제 증거](qa-evidence/20260930/native-design-live.json).
