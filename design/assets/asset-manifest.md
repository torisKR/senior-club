# Asset Manifest — 시니어 클럽: 아케이드 라운지

> Last updated: 2026-11-04
> Art Bible: `design/art/art-bible.md`
> Specs: `design/assets/specs/` (시스템별 + `rpg-village-assets.md`)

## Progress Summary

| Group | Total | Done | Deferred |
|-------|-------|------|----------|
| 기존 4개 시스템 이미지 에셋 | 20 | 20 | 0 |
| 오디오 (BGM/SFX) | 4 | 0 | 4 (오디오 파이프라인 미구축, 이번 범위 제외) |
| RPG 마을 세트 (신규) | 5 세트 | 5 | 0 |

## Assets by Context

### system: club-lounge-progression
| Asset ID | Name | Category | Status | File / Output Path | Spec File |
|----------|------|----------|--------|--------------------|-----------|
| ASSET-001 | 클럽 라운지 히어로 배너 | UI / Environment | Done | `assets/game/ui_club_lounge_banner_01.png` | `design/assets/specs/club-lounge-progression-assets.md` |
| ASSET-002 | 클럽 명인 금장 급수 배지 | UI | Done | `assets/game/ui_rank_badge_master_01.png` | `design/assets/specs/club-lounge-progression-assets.md` |
| ASSET-003 | 일일 클럽 개근 낙관 도장 | UI | Done | `assets/game/rpg/ui/ui_daily_seal_stamp_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-004 | 3대 종목 원목 액자 카드 아이콘 | UI | Done | `assets/game/rpg/ui/ui_mode_icon_{parkgolf,alkkagi,sacheonseong}_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-005 | 승급 한지 금박 꽃가루 | VFX | Done | `assets/game/rpg/vfx/vfx_promotion_gold_leaf_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-006 | 라운지 BGM & 승급 풍경음 | Audio | Deferred | — (오디오 범위 제외) | — |

### system: park-golf-arcade
| Asset ID | Name | Category | Status | File / Output Path | Spec File |
|----------|------|----------|--------|--------------------|-----------|
| ASSET-007 | 파크골프 탑다운 그린 보드 | Environment | Done | `assets/game/env_parkgolf_green_board_01.png` | `design/assets/specs/park-golf-arcade-assets.md` |
| ASSET-008 | 파크골프 퍼터·볼·깃대 세트 | Sprite / Item | Done | `assets/game/spr_parkgolf_club_ball_set_01.png` | `design/assets/specs/park-golf-arcade-assets.md` |
| ASSET-009 | 조준 점선 궤적 & 경사 화살표 | UI / HUD | Done | `assets/game/rpg/ui/ui_parkgolf_aim_slope_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-010 | 원목 게이트 & 통나무 범퍼 | Environment / Prop | Done | `assets/game/rpg/spr_parkgolf_obstacles_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-011 | 홀인 황금 링 & 타격 스파크 | VFX | Done | `assets/game/rpg/vfx/vfx_parkgolf_holein_ring_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-012 | 퍼터 타구음 & 홀컵 SFX | Audio | Deferred | — (오디오 범위 제외) | — |

### system: alkkagi-board
| Asset ID | Name | Category | Status | File / Output Path | Spec File |
|----------|------|----------|--------|--------------------|-----------|
| ASSET-013 | 알까기 비자나무 바둑판 | Environment | Done | `assets/game/env_alkkagi_wood_board_01.png` | `design/assets/specs/alkkagi-board-assets.md` |
| ASSET-014 | 알까기 흑석 & 백석 세트 | Sprite / Item | Done | `apps/mobile/assets/game/stones/stone_{black,white}.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-015 | 활시위 파워 게이지 | UI / HUD | Done | `assets/game/rpg/ui/ui_alkkagi_flick_gauge_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-016 | 문진 & 다기 받침 장애물 | Environment / Prop | Done | `assets/game/rpg/spr_alkkagi_obstacles_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-017 | 일석이조 충격파 링 | VFX / UI | Done | `assets/game/rpg/vfx/vfx_alkkagi_impact_ring_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-018 | 바둑알 충돌음 & 장외 SFX | Audio | Deferred | — (오디오 범위 제외) | — |

### system: sacheonseong-tiles
| Asset ID | Name | Category | Status | File / Output Path | Spec File |
|----------|------|----------|--------|--------------------|-----------|
| ASSET-019 | 전통 패 타일 세트 | Sprite / Item | Done | `assets/game/spr_sacheonseong_tile_set_01.png` (슬라이스: `apps/mobile/assets/game/tiles/`) | `design/assets/specs/sacheonseong-tiles-assets.md` |
| ASSET-020 | 사천성 솔잎색 다포 매트 | Environment | Done | `assets/game/rpg/env/env_sacheonseong_mat_board_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-021 | 2회 굴절 황금 광선 | VFX / HUD | Done | `assets/game/rpg/vfx/vfx_sacheonseong_match_line_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-022 | 황동 돋보기 & 패섞기 아이콘 | UI | Done | `assets/game/rpg/ui/ui_icon_{magnifier,shuffle}_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-023 | 매화잎·솔잎 매칭 스파크 | VFX | Done | `assets/game/rpg/vfx/vfx_sacheonseong_tile_pop_01.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-024 | 패 맞춤음 & 가야금 콤보 SFX | Audio | Deferred | — (오디오 범위 제외) | — |

### system: rpg-village (2026-11-04, 청솔 시니어 마을)
| Asset ID | Name | Category | Status | File / Output Path | Spec File |
|----------|------|----------|--------|--------------------|-----------|
| ASSET-025 | 주인공 4방향 idle/walk 아틀라스 (24프레임) | Sprite / Animation | Done | `apps/mobile/assets/game/rpg/sprites/player_{down,side,up}_{idle,walk}_{0-3}.png` (128px) | `design/assets/specs/rpg-village-assets.md` |
| ASSET-026 | NPC 맵 스프라이트 5종 | Sprite | Done | `apps/mobile/assets/game/rpg/sprites/npc_{chief,captain,choi,tea,herbalist}.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-027 | NPC 대화 초상화 5종 | UI / Portrait | Done | `apps/mobile/assets/game/rpg/portraits/{chief,captain,choi,tea,herbalist}.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-028 | 시설/건물 5종 (마을회관·파크골프·송학기원·매화다실·한약방) | Environment | Done | `apps/mobile/assets/game/rpg/buildings/{club_hall,parkgolf,alkkagi,sacheonseong,herbal}.png` | `design/assets/specs/rpg-village-assets.md` |
| ASSET-029 | 타일/프롭 8종 (grass·path·water·fence·pine·cherry·lantern·flower) | Environment / Tile | Done | `apps/mobile/assets/game/rpg/tiles/{grass_01,path_01,water_01,fence_01,pine_01,cherry_01,lantern_01,flower_01}.png` | `design/assets/specs/rpg-village-assets.md` |

런타임 참조는 `apps/mobile/src/rpg/rpg-sprites.ts` 레지스트리에 집중되어 있으며, Metro 번들은 Android export로 검증됐다(2026-11-04).

### system: pixel-art (2026-11-05, 픽셀 아트 재굽기)

> 파이프라인: `design/art/pixel-art-pipeline.md` · 재현: `node tools/pixel-art/build.mjs`
> 원본 마스터는 `apps/mobile/assets/game/rpg/`(기존 경로)에 그대로 보존하고, 런타임은 `pixel/` 사본을 씁니다.

| Asset ID | Name | Category | Status | File / Output Path | Spec File |
|----------|------|----------|--------|--------------------|-----------|
| ASSET-030 | 마을 타일 8종 픽셀 그리드(48×48) | Environment / Tile | Done | `apps/mobile/assets/game/rpg/pixel/tiles/*.png` | `design/art/pixel-art-pipeline.md` §1 |
| ASSET-031 | 시설 건물 5종 픽셀화(144×96) | Environment | Done | `apps/mobile/assets/game/rpg/pixel/buildings/*.png` | 〃 |
| ASSET-032 | 주인공 4방향 24프레임 픽셀화(48×88) | Sprite / Animation | Done | `apps/mobile/assets/game/rpg/pixel/player/` | 〃 |
| ASSET-033 | NPC 5종 픽셀화(44×80) | Sprite | Done | `apps/mobile/assets/game/rpg/pixel/npc/` | 〃 |
| ASSET-034 | NPC 초상화 5종 픽셀화(88×88) | UI / Portrait | Done | `apps/mobile/assets/game/rpg/pixel/portraits/` | 〃 |
| ASSET-035 | 아케이드 보드·바둑알·기물 픽셀화 | Environment / Sprite | Done | `apps/mobile/assets/game/rpg/pixel/arcade/` | 〃 |
| ASSET-036 | 사천성 패 8종 픽셀화(36×36) | Sprite / Item | Done | `apps/mobile/assets/game/rpg/pixel/tileset/` | 〃 |
| ASSET-037 | 급수별 복장 변형 2종 (sprite-gen recolor) | Sprite / Animation | Done | `apps/mobile/assets/game/rpg/pixel/player_tier{2,3}/` | `design/art/pixel-art-pipeline.md` §3.1 |
| ASSET-038 | pixelfx 이펙트 5종 스프라이트시트 | VFX | Done | `apps/mobile/assets/game/rpg/fx/{promotion,holein,impact,match,heal}.png` | `design/art/pixel-art-pipeline.md` §2 |
| ASSET-039 | 이펙트 매니페스트(자동 생성) | Config | Done | `apps/mobile/src/fx/fx-manifest.ts` | 〃 |
| ASSET-040 | 픽셀 마을·이펙트 합성 검증 이미지 | Preview | Done | `design/previews/pixel-{village-preview,fx-sheet}.png` | 〃 §4 |
| ASSET-041 | 클럽 UI 픽셀화 (배너·명인 배지·모드 아이콘 3종) | UI | Done | `apps/mobile/assets/game/rpg/pixel/ui/` | 〃 §1 |
| ASSET-042 | 실행 환경 캡처 (PixelVillageMap + PixelFx 5종) | Evidence | Done | `design/previews/runtime-village-fx.png` | `design/art/pixel-art-pipeline.md` §4 |
| ASSET-043 | 프롤로그·튜토리얼 런타임 캡처 | Evidence | Done | `design/previews/runtime-prologue.png`, `runtime-tutorial.png` | `design/story/story-bible.md` §9 |
| ASSET-044 | 안드로이드 종료 확인 다이얼로그 캡처 | Evidence | Done | `design/previews/runtime-exit-dialog.png` | `design/gdd/android-game-plan.md` §8.1 |
| ASSET-045 | 동행 산책·코치 패널 런타임 캡처 | Evidence | Done | `design/previews/runtime-companion-walk.png`, `runtime-coach-panel.png` | `design/story/story-bible.md` §10 |
