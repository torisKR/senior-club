# 픽셀 아트 파이프라인 — pixelfx × sprite-gen

> **Status**: APPROVED · 2026-11-05
> **Art Bible**: `design/art/art-bible.md` §10 (픽셀 아트 전환 부록)
> **Runtime**: Expo SDK 57 · React Native 0.86 · expo-image · expo-sqlite
> **Reproduce**: `node tools/pixel-art/build.mjs`

이 문서는 "시니어 클럽: 아케이드 라운지"를 **진짜 픽셀 아트 게임**으로 만든 자산 파이프라인을 설명합니다.
핵심은 두 오픈소스 도구를 각자의 역할에 맞게 쓰는 것입니다.

| 도구 | 저장소 | 이 프로젝트에서의 역할 |
|------|--------|------------------------|
| **pixelfx** | `patch-gg/pixelfx` (MIT) | 232개 픽셀 이펙트 라이브러리. 게임에 필요한 5종을 골라 **스프라이트시트로 굽고** RN에서 재생 |
| **sprite-gen** | `aldegad/sprite-gen` (Apache-2.0) | 완성된 아트를 다루는 독립 도구군. **recolor로 급수별 복장 변형**, 아틀라스/프레임 계약 검증 |

---

## 1. 왜 픽셀 그리드로 다시 구웠나

기존 RPG 마을 에셋은 512~1024px 일러스트를 그대로 축소해 쓰고 있었습니다.
안티에일리어싱과 그라데이션이 남아 있어 화면에서는 "부드러운 카툰"으로 보였고,
pixelfx 이펙트(1px 단위 도트)와 섞으면 밀도가 어긋납니다.

그래서 **월드 오브젝트는 1 아트픽셀 = 1dp** 규칙으로 다시 구웠습니다.

| 자산군 | 그리드(아트픽셀) | 런타임 PNG | 표시 크기 |
|--------|------------------|------------|-----------|
| 마을 타일 (잔디·길·물·나무 등) | 48 × 48 | 144 × 144 | 48dp |
| 건물 (3×2 타일) | 144 × 96 | 432 × 288 | 144 × 96dp |
| 주인공 프레임 | 48 × 88 | 144 × 264 | 88dp 높이 |
| NPC | 44 × 80 | 132 × 240 | 80dp 높이 |
| 초상화 | 88 × 88 | 264 × 264 | 88dp |
| 아케이드 보드 | 220 × 330 등 | 660 × 990 등 | 화면 폭 |
| 사천성 패 | 36 × 36 | 108 × 108 | 36dp |

**3배 업스케일 + 최근접 이웃**으로 저장하는 이유: 3x DPI 기기에서 텍스처 1px이
기기 1px과 정확히 대응해 계단이 뭉개지지 않습니다. 2x 기기에서는 살짝 줄어들 뿐입니다.

### 변환 절차 (`pixelize.mjs`)

1. **프리멀티플라이드 박스 다운샘플** — 알파 경계의 검은 테두리 방지
2. **알파 임계값(110)** — 반투명 가장자리를 잘라 계단형 실루엣 확정
3. **콘텐츠 경계 크롭 + 하단 정렬** — 128px 캔버스 안에 작게 들어 있던 캐릭터를 프레임에 꽉 채움
4. **그룹 단위 median-cut 팔레트** — 같은 그룹(예: 주인공 24프레임)이 팔레트를 공유해 프레임 간 색 튐 방지
5. **정수배 최근접 업스케일** (×3)

타일 중 잔디·물·소나무는 원본이 균일 노이즈/저대비라 다운샘플이 "노이즈"로 뭉개집니다.
이 3종만 `tiles.mjs`에서 **48×48 그리드에 직접 절차 생성**하고, 모든 좌표를 모듈러로 감싸
이음새 없는 반복 타일로 만듭니다.

---

## 2. pixelfx — 이펙트를 게임 자산으로

pixelfx는 브라우저 Canvas/ImageData용 순수 JS라 React Native에서 직접 돌릴 수 없습니다.
대신 공식 익스포터(`tools/render.mjs --sheet`)로 **PNG 스프라이트시트 + Aseprite형 JSON**을 굽고,
RN에서는 한 장의 이미지를 프레임 크기로 잘라 translate 하는 방식으로 재생합니다.

### 채택한 이펙트

| 게임 이름 | pixelfx 원본 | 쓰이는 곳 | 팔레트 |
|-----------|--------------|-----------|--------|
| `promotion` | `ui/confetti` | 급수 승급·스테이지 클리어·명인전당 | heritage (금빛·황토·상아) |
| `holein` | `pickups/collect-burst` | 파크골프 홀인 | brass (금빛) |
| `impact` | `impacts/crit-hit` | 알까기 타격 지점 | warm (황토·금빛) |
| `match` | `impacts/hit-spark` | 사천성 짝맞춤·일석이조 배너 | celadon (청자) |
| `heal` | `nature/healing-bloom` | 아침 체조·약 복용 회복 | bloom (솔잎·금빛) |

- 팔레트는 `pixelfx`의 dark→bright 램프 규약에 맞춰 **아트 바이블 색만으로** 재구성했습니다.
  (기본 마젠타/무지개 팔레트는 시니어 클럽의 원목·청자 톤과 충돌합니다.)
- `impact`·`match`·`holein`·`heal`은 프레임 하단의 지면선을 잘라(`cropBottom`) UI 위에 얹어도
  바닥이 생기지 않게 했습니다.
- 시드·fps를 고정해 **같은 입력 → 같은 바이트**가 나옵니다.
- `holy/heal`은 원본에 회색 인물 실루엣이 함께 그려져 마을 캐릭터 위에 겹칠 수 없어, 인물이 없는 `nature/healing-bloom`으로 대체했습니다.

### 런타임 재생기

`apps/mobile/src/fx/pixel-fx.tsx`

- `PixelFx`는 `FX_MANIFEST`(자동 생성)에서 프레임 수·fps·열 수를 읽습니다.
- 시트 전체를 한 장으로 올리고 `overflow: hidden` 창 안에서 `translateX/Y`로 칸을 넘깁니다.
- 일회 재생은 마지막 프레임에서 멈추고 `onDone`을 부릅니다. 루프는 계속 돕니다.
- 타이밍 계산은 `fx-timing.ts`의 순수 함수로 분리해 단위 테스트합니다(`fx-timing.test.ts`).

> 메모리: 이펙트 시트는 1x로 굽고 화면에서 1dp/아트픽셀로 그립니다.
> 3x 기기에서는 3배 업스케일이 되지만, 이펙트는 대부분 발광·연기라
> 계단보다 부드러운 번짐이 오히려 자연스럽습니다. 캐릭터·타일은 3x로 구워 1:1입니다.

---

## 3. sprite-gen — 완성된 아트를 다루는 도구

sprite-gen의 생성 파이프라인(`gen`)은 이미지 모델 자격증명이 필요하므로 쓰지 않고,
**이미 있는 PNG를 다루는 독립 도구**를 사용했습니다.

### 3.1 급수별 복장 변형 (`recolor`)

`build-player-tiers.mjs`가 주인공 24프레임을 6×4 아틀라스로 묶고,
sprite-gen `recolor`로 팔레트 스왑을 굽습니다.

| 단계 | 조건 | 셔츠 | 바지 |
|------|------|------|------|
| `tier1` 입문 | CP < 900 | 베이지 `#F5D5A0` | 청록 `#235752` |
| `tier2` 유단 | CP ≥ 900 | 청자 `#CFE6DD` | 솔잎 `#0E5142` |
| `tier3` 명인 | CP ≥ 3500 | 상아 `#FCF9F2` | 먹색 `#2C3138` |

- `match: "exact"` — 양자화된 팔레트 덕분에 정확 일치만으로 안전하게 치환됩니다.
- bake 리포트(`recolor.report.json`)에서 `unused_sources: 0`을 확인했습니다.
- 변형 시트는 다시 프레임별 PNG로 풀어 `pixel/player_tier2|3/`에 두고,
  `playerTierForCp(cp)`가 마을 맵에서 복장을 고릅니다.

### 3.2 그 밖에 쓴/검토한 도구

| 도구 | 결과 | 판단 |
|------|------|------|
| `shadow` | 발밑 투영 그림자 PNG 생성 | **미채택(측정 근거)**: `--squash 0.3 --blur 6`으로 눌러도 결과가 417×135의 비스듬한 투영 실루엣이라, 48dp 탑다운 타일 위에 발밑 타원으로 앉지 않음. 지면 접지는 캐릭터 하단 정렬(1px 여백)로 처리 |
| `background-tile` | 반복 배경 퀼팅 | 잔디·물은 절차 생성이 더 균일해 미채택 |
| `slice-sheet` / `unpack-atlas` | 그리드 시트 분해 | 이번 자산은 개별 PNG라 불필요 |
| `export-aseprite` | Aseprite JSON | 아틀라스를 쓰는 엔진 이관용 후속 훅으로 남김 |

---

## 4. 재현과 검증

```bash
# 전체 재굽기 (pixelize → tiles → tiers → fx → preview)
node tools/pixel-art/build.mjs

# 실행 환경 검증 (실제 RN 컴포넌트를 react-native-web으로 렌더)
node tools/pixel-art/runtime-preview/build.mjs
python3 -m http.server 8101 --directory tools/pixel-art/runtime-preview/dist
node tools/pixel-art/runtime-preview/check.cjs

# 일부만
node tools/pixel-art/pixelize.mjs
node tools/pixel-art/render-fx.mjs promotion
```

산출물:

- `apps/mobile/assets/game/rpg/pixel/` — 타일·건물·캐릭터·초상화·아케이드 보드·패
- `apps/mobile/assets/game/rpg/pixel/player_tier{2,3}/` — 급수별 복장
- `apps/mobile/assets/game/rpg/fx/` — pixelfx 스프라이트시트
- `apps/mobile/src/fx/fx-manifest.ts` — 자동 생성 매니페스트
- `design/previews/pixel-village-preview.png` — 합성 검증 이미지

### 검증 결과 (2026-11-05)

| 항목 | 결과 |
|------|------|
| `tsc --noEmit` | 신규 파일 오류 0. 기존 `@types/react-dom` 누락 7건은 이번 변경과 무관한 기존 실패 |
| `eslint .` | 오류 0 |
| `vitest` | 68파일 · 582테스트 통과 (`fx-timing` 9 · `onboarding` 12 · `arcade-defaults` 3 · `back-exit` 5 · `bond-logic` 18 포함) |
| Android 번들 (`expo export --platform android`) | 성공. 신규 PNG 126개 중 **125개 번들 포함**(md5 대조). 1개(`ui/banner_lounge.png`)는 `ClubLoungeScreen`이 라우터에 연결되지 않은 레거시 화면 자산이라 번들에서 제외됨 |
| 시각 검증 | `pixel-village-preview.png`, `pixel-fx-sheet.png` 합성 이미지 |
| **실행 환경 검증** | 실제 `PixelVillageMap`·`PixelFx` 컴포넌트를 react-native-web으로 브라우저에서 실행: 이미지 273개 로드·깨짐 0, 3회 스크린샷 해시 상이(애니메이션 확인), 콘솔 오류 0. 캡처: `design/previews/runtime-village-fx.png` |
| **온보딩 상호작용 검증** | 프롤로그 3장(빈집→첫 인사→18급) 노출 확인 → "마을로 들어가기" 클릭 → 튜토리얼 1/3 표시 → "건너뛰기"로 사라짐. 콘솔 오류 0. 캡처: `design/previews/runtime-prologue.png`, `runtime-tutorial.png` |

검증 한계(정직하게):

- **Android 실기기/에뮬레이터 캡처는 하지 못했습니다.** 이 환경에는 연결된 기기가 없습니다.
  대신 실제 RN 컴포넌트를 react-native-web으로 실행한 브라우저 캡처와, `expo export --platform android`
  번들 성공·자산 포함 여부(md5)로 대체했습니다.
- Expo 웹(`expo start --web`)은 `expo-sqlite`의 워커 청크 생성 실패로 앱 전체를 띄울 수 없습니다
  (모바일 전용 네이티브 의존). 그래서 마을 맵·이펙트 컴포넌트만 스토어 목과 함께 렌더하는
  하네스를 썼습니다. 하네스는 `tools/pixel-art/runtime-preview/`에 있습니다.
