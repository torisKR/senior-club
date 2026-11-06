# Asset Specs — system: rpg-village (청솔 시니어 마을)

> **Source**: `design/gdd/game-concept.md`, `design/story/rpg-story-arc.md`
> **Art Bible**: `design/art/art-bible.md`
> **Generated**: 2026-11-04
> **Tooling**: `~/tools/sprite-gen` (aldegad/sprite-gen, Codex `image_gen` provider) + deterministic `cutout` (magenta chroma) · masters at `assets/game/rpg/` (≤512px) · runtime copies at `apps/mobile/assets/game/rpg/` (tiles/props ≤256px, buildings 512px, sprites 128px cells)
> **Style Rule**: 레트로 픽셀아트 통일. 따뜻한 솔잎 그린·원목·상아 팔레트, 인물은 16-bit 청키 도트, 에셋 간 팔레트/외곽선 굵기 일치.
> **Status**: 전부 생성 완료 · 원본 1024px+는 `~/tools/asset-runs/masters-original/` 보관(레포 미포함)

---

## 주인공 (player_elder) — 4방향 × idle/walk 아틀라스

| Field | Value |
|-------|-------|
| Category | Sprite / Animation |
| Runtime | `apps/mobile/assets/game/rpg/sprites/player_<dir>_<state>_<0-3>.png` (128×128 RGBA) |
| Directions | down(정면) / side(우향) / up(배면) · left = side의 런타임 미러(`scaleX: -1`) |
| Frames | idle 4f @ 260ms · walk 4f @ 130ms · loop |
| Pipeline | `gen`(베이스) → `prepare --directions down,side,up --mirror left=side --cell-size 128` → `gen-set`(방향 앵커 3 + walk 3) → `extract --states …` (pixel_unfake 미적용, kcentroid) · 미러 방향 미생성 |

**Base prompt (codex, `--transparent` → `player_base_down.png`):**
`True pixel art, chunky 16-bit style, full body standing pose, front view, facing viewer. A cheerful healthy Korean senior man in his 60s, short grey hair under a beige hunting cap, warm smile, beige pique polo shirt, dark teal slacks, white sneakers. Clean 1px dark outlines, warm saturated palette matching a sunny Korean traditional village game, crisp hard pixel edges, no anti-aliasing, no text, no watermark, transparent background.`

---

## NPC 5명 — 맵 스프라이트 + 대화 초상화

| NPC | 지도 스프라이트 | 초상화 | 외모 |
|-----|----------------|--------|------|
| 김 이장 (chief) | `sprites/npc_chief.png` | `portraits/chief.png` | 70대 마을 이장, 네이비 조끼, 베이지 작업 바지, 흰 파나마 햇, 환한 미소 |
| 박 캡틴 (captain) | `sprites/npc_captain.png` | `portraits/captain.png` | 60대 파크골프 반장, 흰 피크 캡, 카키 폴로, 오른손 우드 퍼터 |
| 최 사범 (choi) | `sprites/npc_choi.png` | `portraits/choi.png` | 60대 Go 사범, 검은테 안경, 진남색 당의(唐衣), 차분한 미소 |
| 이 다도명인 (tea) | `sprites/npc_tea.png` | `portraits/tea.png` | 60대 다실 안주인, 연녹색 저고리(매화 자수), 쪽머리+은비녀, 찻잔 |
| 강 원장 (herbalist) | `sprites/npc_herbalist.png` | `portraits/herbalist.png` | 50대 한약방 원장, 둥근 눈빛 안경, 베이지 린넨 두루마기, 약재 주머니 |

인물 베이스 프롬프트는 player_base_down.png를 `--ref`로 첨부해 도트 굵기/팔레트를 잠갔고, 배경은 `#FF00FF` 단색 → `sprite-gen cutout --key magenta`로 제거했다. 최 사범 1차 생성분은 배경 풍경이 함께 그려져 재생성했다.

## 시설/건물 5종 — 정면 픽셀 스프라이트

| 건물 | 파일 | 묘사 |
|------|------|------|
| 마을회관 | `buildings/club_hall.png` | 대청(大廳)이 열린 큰 한옥, 검은 기와·나무 기둥, 석축 기단 |
| 파크골프장 | `buildings/parkgolf.png` | 목조 파빌리언 + 붉은 깃대 + 퍼팅 그린 |
| 송학기원 | `buildings/alkkagi.png` | 기와 한옥 Go 대국실, 입구 소나무 |
| 매화다실 | `buildings/sacheonseong.png` | 낮은 찻집, 원형 종이등·매화 가지, 도자기 화분 |
| 청솔 한약방 | `buildings/herbal.png` | 벽돌+목재 한약방, 처마 밑 약초 건조, 옹기 단지 |

## 타일/프롭 8종 — 48dp 셀 렌더링

| 파일 | 용도 |
|------|------|
| `tiles/grass_01.png` | 기본 잔디 (불투명 풀블리드) |
| `tiles/path_01.png` | 돌담길/남북로 (불투명 풀블리드) |
| `tiles/water_01.png` | 연못 (불투명 풀블리드, 차단) |
| `tiles/fence_01.png` | 돌담(울타리) 세그먼트, 마젠타→컷아웃 |
| `tiles/pine_01.png` | 소나무 (차단 장식) |
| `tiles/cherry_01.png` | 벚(매화)나무 (차단 장식) |
| `tiles/lantern_01.png` | 석등 (차단 장식) |
| `tiles/flower_01.png` | 꽃밭 (차단 장식) |

## 인게임 HUD/VFX/일일 도장 (ASSET-003~023 잔여분)

| Asset ID | 파일 | 설명 |
|----------|------|------|
| ASSET-003 | `ui/ui_daily_seal_stamp_01.png` | 일일 3종 달성 낙관 도장 (인주 질감) |
| ASSET-004a/b/c | `ui/ui_mode_icon_parkgolf_01.png` · `ui/ui_mode_icon_alkkagi_01.png` · `ui/ui_mode_icon_sacheonseong_01.png` | 3대 종목 액자 아이콘 (단일 시트 대신 RN require 단위로 분리) |
| ASSET-005 | `vfx/vfx_promotion_gold_leaf_01.png` | 승급 금박 잎 4조각 (단일 스프라이트, 600ms 한도) |
| ASSET-009 | `ui/ui_parkgolf_aim_slope_01.png` | 점선 궤적+갈매기 경사 오버레이 |
| ASSET-010 | `spr_parkgolf_obstacles_01.png` | 원목 게이트 + 통나무 범퍼 (1장에 2프롭) |
| ASSET-011 | `vfx/vfx_parkgolf_holein_ring_01.png` | 홀인 황금 링 |
| ASSET-015 | `ui/ui_alkkagi_flick_gauge_01.png` | 활시위 3단 파워 게이지 |
| ASSET-016 | `spr_alkkagi_obstacles_01.png` | 문진 + 청자 찻종 범퍼 |
| ASSET-017 | `vfx/vfx_alkkagi_impact_ring_01.png` | 일석이조 충격파 링 |
| ASSET-020 | `env/env_sacheonseong_mat_board_01.png` | 솔잎색 다포 매트 (탑다운, 풀블리드) |
| ASSET-021 | `vfx/vfx_sacheonseong_match_line_01.png` | 2회 굴절 황금 광선 |
| ASSET-022a/b | `ui/ui_icon_magnifier_01.png` · `ui/ui_icon_shuffle_01.png` | 돋보기/패섞기 아이콘 |
| ASSET-023 | `vfx/vfx_sacheonseong_tile_pop_01.png` | 매화잎·솔잎 소거 파티클 |

ASSET-014(알까기 흑/백석)는 `apps/mobile/assets/game/stones/`, ASSET-019(사천성 패)는 `apps/mobile/assets/game/tiles/`에 이미 존재 — 매니페스트 Done 처리.

## 참고

- 미제작 오디오 4종(ASSET-006/012/018/024)은 범위 제외 (코드에서 미참조).
- 원본(레포 미포함): `~/tools/asset-runs/masters-original/` · 생성 로그: `~/tools/asset-runs/senior_club/`
- 맵 막힘/배치 규칙: `design/story/rpg-story-arc.md` 및 `apps/mobile/src/rpg/rpg-logic.ts`의 `VILLAGE_BUILDINGS` 참조.
