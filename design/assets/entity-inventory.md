# Visual Entity & Screen Inventory — 시니어 클럽: 아케이드 라운지

> Generated: 2026-11-03
> Sources: `design/gdd/game-concept.md`, `design/gdd/systems-index.md`, `design/gdd/club-lounge-progression.md`, `design/gdd/park-golf-arcade.md`, `design/gdd/alkkagi-board.md`, `design/gdd/sacheonseong-tiles.md`, `design/art/art-bible.md`

## Entities

| # | Asset ID | Name | Type | Description | Source | Status |
|---|----------|------|------|-------------|--------|--------|
| 1 | ASSET-001 | 클럽 라운지 히어로 배너 | UI / Environment | 원목 클럽하우스 테이블과 파크골프·알까기·사천성 기물이 조화된 메인 배너 (`assets/game/ui_club_lounge_banner_01.png`) | `club-lounge-progression.md` | Done |
| 2 | ASSET-002 | 클럽 명인 금장 급수 배지 | UI / Item | 18급~명인 승급 체계를 상징하는 흑단·황동·금장 명패 및 인장 배지 (`assets/game/ui_rank_badge_master_01.png`) | `club-lounge-progression.md` | Done |
| 3 | ASSET-003 | 일일 클럽 개근 낙관 도장 | UI | 오늘의 3종 일과 완료 시 찍히는 붉은 전각 인주 도장 | `club-lounge-progression.md` | Specced |
| 4 | ASSET-004 | 3대 종목 원목 액자 카드 아이콘 | UI | 파크골프·알까기·사천성 종목 진입 카드용 고대비 심볼 세트 | `club-lounge-progression.md` | Specced |
| 5 | ASSET-005 | 승급 한지 금박 꽃가루 VFX | VFX | 급수 승급 및 3성 달성 시 흩날리는 금박·한지 파티클 | `club-lounge-progression.md` | Specced |
| 6 | ASSET-007 | 파크골프 탑다운 그린 & 페어웨이 보드 | Environment | 2톤 잔디 페어웨이, 느티나무 펜스, 모래 벙커, 홀컵이 포함된 탑다운 코스 보드 (`assets/game/env_parkgolf_green_board_01.png`) | `park-golf-arcade.md` | Done |
| 7 | ASSET-008 | 파크골프 원목 퍼터·볼·깃대 세트 | Sprite / Item | 감나무 황동 헤드 퍼터, 고시인성 화이트/옐로우 볼, 주황 번호 깃대 스프라이트 (`assets/game/spr_parkgolf_club_ball_set_01.png`) | `park-golf-arcade.md` | Done |
| 8 | ASSET-009 | 파크골프 조준 점선 궤적 & 경사 화살표 | UI / HUD | 색각 이상 대응 이중 윤곽 점선 궤적 및 1~3단 갈매기 경사 화살표 | `park-golf-arcade.md` | Specced |
| 9 | ASSET-010 | 파크골프 원목 게이트 & 통나무 범퍼 | Environment / Prop | 쿠션 반사 샷과 통과 기믹을 위한 원목 코스 구조물 | `park-golf-arcade.md` | Specced |
| 10 | ASSET-011 | 파크골프 홀인 황금 링 & 타격 스파크 | VFX | 퍼터 타격 임팩트 및 홀컵 골인 시 퍼지는 링 이펙트 | `park-golf-arcade.md` | Specced |
| 11 | ASSET-013 | 알까기 비자나무 정석 바둑판 보드 | Environment | 선명한 19줄 먹선 격자, 화점, 원목 단차가 살아있는 비자나무 보드 (`assets/game/env_alkkagi_wood_board_01.png`) | `alkkagi-board.md` | Done |
| 12 | ASSET-014 | 알까기 흑요석 흑석 & 백합조개 백석 세트 | Sprite / Item | 음각/양각 보조 문양이 새겨진 고대비 흑석·백석 및 선택 링 | `alkkagi-board.md` | Specced |
| 13 | ASSET-015 | 알까기 활시위 파워 게이지 & 충돌 예측 링 | UI / HUD | 드래그 길이에 비례하는 탄성 게이지와 1차 충돌 지점 가이드 | `alkkagi-board.md` | Specced |
| 14 | ASSET-016 | 알까기 원목 문진 & 다기 받침 장애물 | Environment / Prop | 퍼즐 스테이지용 고정/반사 기믹 프롭 | `alkkagi-board.md` | Specced |
| 15 | ASSET-017 | 알까기 일석이조 충격파 링 & 족자 배너 | VFX / UI | 바둑알 충돌 스파크와 다중 격파 시 등장하는 족자 연출 | `alkkagi-board.md` | Specced |
| 16 | ASSET-019 | 전통 패 사천성 원목·상아 타일 세트 | Sprite / Item | 송학·매화·단풍·보름달·청자·거북 등 전통 길상 문양과 한자 각인이 들어간 고대비 패 시트 (`assets/game/spr_sacheonseong_tile_set_01.png`) | `sacheonseong-tiles.md` | Done |
| 17 | ASSET-020 | 사천성 솔잎색 다포(茶布) 보드 매트 | Environment | 상아빛 패를 돋보이게 받쳐주는 짙은 솔잎색 직조 매트와 원목 프레임 | `sacheonseong-tiles.md` | Specced |
| 18 | ASSET-021 | 사천성 2회 굴절 황금 연결 광선 | VFX / HUD | 짝맞춤 성공 시 두 패 사이를 잇는 직각 금빛·주황 광선 | `sacheonseong-tiles.md` | Specced |
| 19 | ASSET-022 | 사천성 황동 돋보기 힌트 & 패 섞기 아이콘 | UI | 56dp 하단 보조 버튼용 고대비 도구 아이콘 2종 | `sacheonseong-tiles.md` | Specced |
| 20 | ASSET-023 | 사천성 매화잎·솔잎 매칭 스파크 | VFX | 패 소거 시 경쾌하게 흩어지는 전통 자연 모티프 파티클 | `sacheonseong-tiles.md` | Specced |

## UI Screens

| # | Screen Name | Description | Source | Status |
|---|-------------|-------------|--------|--------|
| 1 | 클럽 라운지 홈 (Club Lounge Hub) | 급수 명패, 이어하기 배너, 3대 종목 대형 카드, 일일 3종 스탬프 보드 | `club-lounge-progression.md` | Specced |
| 2 | 파크골프 아케이드 플레이 화면 | 상단 홀/타수 바, 중앙 탑다운 그린 보드, 하단 미세 조준 컨트롤 | `park-golf-arcade.md` | Specced |
| 3 | 알까기 보드 대전 화면 | 상단 피아 남은 알 비교판, 중앙 비자나무 바둑판, 하단 알 전환 컨트롤 | `alkkagi-board.md` | Specced |
| 4 | 전통 패 사천성 플레이 화면 | 상단 스테이지/남은 패/콤보 바, 중앙 6×8 다포 매트 그리드, 하단 힌트/섞기 바 | `sacheonseong-tiles.md` | Specced |
| 5 | 대국 결과 및 급수 승급 모달 | 획득 별점(1~3성), CP 정산, 낙관 도장 날인, 다음 스테이지/재도전 대형 버튼 | `club-lounge-progression.md` | Specced |
| 6 | 명예 다실 & 장비 보관함 | 해금된 퍼터·바둑판·사천성 패 스킨 장착 및 급수 연혁 열람 | `club-lounge-progression.md` | Specced |

## HUD Elements

| # | Element | Description | Source | Status |
|---|---------|-------------|--------|--------|
| 1 | 급수 명패 & CP 진행 바 | 상단 고정 20단계 급수 배지 및 tabular-nums 점수 표시기 | `club-lounge-progression.md` | Specced |
| 2 | 파크골프 조준 점선 & 3단 파워 게이지 | 당기기 길이에 따른 1~3단 눈금 및 반사 가이드라인 (`ASSET-009`) | `park-golf-arcade.md` | Specced |
| 3 | 알까기 활시위 게이지 & 차례 목패 배너 | 탄성 조준 게이지(`ASSET-015`) 및 '내 차례' 안내 배너 | `alkkagi-board.md` | Specced |
| 4 | 사천성 연속 콤보 인장 & 보조 도구 바 | 연타 콤보 카운터 및 56dp 돋보기/패섞기 버튼(`ASSET-022`) | `sacheonseong-tiles.md` | Specced |

## Audio

| # | Asset ID | Name | Type (SFX / Music / Ambient) | Description | Source | Status |
|---|----------|------|------------------------------|-------------|--------|--------|
| 1 | ASSET-006 | 클럽하우스 다실 라운지 BGM & 승급 풍경음 | Music / SFX | 어쿠스틱 기타·가야금 선율의 편안한 라운지 배경음 및 명패 승급 화음 | `club-lounge-progression.md` | Specced |
| 2 | ASSET-012 | 파크골프 감나무 퍼터 타구음 & 홀컵 컵인 SFX | SFX / Ambient | 단단한 원목 헤드 임팩트("딱!")와 홀컵 골인("달그락-통!") 효과음 | `park-golf-arcade.md` | Specced |
| 3 | ASSET-018 | 알까기 흑백 바둑알 충돌음 & 장외 낙하 SFX | SFX | 청아한 바둑알 충돌음("따닥!")과 나무 상판 낙하 효과음 | `alkkagi-board.md` | Specced |
| 4 | ASSET-024 | 사천성 원목 패 맞춤음 & 가야금 콤보 음계 SFX | SFX | 경쾌한 대나무/원목 패 부딪침("착-딱!")과 연타 상승 음계 | `sacheonseong-tiles.md` | Specced |
