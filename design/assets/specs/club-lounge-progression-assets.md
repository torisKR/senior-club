# Asset Specs — system: club-lounge-progression

> **Source**: `design/gdd/club-lounge-progression.md`
> **Art Bible**: `design/art/art-bible.md`
> **Generated**: 2026-11-03
> **Review Mode**: `full` (`art-director` + `technical-artist` constraints applied)
> **Status**: 6 assets specced / 6 approved / 0 in production / 2 done (`ASSET-001`, `ASSET-002` generated in `assets/game/`)

---

## ASSET-001 — 클럽 라운지 히어로 배너 (Club Lounge Hero Banner)

| Field | Value |
|-------|-------|
| Category | UI / Environment |
| Dimensions | 1024×1024px (Master Tier 1 Card/Banner Texture) |
| Format | PNG (RGB) |
| Naming | `assets/game/ui_club_lounge_banner_01.png` |
| Texture Res | 1024px — matches Art Bible §8 Tier 1 |

**Visual Description:**
따뜻한 오전 햇살이 스며드는 한국형 원목 클럽하우스 테이블을 위에서 내려다본 고대비 아케이드 대표 배너입니다. 느티나무 상판 위에 미니 파크골프 그린과 감나무 퍼터, 비자나무 바둑판과 흑백 바둑알, 송학·매화 문양의 상아빛 사천성 원목 패가 정갈하고 큼직하게 배치되어 시니어 클럽 3대 아케이드 종목을 한눈에 전달합니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: 느티나무 원목과 솔잎 그린 위에 상아빛 기물과 황토 주황 포인트를 고대비로 배치
- §2 Mood & Atmosphere: 4800K 오전 자연광과 다실의 품격 있는 환영감
- §4 Color System: Club Heritage Green (`#0E5142`), Zelkova Warm Wood (`#D8B384`), Warm Ivory (`#FCF9F2`), Decisive Terracotta (`#C2410C`)

**Generation Prompt:**
`Stylized tactile 2D game key art illustration for a prestigious Korean senior club arcade game lounge, warm sunlit zelkova hardwood tabletop, showcasing three distinct classic games arranged harmoniously: a vibrant deep forest green (#0E5142) miniature park golf putting green with a wooden brass putter, white golf ball and terracotta orange flag (#C2410C); a traditional kaya wood Go board (#D8B384) with glossy black and white Alkkagi stones colliding with a golden spark; and chunky ivory-topped wooden Sacheonseong mahjong-style tiles (#FCF9F2) carved with red plum blossom and pine-crane motifs. High contrast, crisp clean edges, warm morning sunlight, Nintendo Clubhouse Games 51 inspired craftsmanship, no text, no blurry clutter, no neon colors.`

**Status:** Done (`assets/game/ui_club_lounge_banner_01.png`)

---

## ASSET-002 — 클럽 명인 금장 급수 배지 (Club Master Rank Emblem Badge)

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 1024×1024px Master (Runtime 256×256px / 512×512px) |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/ui_rank_badge_master_01.png` |
| Texture Res | 512px/1024px — matches Art Bible §8 Tier 2 |

**Visual Description:**
시니어 클럽의 최고 영예인 '명인(名人)' 급수를 상징하는 팔각 흑단·느티나무 원목 패와 황동 금장 테두리 배지입니다. 중앙의 짙은 솔잎색 비단 방석 위에 황금빛 소나무·학 문양과 붉은 전각 인장 포인트가 양각되어 있으며, 하단에는 바둑알·파크골프 볼·전통 패를 아우르는 세 개의 금빛 별이 장식되어 있습니다.

**Art Bible Anchors:**
- §3 Shape Language: 모따기된 팔각 원목 패와 원형 황동 메달리온의 결합, 2~3px 고대비 외곽 베벨
- §4 Color System: Master Brass Gold (`#F0BF4F`), Club Heritage Green (`#0E5142`), Deep Walnut (`#6E4228`), Decisive Terracotta (`#C2410C`)

**Generation Prompt:**
`Game UI rank emblem icon on a transparent background, octagonal carved dark walnut and zelkova wood plaque framed with brushed brass gold (#F0BF4F) and deep forest green (#0E5142) enamel center, featuring an embossed golden pine tree and crane crest, three golden stars at the bottom, and a small traditional red seal stamp accent (#C2410C). Bold readable silhouette at thumbnail size, tactile hand-crafted 2D game art style, crisp bevel highlights, isolated on transparent background, no photorealistic noise, no English letters.`

**Status:** Done (`assets/game/ui_rank_badge_master_01.png`)

---

## ASSET-003 — 일일 클럽 개근 낙관 도장 (Daily Routine Red Seal Stamp)

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 256×256px |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/ui_daily_seal_stamp_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
오늘의 3종 클럽 일과를 완수했을 때 한지 스탬프 보드에 묵직하게 찍히는 정사각형 모따기 전통 낙관 도장입니다. 진한 황토 주황·단청 적색(`#C2410C` / `#A83B35`) 인주 질감에 상아빛 음각으로 소나무 심볼과 체크 문양이 선명하게 드러납니다.

**Art Bible Anchors:**
- §3 Shape Language: Radius 10px의 단정한 정방형 인장 실루엣
- §4 Color System: Decisive Terracotta (`#C2410C`) + Warm Ivory (`#FCF9F2`) 이중 부호화

**Generation Prompt:**
`Traditional Korean square red ink seal stamp (Nakgwan) game UI icon on transparent background, rich vermilion terracotta red ink (#C2410C) with subtle hand-stamped paper grain texture, clean ivory negative-space engraving of a pine leaf and check mark inside a thick rounded square border, high contrast, crisp edges, isolated.`

**Status:** Needed

---

## ASSET-004 — 3대 종목 원목 액자 카드 아이콘 세트 (Arcade Mode Frame Icons)

| Field | Value |
|-------|-------|
| Category | UI |
| Dimensions | 512×512px (3-icon sheet: 파크골프 / 알까기 / 사천성) |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/ui_mode_card_icons_01.png` |
| Texture Res | 512px — matches Art Bible §8 Tier 2 |

**Visual Description:**
클럽 라운지 메인 화면의 3대 종목 진입 카드 좌측에 배치되는 원목 액자형 아이콘 3종입니다. 각각 (1) 주황 깃대와 파크골프 볼, (2) 맞부딪히는 흑석과 백석, (3) 짝맞춰 빛나는 매화·송학 사천성 패 두 장을 56dp 축소 시에도 즉시 식별되도록 굵은 실루엣으로 표현합니다.

**Art Bible Anchors:**
- §3 Shape Language: 원형 기물과 둥근 사각 패의 명확한 실루엣 대비
- §7 UI/HUD Visual Direction: 56dp 이상 터치 카드 내 즉각적 시각 인지 지원

**Generation Prompt:**
`Set of 3 stylized 2D game mode icons in rounded walnut wood frames on transparent background: (1) park golf white ball next to an orange flag on deep green turf, (2) glossy black and white Go stones colliding with a golden ring, (3) two ivory wooden mahjong-style tiles with red plum blossom motifs. High contrast, thick bevels, senior-friendly readability, clean vector-painted hybrid style.`

**Status:** Needed

---

## ASSET-005 — 승급 한지 금박 꽃가루 VFX (Promotion Gold Leaf Confetti VFX)

| Field | Value |
|-------|-------|
| Category | VFX |
| Dimensions | 256×256px (4-frame particle atlas) |
| Format | PNG (RGBA 투명 배경) |
| Naming | `assets/game/vfx_promotion_gold_leaf_01.png` |
| Texture Res | 256px — matches Art Bible §8 Tier 3 |

**Visual Description:**
급수 승급 모달과 3성 클리어 시 600ms 동안 부드럽게 흩날리는 금박 조각과 상아빛 한지 꽃잎 파티클 스프라이트 시트입니다. 텍스트 가독성을 해치지 않도록 외곽으로 확산된 뒤 빠르게 페이드아웃됩니다.

**Art Bible Anchors:**
- §1 Visual Identity Statement: Principle 3 — 연출은 600ms 이내로 제한하고 텍스트 가독성 우선
- §4 Color System: Master Brass Gold (`#F0BF4F`) & Warm Ivory (`#FCF9F2`)

**Generation Prompt:**
`2D game VFX sprite sheet of 4 minimalist golden brass leaf flakes (#F0BF4F) and warm ivory hanji paper petals (#FCF9F2) on transparent background, clean geometric shapes with soft warm glow, dignified celebratory style, no neon sparkles.`

**Status:** Needed

---

## ASSET-006 — 클럽하우스 다실 라운지 BGM & 승급 풍경음 (Lounge Audio Suite)

| Field | Value |
|-------|-------|
| Category | Audio (Music / SFX) |
| Dimensions | BGM 60s Loop / SFX 1.2s One-shot |
| Format | M4A / WAV (44.1kHz, 16-bit) |
| Naming | `bgm_club_lounge_morning_01.m4a`, `sfx_rank_promotion_chime_01.wav` |
| Texture Res | N/A (Audio Asset) |

**Visual / Sonic Description:**
오전 햇살이 드는 원목 클럽하우스의 여유로움을 담은 어쿠스틱 기타와 12현 가야금 중심의 따뜻한 미디엄 템포(88 BPM) 루프 BGM입니다. 승급 효과음은 맑은 황동 풍경(Wind Chime) 소리와 단단한 원목 명패가 놓이는 소리를 결합해 자부심을 전달합니다.

**Art Bible Anchors:**
- §2 Mood & Atmosphere: 클럽 라운지의 Contemplative & Welcoming 정서 및 승급 시 Celebratory Dignity 구현

**Generation Prompt:**
*(Audio Asset — Description Only: Warm acoustic guitar and gentle Korean gayageum duet at 88 BPM, sunny morning clubhouse ambiance, paired with a crisp wooden plaque clack and resonant brass wind chime for rank promotion.)*

**Status:** Needed
