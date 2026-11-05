# Asset Specs — system: sacheonseong-tiles

> **Source**: `design/gdd/sacheonseong-tiles.md`
> **Art Bible**: `design/art/art-bible.md`
> **Generated**: 2026-11-03
> **Review Mode**: `full` (`art-director` + `technical-artist` constraints applied)
> **Status**: 6 assets specced / 6 approved / 0 in production / 1 done (`ASSET-019` generated in `assets/game/`)

---

## ASSET-019 — 전통 패 사천성 원목·상아 타일 세트 (Traditional Korean Wood & Ivory Tile Set)

| Field | Value |
|-------|-------|
| Category | Sprite / Item |
| Dimensions | 1024×1024px Master Sheet (8 distinct tile motifs, each slice ≥ 48×64dp on screen) |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/spr_sacheonseong_tile_set_01.png` |
| Texture Res | 1024px — matches Art Bible §8 Tier 2 |

**Visual Description:**
시니어 친화 사천성 모드의 핵심인 두툼한 느티나무 하단 베이스(`#D8B384`)와 따뜻한 상아빛(`#FCF9F2`) 상판을 가진 고대비 전통 패 8종 스프라이트 시트입니다. 작은 한자만 빼곡한 기존 마작패와 달리, 시니어가 한눈에 구분할 수 있는 큼직하고 선명한 한국 전통 길상 문양 — (1) 소나무와 학(송학), (2) 붉은 홍매화, (3) 주황 단풍잎, (4) 황금 보름달과 옥토끼, (5) 비취색 고려청자 매병, (6) 장수 거북, (7) 황금 모란꽃, (8) 푸른 대나무 — 이 뚜렷한 외곽선과 고유 색상으로 그려져 있습니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: 상아빛 패 표면과 굵직한 전통 문양으로 돋보기 없이 0.5초 내 판독 보장
- §3 Shape Language: 모서리가 둥글게 모따기된 직사각형 패(Chamfered Rectangle)와 두툼한 하단 원목 베벨
- §4 Color System: Warm Ivory Tile (`#FCF9F2`), Zelkova Warm Wood (`#D8B384`), Club Heritage Green (`#0E5142`), Decisive Terracotta (`#C2410C`), Master Brass Gold (`#F0BF4F`)

**Generation Prompt:**
`2D game sprite sheet of 8 chunky traditional Korean Sacheonseong puzzle tiles arranged neatly in a 4x2 grid on a clean transparent background. Each rectangular tile has a warm ivory top face (#FCF9F2) and a thick beveled zelkova hardwood base (#D8B384) with crisp borders. The 8 tiles feature bold, large, high-contrast traditional Korean emblems for easy senior visibility: (1) green pine tree and white crane, (2) vibrant red plum blossom, (3) terracotta autumn maple leaf (#C2410C), (4) golden full moon over blue waves, (5) jade green Goryeo celadon vase, (6) emerald longevity turtle, (7) golden peony flower (#F0BF4F), (8) deep green bamboo stalks (#0E5142). Clean stylized 2D game art, bold outlines, isolated on transparent background, no blurry details.`

**Status:** Done (`assets/game/spr_sacheonseong_tile_set_01.png`)

---

## ASSET-020 — 사천성 솔잎색 다포(茶布) 보드 매트 (Deep Pine Felt Tile Board Mat)

| Field | Value |
|-------|-------|
| Category | Environment |
| Dimensions | 1024×1024px |
| Format | PNG (RGB) |
| Naming | `assets/game/env_sacheonseong_mat_board_01.png` |
| Texture Res | 1024px — matches Art Bible §8 Tier 1 |

**Visual Description:**
상아빛 사천성 패(`#FCF9F2`)가 가장 선명한 명도 대비로 떠오르도록 받쳐주는 짙은 솔잎색(`#0E5142`) 직조 다포(차탁 매트) 보드 배경입니다. 외곽은 호두나무 몰딩 프레임과 황동 모서리 장석으로 마감되어 있습니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: 짙은 솔잎색 바탕과 상아빛 패의 4.5:1 이상 고대비 분리
- §6 Environment Design Language: 플레이 그리드 내부의 텍스처 명도 차이를 8% 이내로 억제

**Generation Prompt:**
`Top-down 2D game board background featuring a deep heritage pine green (#0E5142) woven linen tea mat framed by carved dark walnut wood molding (#6E4228) with subtle brass corner brackets (#F0BF4F), uniform low-noise center surface optimized for high-contrast ivory tile readability.`

**Status:** Needed

---

## ASSET-021 — 사천성 2회 굴절 황금 연결 광선 & 선택 후광 (Orthogonal Match Line & Tile Glow)

| Field | Value |
|-------|-------|
| Category | VFX / HUD |
| Dimensions | 512×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/vfx_sacheonseong_match_line_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
같은 문양의 두 패가 2회 이하 굴절로 연결될 때 경로를 따라 또렷하게 그어지는 황금빛·황토 주황(`#F0BF4F` / `#C2410C`) 직각 연결 광선과, 굴절 꼭짓점에 표시되는 마름모 매듭 이펙트입니다.

**Art Bible Anchors:**
- §3 Shape Language: Orthogonal Lines — 직각 연결선과 마름모 굴절점
- §4 Color System: Master Brass Gold (`#F0BF4F`) & Decisive Terracotta (`#C2410C`)

**Generation Prompt:**
`2D game UI/VFX sprite sheet on transparent background: glowing golden (#F0BF4F) and terracotta (#C2410C) orthogonal connection beam segments, 90-degree corner knot joint emblem, and a rounded rectangle tile selection highlight border.`

**Status:** Needed

---

## ASSET-022 — 사천성 황동 돋보기 힌트 & 패 섞기 아이콘 (Brass Magnifier Hint & Tile Shuffle Icons)

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 512×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/ui_sacheonseong_tool_icons_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
사천성 하단 56dp 보조 도구 버튼에 들어가는 아이콘 2종입니다: (1) 느티나무 손잡이가 달린 큼직한 황동 돋보기(힌트), (2) 두 장의 상아 원목 패가 화살표를 따라 경쾌하게 자리를 바꾸는 패 섞기 아이콘.

**Art Bible Anchors:**
- §7 UI/HUD Visual Direction: 56dp 보조 도구 버튼의 즉각적 기능 이해 지원

**Generation Prompt:**
`Pair of 2D game UI tool icons on transparent background: (1) vintage brass magnifying glass (#F0BF4F) with a warm wooden handle (#D8B384) and bright teal lens gleam (#1E6F94), (2) two ivory wooden tiles rotating with bold golden curved arrows for shuffle. High contrast, crisp silhouette.`

**Status:** Needed

---

## ASSET-023 — 사천성 매화잎·솔잎 매칭 스파크 VFX (Plum Blossom & Pine Needle Match Spark)

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 256×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/vfx_sacheonseong_tile_pop_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
짝맞춘 두 패가 사라지는 순간 타일 자리에서 400ms 동안 산뜻하게 퍼지는 매화 꽃잎과 금빛 나무 별 스파크 이펙트입니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: Principle 3 — 600ms 이내의 절도 있는 소거 피드백

**Generation Prompt:**
`2D game VFX burst sprite on transparent background: crisp red plum blossom petals, pine needles, and warm golden star sparks bursting outward from a rectangular tile footprint, clean stylized 2D art.`

**Status:** Needed

---

## ASSET-024 — 사천성 원목 패 맞춤음 & 가야금 콤보 음계 SFX (Sacheonseong Tile Audio Suite)

| Field | Value |
|-------|-------|
| Category | Audio (SFX) |
| Dimensions | 0.2s ~ 0.6s One-shots |
| Format | WAV (44.1kHz, 16-bit) |
| Naming | `sfx_sacheonseong_tile_tap_01.wav`, `sfx_sacheonseong_tile_match_01.wav` |
| Texture Res | N/A (Audio Asset) |

**Visual / Sonic Description:**
단단한 원목·대나무 패를 선택할 때 나는 경쾌한 "톡" 소리와, 두 패가 짝맞춰 사라질 때 울리는 "착-딱!" 나무 부딪침 소리 및 연속 콤보 횟수(1~5연타)에 따라 한 음씩 맑게 올라가는 펜타토닉(궁상각치우) 가야금·실로폰 화음입니다.

**Art Bible Anchors:**
- §2 Mood & Atmosphere: 사천성의 Rhythmic Flow를 강화하는 단계별 청각 보상

**Generation Prompt:**
*(Audio Asset — Description Only: Crisp bamboo-and-hardwood tile tap 'tok', satisfying pair match clack 'chak-ttak!', and ascending 5-step pentatonic gayageum/marimba chime for consecutive combos.)*

**Status:** Needed
