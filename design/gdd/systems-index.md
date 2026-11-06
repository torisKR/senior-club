# Systems Index — 시니어 클럽: 아케이드 라운지

> **Source Concept**: `design/gdd/game-concept.md`
> **Art Bible**: `design/art/art-bible.md`
> **Last Updated**: 2026-11-03

## Core Systems Overview

| System ID | System Name | GDD Path | Core Responsibility | Priority |
|-----------|-------------|----------|---------------------|----------|
| SYS-01 | 클럽 라운지 & 급수 성장 (Club Lounge & Progression) | `design/gdd/club-lounge-progression.md` | 메인 허브, 18급→명인 승급, 일일 3종 미션, 로컬 세이브(`expo-sqlite`), 컬렉션 해금. 스토리 아크(6막 승단 서사)는 `design/story/rpg-story-arc.md` 참조 | P0 |
| SYS-02 | 파크골프 아케이드 (Park Golf Arcade) | `design/gdd/park-golf-arcade.md` | 탑다운 퍼팅·어프로치 물리, 경사·바람 가이드, 벙커·연못·원목 게이트 기믹, 홀인/버디 판정 | P0 |
| SYS-03 | 알까기 보드 대전 (Alkkagi Board Battle) | `design/gdd/alkkagi-board.md` | 원목 바둑판 탄성 충돌 물리, AI 급수별 대국, 다중 타격(일석이조)·장외 판정 | P0 |
| SYS-04 | 전통 패 사천성 (Sacheonseong Tile Match) | `design/gdd/sacheonseong-tiles.md` | 전통 문양 원목·상아 타일 배치, ≤2회 굴절 연결 탐색, 돋보기·섞기 보조 아이템, 콤보 정산 | P0 |
| SYS-05 | 첫 실행 온보딩 & 튜토리얼 | `design/story/story-bible.md` §9 · `design/gdd/android-game-plan.md` §9 | 프롤로그 3장(최초 1회) + 이동→체조→파크골프 3단계 배너. 건너뛰기 상시, 실제 행동으로만 진행 | P1 |
| SYS-06 | 안드로이드 앱 게임 기획·UX 기준 | `design/gdd/android-game-plan.md` · `design/design/android-ui-spec.md` | 세로 360×800, 3분 루프, 리텐션·수익화 경계, 터치·상태·모션 규격 | P0 |
| SYS-07 | NPC 유대·동행 산책 | `design/story/story-bible.md` §10 | NPC 5인 유대 0~5단계, 동행 따라오기·말풍선, 하루 1회 산책 보상, 코치 패널 | P1 |

## Cross-System Shared Contracts

- **로컬 영속성 (`expo-sqlite`)**: 모든 종목의 스테이지 별점, 최고 기록, 진행 중인 판 상태(Resume State), 보유 인장, 착용 중인 보드/퍼터/패 스킨은 오프라인 로컬 DB에 즉시 저장합니다.
- **시니어 접근성 계약**: 모든 시스템 화면은 최소 56×56dp 기본 버튼, 48×64dp 이상의 타일/알 터치 영역, Pretendard SemiBold/ExtraBold 고대비 타이포그래피, 색각 이상 보조 기호(문양+상단 각인 병기)를 준수합니다.
- **수익화 및 공정성 경계**: 홈/라운지 하단 배너 광고는 플레이 조작 영역과 완전히 분리하며, `seniorclub.remove_ads`의 유효한 구매 권리가 있으면 배너를 숨깁니다. 과금 요소는 타구 물리·알 질량·타일 배치 확률에 일절 개입하지 않습니다.
- **수익화 후속 제안 (2026-11-06)**: 기존 상품과 실제 권리는 콘솔에서 확인해야 합니다. 새 광고·꾸미기 제안과 코드상의 차이는 `design/gdd/game-monetization-proposal.md`를 참조합니다. 명인 배지 지급은 현재 검증되지 않았습니다.
