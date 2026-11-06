# Asset Specs — system: park-golf-arcade

> **Source**: `design/gdd/park-golf-arcade.md`
> **Art Bible**: `design/art/art-bible.md`
> **Generated**: 2026-11-03
> **Review Mode**: `full` (`art-director` + `technical-artist` constraints applied)
> **Status**: 6 assets specced / 6 approved / 0 in production / 2 done (`ASSET-007`, `ASSET-008` generated in `assets/game/`)

---

## ASSET-007 — 파크골프 탑다운 그린 & 페어웨이 보드 (Top-Down Park Golf Green Board)

| Field | Value |
|-------|-------|
| Category | Environment |
| Dimensions | 1024×1024px (Master Tier 1 Board Texture) |
| Format | PNG (RGB) |
| Naming | `assets/game/env_parkgolf_green_board_01.png` |
| Texture Res | 1024px — matches Art Bible §8 Tier 1 |

**Visual Description:**
파크골프 아케이드 모드의 핵심 플레이 필드인 고대비 탑다운(90° 수직 내려다보기) 잔디 코스 보드입니다. 외곽은 호두나무·느티나무 원목 쿠션 펜스(`#6E4228` / `#D8B384`)로 둘러싸여 있고, 내부는 짙은 솔잎색 러프(`#0E5142`)와 선명하게 깎인 페어웨이 그린(`#356347`)이 명확한 경계를 이룹니다. 상단에는 상아색 테두리의 홀컵과 붉은 주황 깃대, 측면에는 부드러운 황금빛 모래 벙커가 배치되어 있습니다.

**Art Bible Anchors:**
- §2 Mood & Atmosphere: 5500K 청명한 야외 주간광, 2톤 포레스트 그린 잔디 명암 스트라이프
- §3 Shape Language: 플레이 영역 내부에 불필요한 노이즈를 배제하고 쿠션 펜스와 벙커의 기하학적 경계를 명확화
- §4 Color System: Club Heritage Green (`#0E5142`), Fairway Turf Green (`#356347`), Zelkova Warm Wood (`#D8B384`), Decisive Terracotta (`#C2410C`)

**Generation Prompt:**
`Top-down 90-degree orthographic 2D game board background of a miniature park golf course, framed by warm crafted zelkova and walnut wooden bumper rails (#D8B384, #6E4228). Inside features crisp two-tone mowed fairway stripes in heritage forest green (#0E5142 and #356347), one clean warm sand bunker (#F0BF4F), a bright ivory-rimmed hole cup at the upper green with a terracotta orange pin flag (#C2410C), and a wooden tee-off marker at the bottom. High contrast, ultra-clean playable surface, stylized tactile 2D game art, no characters, no text, no clutter.`

**Status:** Done (`assets/game/env_parkgolf_green_board_01.png`)

---

## ASSET-008 — 파크골프 원목 퍼터·볼·깃대 스프라이트 세트 (Park Golf Putter, Ball & Flag Set)

| Field | Value |
|-------|-------|
| Category | Sprite / Item |
| Dimensions | 1024×1024px Master Sheet (Individual slices 256×256px ~ 512×512px) |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/spr_parkgolf_club_ball_set_01.png` |
| Texture Res | 512px/1024px — matches Art Bible §8 Tier 2 |

**Visual Description:**
파크골프 플레이의 핵심 상호작용 기물 4종을 한 장에 담은 고대비 스프라이트 세트입니다: (1) 황동 솔플레이트와 흰색 조준선(Alignment Line)이 선명하게 새겨진 감나무 원목 퍼터 헤드, (2) 딤플과 굵은 외곽 베벨이 또렷한 고시인성 상아백색 파크골프 볼, (3) 골든 옐로우 보너스 볼, (4) 홀컵과 황토 주황 번호 깃대. 모든 요소는 투명 배경 위에 또렷한 실루엣으로 분리되어 있습니다.

**Art Bible Anchors:**
- §3 Shape Language: 완전한 원형 볼(Hero Shape)과 쐐기형 조준선이 각인된 둥근 직사각 퍼터 헤드
- §4 Color System: Warm Ivory (`#FCF9F2`), Master Brass Gold (`#F0BF4F`), Decisive Terracotta (`#C2410C`), Zelkova Wood (`#D8B384`)

**Generation Prompt:**
`2D game asset sprite sheet on a clean transparent background with 4 separated items arranged in a 2x2 grid: (1) top-down persimmon hardwood park golf club head with a gleaming brass sole plate and bold white aim line, (2) large high-contrast glossy ivory-white park golf ball (#FCF9F2) with subtle dimples and crisp dark outline, (3) golden yellow special park golf ball (#F0BF4F), (4) hole cup ring with a bright terracotta orange (#C2410C) triangular pin flag. Stylized hand-crafted 2D game art, bold readable shapes, isolated on transparent background, no text.`

**Status:** Done (`assets/game/spr_parkgolf_club_ball_set_01.png`)

---

## ASSET-009 — 파크골프 조준 점선 궤적 & 경사 화살표 오버레이 (Aim Trajectory & Slope Chevrons)

| Field | Value |
|-------|-------|
| Category | UI / HUD |
| Dimensions | 512×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/ui_parkgolf_aim_slope_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
초록 잔디 위에서도 적녹 색각 이상자와 시니어 플레이어가 즉시 경로를 읽을 수 있도록 상아색(`#FCF9F2`) 외곽선으로 감싼 황토 주황(`#C2410C`) 점선 조준 궤적과, 그린의 오르막·내리막 경사도를 화살표 개수(1~3개 갈매기 기호)로 표시하는 타일 오버레이 세트입니다.

**Art Bible Anchors:**
- §3 Shape Language: 굵고 명확한 기하학적 쐐기(Chevron)와 직선 점선
- §4 Color System: Colorblind Safety Rule 3 — 상아색 이중 외곽선 + 갈매기 개수로 경사 강도 중복 표시

**Generation Prompt:**
`2D game HUD overlay sprite sheet on transparent background: dotted aiming trajectory line with warm ivory (#FCF9F2) outer stroke and terracotta orange (#C2410C) fill, 3-step power meter ticks, and three slope indicator tiles with 1, 2, and 3 crisp teal-blue (#1E6F94) and gold (#F0BF4F) chevron arrows. High contrast, clean geometric UI style.`

**Status:** Needed

---

## ASSET-010 — 파크골프 원목 게이트 & 통나무 범퍼 프롭 (Wooden Gate & Log Bumpers)

| Field | Value |
|-------|-------|
| Category | Environment / Prop |
| Dimensions | 512×512px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/spr_parkgolf_obstacles_01.png` |
| Texture Res | 512px — matches Art Bible §8 Tier 2 |

**Visual Description:**
중급 이상 파크골프 홀에 배치되는 탑다운 장애물 프롭 3종(황동 코너 장식이 붙은 원목 반사 블록, 아치형 통과 게이트, 연못 위 원목 징검다리)입니다. 공이 부딪히는 반사면에는 밝은 상아·황동 띠를 둘러 충돌 판정 경계를 직관적으로 보여줍니다.

**Art Bible Anchors:**
- §3 Shape Language: 둥근 모서리 직사각형과 명확한 충돌면 하이라이트
- §6 Environment Design Language: 보드 내부에는 실제 물리 판정에 관여하는 구조물만 배치

**Generation Prompt:**
`Top-down 2D game obstacle sprites on transparent background: (1) beveled walnut wood bumper block with brass corner caps and ivory bounce strip, (2) wooden arch gate with golden arrow marker, (3) wooden stepping plank bridge. Stylized crafted 2D art, high contrast.`

**Status:** Needed

---

## ASSET-011 — 파크골프 홀인 황금 링 & 타격 스파크 VFX (Hole-In Golden Ring & Impact VFX)

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 256×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/vfx_parkgolf_holein_ring_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
퍼터가 공을 때리는 순간 튀는 짧은 상아백색 타격 스파크와, 공이 홀컵에 빨려 들어갈 때 홀 둘레에서 동심원으로 퍼지는 황금빛(`#F0BF4F`) 축하 파동 링입니다.

**Art Bible Anchors:**
- §3 Shape Language: 완전한 원형 충격파 링
- §4 Color System: Master Brass Gold (`#F0BF4F`) & Warm Ivory (`#FCF9F2`)

**Generation Prompt:**
`2D game VFX sprite on transparent background: concentric expanding golden ring (#F0BF4F) with crisp ivory inner glow (#FCF9F2) and 4 clean radial impact sparks for a golf hole-in celebration, clean stylized 2D, no blurry smoke.`

**Status:** Needed

---

## ASSET-012 — 파크골프 감나무 퍼터 타구음 & 홀컵 컵인 SFX (Park Golf Audio Suite)

| Field | Value |
|-------|-------|
| Category | Audio (SFX) |
| Dimensions | 0.4s ~ 1.0s One-shots |
| Format | WAV (44.1kHz, 16-bit) |
| Naming | `sfx_parkgolf_putt_hit_01.wav`, `sfx_parkgolf_cup_in_01.wav` |
| Texture Res | N/A (Audio Asset) |

**Visual / Sonic Description:**
감나무 원목 퍼터 헤드가 단단한 합성수지 파크골프 공을 가격할 때 나는 경쾌하고 묵직한 "딱!" 타구음과, 잔디 마찰음, 그리고 홀컵 금속 라이너에 공이 부딪히며 들어가는 "달그락-통!" 사운드입니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: 손끝 감각을 극대화하는 명확한 청각 피드백

**Generation Prompt:**
*(Audio Asset — Description Only: Crisp persimmon wood golf club impact sound 'ttak!', soft grass rolling loop, and satisfying metallic-plastic cup-in rattle 'dal-geu-rak tong!'.)*

**Status:** Needed
