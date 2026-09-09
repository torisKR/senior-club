# Design System — 시니어클럽

## Product Context

- **What this is:** 좋아하는 활동을 중심으로 가까운 사람을 만나고, 모임 이후에도 대화와 다음 약속을 이어가는 모바일 커뮤니티입니다.
- **Who it's for:** 45–69세의 중년 사용자. 디지털 숙련도와 시력·운동 능력이 다양하므로 명확한 문장, 큰 글씨, 넉넉한 터치 영역을 우선합니다.
- **Space/industry:** 지역 기반 취미·소셜 커뮤니티
- **Project type:** Expo React Native Android 앱과 Next.js 웹 서비스

## Product UX Principles

1. **오늘 할 일을 먼저 보여준다.** 홈 첫 흐름은 내 일정, 추천 모임, 관심 테마 순서입니다. 서비스 철학은 행동 뒤에 둡니다.
2. **신청 전에 불안을 없앤다.** 날짜·장소·참가비·난이도·남은 자리를 한 화면에서 비교하고, 로그인 필요 여부와 승인 상태를 버튼 옆에서 설명합니다.
3. **한 화면 한 가지 다음 행동.** 버튼 라벨은 결과를 직접 말합니다. 예: `로그인하고 모임 신청하기`, `모임 채팅 열기`.
4. **색만으로 상태를 말하지 않는다.** 승인 대기·참여 확정·후기 작성 상태는 색상, 상태명, 설명을 함께 제공합니다.
5. **읽고, 누르고, 되돌아오기 쉽다.** 카드와 버튼은 최소 56px, 보조 조작은 48px 이상이며, 인증 후 원래 모임으로 복귀합니다.

## Aesthetic Direction

- **Direction:** 따뜻한 자연주의 + 기능 중심 편집 디자인
- **Decoration level:** intentional. 사진과 이모지는 맥락을 돕는 장식으로만 사용하고, 핵심 정보는 텍스트로 전달합니다.
- **Mood:** 부담 없이 믿음직하고, 야외 활동을 시작하기 전의 맑은 아침처럼 차분합니다. 노년 이미지를 강조하지 않고 ‘좋아하는 일을 함께하는 사람’의 활력을 보여줍니다.
- **Layout:** 모바일에서는 세로 흐름과 명확한 섹션 구분, 태블릿에서는 2열 카드 그리드를 사용합니다.

## Typography

- **Display/Hero:** Pretendard ExtraBold — 한글 획이 선명하고 큰 제목에서 안정적입니다.
- **Body:** Pretendard Regular — 긴 설명과 일정 정보를 편안하게 읽습니다.
- **UI/Labels:** Pretendard SemiBold — 버튼, 상태, 탭의 우선순위를 분명하게 합니다.
- **Data/Tables:** Pretendard SemiBold with tabular-nums where counts are shown.
- **Loading:** 앱에 Pretendard Regular/SemiBold/ExtraBold를 번들합니다.
- **Scale:** caption 16/23, body 18/28, key 20/30, section 22/31, title 28/38, display 34/44. 큰 글씨 모드는 18/27, 20/31, 22/33, 25/35, 32/42, 38/48입니다.

## Color

- **Approach:** balanced. 숲색을 주요 행동에, 주황색을 한 화면의 결정적 행동에 사용합니다.
- **Primary:** #0E5142 — 신뢰, 참여, 주요 버튼
- **Primary pressed:** #083C31
- **Accent:** #C2410C — 신청처럼 지금 눌러야 하는 행동
- **Info:** #1E6F94 — 일정·안내 상태. #E5F4FA 배경과 AA 대비를 확보합니다.
- **Neutrals:** #FBFCFB background, #FFFFFF surface, #F1F5F3 element, #A6B8B2 border, #51645F secondary, #18312B text
- **Semantic:** success #236B4D / #E3F3EA, warning #855B00 / #FFF1C7, error #A22D2D / #FBE8E8, info #1E6F94 / #E5F4FA
- **Dark mode:** 표면 대비를 먼저 확보하고, primary/accent는 밝기를 올려 동일한 의미를 유지합니다.

## Spacing

- **Base unit:** 4px
- **Density:** comfortable. 한 손 조작과 큰 글씨 확대를 위해 여백을 줄이지 않습니다.
- **Scale:** 2xs 2, xs 4, sm 8, md 12, lg 16, xl 20, xxl 24, xxxl 32, huge 40

## Layout

- **Approach:** grid-disciplined on mobile, hybrid on tablet
- **Grid:** 1열 under 760px, 2열 at 760px and above
- **Max content width:** 720px for reading screens, 980px for event grids
- **Border radius:** sm 10px, md 14px, lg 18px, xl 24px, pill 999px
- **Touch targets:** primary 56px, compact 48px
- **Insets:** 20px horizontal screen padding, Android gesture inset included in bottom tabs

## Motion

- **Approach:** minimal-functional
- **Easing:** enter ease-out, exit ease-in, move ease-in-out
- **Duration:** micro 80ms, short 160–200ms, medium 300ms
- **Rule:** 상태 변화를 설명하는 전환만 사용하고, 읽기와 신청을 늦추는 장식 애니메이션은 넣지 않습니다.

## Core User Journey

휴대폰 인증 → 지역·출생연도·관심사 설정 → 홈의 내 일정/추천 모임 확인 → 날짜·장소·비용·난이도 비교 → 로그인 후 신청 → 승인 대기/확정 알림 → 승인된 모임 채팅 → 참여 후 후기 → 비슷한 다음 모임 추천

## Accessibility QA Targets

- 360×800 Android에서 가로 스크롤 없음
- OS 글꼴 130–150%에서도 버튼·탭·입력창 잘림 없음
- 본문/캡션 대비 WCAG AA 4.5:1 이상
- TalkBack 순서: 제목 → 핵심 정보 → 신청 행동
- 카드에는 상세 이동과 신청 방법을 설명하는 accessibility hint 제공

## Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-09-09 | 홈을 일정·추천 우선으로 재배치 | 중년 사용자가 첫 진입에서 가장 먼저 찾는 행동을 앞에 둠 |
| 2026-09-09 | Pretendard와 기존 숲색 팔레트 유지 | 이미 구현된 한글 가독성과 브랜드 연속성을 보존 |
| 2026-09-09 | 정보 색상을 #1E6F94로 조정 | 작은 보조 글씨도 충분한 대비를 갖도록 함 |
| 2026-09-09 | 카드 행동 힌트와 명시적 안내 추가 | 카드가 눌린다는 사실과 신청 흐름을 처음 사용자에게 설명 |
