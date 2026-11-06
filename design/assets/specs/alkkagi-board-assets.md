# Asset Specs — system: alkkagi-board

> **Source**: `design/gdd/alkkagi-board.md`
> **Art Bible**: `design/art/art-bible.md`
> **Generated**: 2026-11-03
> **Review Mode**: `full` (`art-director` + `technical-artist` constraints applied)
> **Status**: 6 assets specced / 6 approved / 0 in production / 1 done (`ASSET-013` generated in `assets/game/`)

---

## ASSET-013 — 알까기 비자나무 정석 바둑판 보드 (Traditional Kaya Wood Alkkagi Board)

| Field | Value |
|-------|-------|
| Category | Environment |
| Dimensions | 1024×1024px (Master Tier 1 Board Texture) |
| Format | PNG (RGB) |
| Naming | `assets/game/env_alkkagi_wood_board_01.png` |
| Texture Res | 1024px — matches Art Bible §8 Tier 1 |

**Visual Description:**
알까기 보드 대전의 무대가 되는 탑다운 비자나무(Kaya Wood) 원목 바둑판 보드입니다. 황갈색의 따뜻하고 차분한 나뭇결(`#D8B384`) 위에 짙은 먹빛(`#182620`) 격자선과 화점(星)이 또렷하게 그어져 있으며, 바둑판 네 변의 묵직한 나무 단차(호두나무 외곽 베벨 `#6E4228`)가 바둑판 안쪽과 장외(낙하 구역)의 경계를 한눈에 구분해 줍니다. 보드 위에는 대치 중인 윤기 나는 흑석과 백석이 정갈하게 놓여 있습니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: 비자나무 원목 보드와 흑석/백석의 확실한 명도 분리
- §3 Shape Language: 정방형 원목 보드의 두툼한 모따기 외곽 단차와 원형 바둑알의 대비
- §4 Color System: Zelkova Warm Wood (`#D8B384`), Deep Walnut Frame (`#6E4228`), Obsidian Stone Ink (`#182620`), Warm Ivory (`#FCF9F2`)

**Generation Prompt:**
`Top-down 90-degree orthographic 2D game board illustration of a traditional Korean Kaya hardwood Go board (Badukpan, #D8B384) resting on a dark walnut table frame (#6E4228) with a deep forest green (#0E5142) mat border. Crisp dark ink grid lines (#182620) and star points, thick beveled wooden board edges clearly showing the drop-off boundary for Alkkagi, with several glossy obsidian black stones and pearlescent ivory white stones arranged in an exciting face-off formation. High contrast, tactile hand-crafted 2D game art, no text, no hands.`

**Status:** Done (`assets/game/env_alkkagi_wood_board_01.png`)

---

## ASSET-014 — 알까기 흑요석 흑석 & 백합조개 백석 스프라이트 세트 (Black & White Alkkagi Stones)

| Field | Value |
|-------|-------|
| Category | Sprite / Item |
| Dimensions | 512×512px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/spr_alkkagi_stones_set_01.png` |
| Texture Res | 512px — matches Art Bible §8 Tier 2 |

**Visual Description:**
비자나무 보드 위에서 굴러가고 충돌하는 흑석(`#182620`)과 백석(`#FCF9F2`) 개별 스프라이트 및 선택 하이라이트 링입니다. 피아 식별과 저시력 접근성을 위해 흑석 중앙에는 은은한 금빛 북두칠성/별 음각이, 백석에는 이중 원형 양각 테두리가 들어가 있습니다.

**Art Bible Anchors:**
- §3 Shape Language: 지름 44dp 이상의 큼직한 원형 실루엣과 하단 입체 그림자
- §4 Color System: Colorblind Safety Rule 2 — 12:1 명도 대비 + 조작 가능 알 금빛 점선 링

**Generation Prompt:**
`2D top-down game sprite sheet on transparent background: (1) glossy obsidian black Go stone (#182620) with subtle golden star emblem and specular rim highlight, (2) pearlescent clam-shell ivory white Go stone (#FCF9F2) with subtle double concentric ring engraving and soft drop shadow, (3) glowing golden dotted selection ring (#F0BF4F). High contrast, crisp edges.`

**Status:** Needed

---

## ASSET-015 — 알까기 활시위 파워 게이지 & 충돌 예측 링 (Flick Slingshot & Impact Predictor)

| Field | Value |
|-------|-------|
| Category | UI / HUD |
| Dimensions | 512×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/ui_alkkagi_flick_gauge_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
바둑알을 손가락으로 당길 때 알 뒤쪽에 생성되는 황토 주황·금빛(`#C2410C` / `#F0BF4F`) 활시위 모양 텐션 게이지와, 목표 상대 알과의 1차 충돌 지점을 미리 보여주는 상아빛 고스트 링입니다.

**Art Bible Anchors:**
- §3 Shape Language: 쐐기형 방향 지시자와 원형 충돌 예측 링
- §7 UI/HUD Visual Direction: 손떨림 보정과 직관적인 타격 강도 인지 지원

**Generation Prompt:**
`2D game aiming UI sprites on transparent background: taut bowstring-style pull power gauge transitioning from warm gold (#F0BF4F) to terracotta orange (#C2410C) with clear notch marks, paired with a crisp ivory target impact preview circle and directional arrow.`

**Status:** Needed

---

## ASSET-016 — 알까기 원목 문진 & 다기 받침 장애물 프롭 (Paperweight & Coaster Obstacles)

| Field | Value |
|-------|-------|
| Category | Environment / Prop |
| Dimensions | 512×512px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/spr_alkkagi_obstacles_01.png` |
| Texture Res | 512px — matches Art Bible §8 Tier 2 |

**Visual Description:**
알까기 퍼즐 스테이지에서 바둑판 중앙에 놓이는 무거운 황동·흑단 서예 문진(고정 엄폐물)과 탄성 반사를 일으키는 둥근 대나무 다기 받침 프롭입니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: Principle 2 — 다실에 실제로 어울리는 전통 공예 소재만 사용
- §3 Shape Language: 고정 장애물(직사각형 문진)과 탄성 범퍼(원형 받침)의 형태 구분

**Generation Prompt:**
`Top-down 2D game obstacle sprites on transparent background: (1) rectangular dark ebony calligraphy paperweight with brass knob handle, (2) round woven bamboo tea coaster bumper with brass rim. Hand-crafted stylized 2D game art, high contrast.`

**Status:** Needed

---

## ASSET-017 — 알까기 일석이조 충격파 링 & 족자 배너 VFX (Double Knockout Shockwave & Scroll Banner)

| Field | Value |
|-------|-------|
| Category | VFX / UI |
| Dimensions | 512×512px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/vfx_alkkagi_impact_ring_01.png` |
| Texture Res | 512px — matches Art Bible §8 Tier 2 |

**Visual Description:**
바둑알이 강하게 충돌하는 순간 퍼지는 금백색 충격파 링과, 한 수로 상대 알 2개를 떨어뜨렸을 때 상단에 펼쳐지는 한지 두루마리 족자 배너 프레임입니다.

**Art Bible Anchors:**
- §2 Mood & Atmosphere: Measured Tension → Explosive Impact 전환을 시각적으로 완결
- §4 Color System: Master Brass Gold (`#F0BF4F`), Warm Ivory (`#FCF9F2`), Decisive Terracotta (`#C2410C`)

**Generation Prompt:**
`2D game VFX and banner sheet on transparent background: (1) sharp concentric white-gold shockwave ring with crisp impact sparks for colliding Go stones, (2) traditional Korean ivory hanji horizontal scroll banner frame with wooden rollers and red silk tassels (#C2410C), blank center for UI text.`

**Status:** Needed

---

## ASSET-018 — 알까기 흑백 바둑알 충돌음 & 장외 낙하 SFX (Alkkagi Stone Audio Suite)

| Field | Value |
|-------|-------|
| Category | Audio (SFX) |
| Dimensions | 0.2s ~ 0.8s One-shots |
| Format | WAV (44.1kHz, 16-bit) |
| Naming | `sfx_alkkagi_stone_clack_01.wav`, `sfx_alkkagi_knockout_drop_01.wav` |
| Texture Res | N/A (Audio Asset) |

**Visual / Sonic Description:**
두꺼운 흑요석·조개껍질 바둑알이 맞부딪힐 때 울리는 맑고 단단한 "딱! 따닥!" 마찰 충돌음과, 바둑판 단차를 넘어 아래 원목 테이블로 떨어질 때의 통쾌한 "툭-달그락!" 낙하 효과음입니다.

**Art Bible Anchors:**
- §9 Reference Direction: Clubhouse Games 51 수준의 절도 있고 청아한 기물 충돌 사운드

**Generation Prompt:**
*(Audio Asset — Description Only: Sharp resonant slate-and-shell Go stone collision clack 'ttak!', multi-hit ricochet 'tta-dak!', and heavy wooden table drop sound when knocked off the board.)*

**Status:** Needed
