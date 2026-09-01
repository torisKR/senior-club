# 이미지 에셋 기록

모든 이미지는 Codex 내장 `imagegen` 모드로 생성했으며, 외부 스톡 이미지를 사용하지 않았다. 기능 아이콘은 작은 크기에서의 선명도와 접근성을 위해 `lucide-react` 벡터 아이콘을 사용하고 항상 텍스트 라벨 또는 접근성 이름을 함께 제공한다.

## 홈 히어로

- 배포 파일: `public/images/club-senior-hero.jpg`
- 생성 원본: `assets/imagegen-source/club-senior-hero.png`
- 용도: 홈 히어로, 성곽길 사진 모임 카드
- 프롬프트:

```text
Use case: photorealistic-natural
Asset type: Senior Club web app home hero image
Primary request: a candid, dignified moment of five Korean adults aged roughly 58 to 72 meeting for a weekend urban nature walk and photography club activity, looking at a simple paper route map together before starting
Scene/backdrop: a leafy Seoul neighborhood trail entrance in early autumn, subtle city context in the distance
Subject: realistically aged Korean women and men in practical, tasteful outdoor clothing; visible natural wrinkles, varied gray and dark hair, relaxed authentic expressions; one person holding a compact camera and another holding the route map
Style/medium: photorealistic editorial lifestyle photography, documentary rather than advertising
Composition/framing: wide landscape hero crop, group placed mostly in the right two-thirds, clean soft-focus negative space on the left for interface copy; waist-up to three-quarter bodies
Lighting/mood: clear soft morning daylight, welcoming and capable, natural color
Color palette: fresh blue-green foliage, muted navy and rust clothing accents, no beige wash
Constraints: no text, no logos, no watermark; hands anatomically plausible; no mobility or medical framing; no exaggerated laughing or staged thumbs-up; do not make subjects look artificially young; no heavy retouching
```

## 브랜드 마크

- 최종 투명 마스터: `assets/brand/senior-club-mark-v2.png`
- 웹 배포 파일: `public/images/senior-club-mark-v2.png`
- 앱 파생 파일: `apps/mobile/assets/images/senior-club-*-v2.png`
- Play 아이콘: `apps/mobile/store-listing/icon-512-v2.png`
- imagegen 크로마 원본: `assets/imagegen-source/senior-club-logo-v2-flat-chroma.png`
- imagegen 알파 제거본: `assets/imagegen-source/senior-club-logo-v2-flat.png`
- 생성 모드: Codex 내장 `imagegen`, 마젠타 크로마 제거, 결정론적 단색·안전영역 파생
- `sprite-gen` 적용 판단: 게임 캐릭터의 애니메이션 atlas를 만드는 파이프라인이라 정적 브랜드
  로고·스플래시에는 적용하지 않았다. 별도 sprite/큐레이션 산출물이 있다고 주장하지 않는다.
- 결정론 빌드: `python3 scripts/build_brand_assets.py`
- 용도: 웹 브랜드 마크, Android 일반/adaptive/monochrome 아이콘, 스플래시, 앱 UI 로고, favicon, Play 아이콘
- 최종 생성 프롬프트:

```text
Use case: logo-brand
Asset type: master symbol for an Android launcher icon, splash screen, website favicon, and Google Play listing
Primary request: Create a distinctive, friendly brand mark for “시니어클럽”, a Korean purpose-driven community where older adults discover people, join activities, and build lasting relationships.
Subject: four simple rounded human/path forms connected into one forward-moving circular loop, with the negative space suggesting a subtle letter S without drawing a literal letter; the symbol should express purpose → people → activity → relationship.
Style/medium: crisp flat geometric vector-friendly logo mark, minimal, contemporary, warm and trustworthy, highly legible at 48 px.
Composition/framing: one centered standalone symbol, balanced square silhouette, generous 18% safe padding, no border.
Color palette: deep pine green #0E5142, warm coral #F28A54, clear sky teal #54ACC9, optional cream accent; never use magenta in the subject.
Scene/backdrop: perfectly flat solid #FF00FF chroma-key background for background removal.
Constraints: no shadows, texture, reflections, text, Korean characters, letters, numbers, mockup, or watermark.
```

imagegen의 단색 지시에도 남은 미세 그라데이션은 빌드 스크립트가 네 가지 브랜드 색으로
결정론적으로 양자화한다. 같은 투명 마스터에서 플랫폼별 안전영역과 크기를 다시 만들기 때문에
AI raw 이미지는 앱 최종 자산으로 직접 사용하지 않는다. 이전 v1 마크는 시각 이력으로만 남긴다.

## 원예 모임

- 배포 파일: `public/images/event-gardening.jpg`
- 생성 원본: `assets/imagegen-source/event-gardening.png`
- 용도: 추천 모임 카드
- 프롬프트:

```text
Use case: photorealistic-natural
Asset type: Senior Club event card image
Primary request: three Korean adults aged 60 to 75 learning container gardening together at a neighborhood rooftop garden, gently potting herbs and exchanging practical tips
Scene/backdrop: bright community rooftop garden with planters and soft city skyline
Style/medium: candid photorealistic editorial lifestyle photography
Composition/framing: landscape crop, medium shot, hands and faces naturally visible, clear central action
Lighting/mood: fresh late-morning daylight, capable and collaborative
Color palette: natural leaf greens, sky blue, subtle coral clothing accent
Constraints: no text, no logos, no watermark; natural age details; no staged thumbs-up, no exaggerated laughter, no medical or care-service framing
```

## 클래식 모임

- 배포 파일: `public/images/event-classical.jpg`
- 생성 원본: `assets/imagegen-source/event-classical.png`
- 용도: 추천 모임 카드
- 프롬프트:

```text
Use case: photorealistic-natural
Asset type: Senior Club event card image
Primary request: four Korean adults aged 58 to 72 in a small classical music listening club, discussing a record sleeve and listening attentively together
Scene/backdrop: welcoming neighborhood cultural room with a turntable, wood shelving and soft acoustic details
Style/medium: candid photorealistic editorial lifestyle photography
Composition/framing: landscape crop, intimate medium-wide group composition with clear interaction and useful edges for card cropping
Lighting/mood: soft window daylight, thoughtful, warm but not sepia
Color palette: deep teal, muted blue, warm apricot accents, natural wood
Constraints: no readable text, no logos, no watermark; natural age details; no tuxedos, no staged concert poses, no exaggerated laughter, no medical or care-service framing
```

## Google Play 피처 그래픽

- 배포 파일: `apps/mobile/store-listing/feature-graphic-1024x500-v2.png`
- 규격: 1024×500 PNG
- 입력 이미지: imagegen 홈 히어로와 v2 브랜드 마크
- 생성 방식: `scripts/build_brand_assets.py`가 실제 한글 폰트와 규격을 사용해 결정론적으로 합성
- 문구: `좋아하는 일을 함께, 다음 약속까지`
- 제약: RGB, 알파 없음, 외곽 8% 안전영역, 이미지 생성 모델에 한글 렌더링을 맡기지 않음

이전 이미지 생성 프롬프트는 다음과 같다.

```text
Use case: ads-marketing
Asset type: Google Play Store feature graphic, final crop 1024x500
Input images: Image 1 is the established Senior Club Korean senior hiking/photo activity hero; Image 2 is the established Senior Club brand mark and must remain recognizable.
Primary request: Create a refined wide feature graphic for a Korean senior community app about purpose, people, activities, and lasting relationships.
Composition/framing: very wide 2.048:1 composition; place the warm candid group of Korean older adults together on the right two-thirds, naturally engaged with a map and camera; reserve a calm uncluttered light sky/soft mint negative-space panel on the left third; place a small clean rendition of the circular brand mark within the left negative space with generous safe margins. Keep all important content away from the outer 8% edges.
Style/medium: premium natural editorial lifestyle photography with subtle brand-color graphic integration, not a generic stock-photo collage.
Lighting/mood: bright soft daylight, welcoming, active, dignified, trustworthy.
Color palette: deep evergreen #0E5142, sky blue #5FB4D9, warm coral #F98A4A, soft cream #F7F4EC.
Constraints: no text, no letters, no watermark; preserve realistic Korean senior faces and hands; no medical imagery; no childish styling; no excessive saturation; no extra logos; keep the brand mark clean and geometric.
```
