# 시니어클럽 Google Play 스크린샷 파이프라인

기준일: 2026-07-29

이 문서는 `com.toris.seniorclub` Android 빌드의 Google Play 등록용 스크린샷을
실제 앱 화면에서 캡처하고 검증하는 절차다. 심사용 계정과 배포 자격 증명을
만드는 절차는 포함하지 않는다.

## 원칙

- 스크린샷은 서명된 Android APK에서 직접 캡처한다.
- 이미지 생성 도구로 앱 UI, 채팅, 후기, 신청 상태를 만들지 않는다.
- 문구를 합성할 때도 실제 UI 영역을 유지하고, 추가 문구는 전체 면적의 20%
  이하로 제한한다.
- Play 등록 설명과 스크린샷에 나오는 기능은 심사자 계정으로 실제 도달
  가능해야 한다.
- 계정 이메일, 비밀번호, token, API key는 파일과 manifest에 기록하지 않는다.

## 캡처 전 차단 조건

다음 조건이 하나라도 남아 있으면 최종 캡처를 시작하지 않는다.

- [ ] `시니어클럽` 표시 브랜드와 v2 로고가 최종 APK에 반영됨
- [ ] `클럽시니어`, `체험`, `준비 중`, `정식 연동 전` 문구가 최종 여정에 없음
- [ ] 실제 서버 인증과 세션 회수가 동작함
- [ ] 심사용 계정에 승인 대기, 참여 확정, 참여 완료 상태가 준비됨
- [ ] 승인 참여자 채팅과 참여자 후기 작성이 서버와 연결됨
- [ ] 표시되는 모임 날짜가 캡처일 기준 예정/지난 상태와 일치함
- [ ] 표시 이름·메시지·사진·장소가 합성 테스트 데이터이거나 표시 동의를 받음
- [ ] 히어로·모임 사진과 로고의 사용권 기록을 확인함
- [ ] 동일 commit의 internal/preview APK가 준비됨

현재 출시 차단 조건은 [`RELEASE_READINESS.md`](./RELEASE_READINESS.md)를 함께 본다.

## 현재 후보 캡처

2026-07-29에 개발 Android 앱의 실제 UI에서 다음 후보 자산을 캡처했다.

- `apps/mobile/store-listing/screenshots/phone/`: 로그인·홈·모임 목록·상세·신청·신청 상태 6장
- `apps/mobile/store-listing/screenshots/tablet-7/`: 홈·커뮤니티·모임 목록·상세 4장
- `apps/mobile/store-listing/screenshots/tablet-10/`: 홈·커뮤니티·모임 목록·상세 4장

모두 1080×1920 세로 9:16, 알파가 없는 8-bit RGB PNG이며
`pnpm --dir apps/mobile validate:screenshots`를 통과한다. 이 세트는 레이아웃과
스토어 규격을 확인하는 후보 자산이다. 아직 서명된 제출 APK의 commit·SHA-256과
사람의 최종 검토를 증명하지 않았으므로 `final/ko-KR/manifest.json`을 만들거나
출시 증명 검사를 통과한 것으로 간주하지 않는다.

## 산출물

### 휴대전화 6장

| 순서 | 파일 | 화면 | 추가 문구 |
| ---: | --- | --- | --- |
| 1 | `phone-01-home.png` | 홈 | 관심사로 내게 맞는 모임을 한눈에 |
| 2 | `phone-02-event-detail.png` | 모임 상세 | 날짜·장소·난이도를 보고 편하게 신청 |
| 3 | `phone-03-chat.png` | 승인 참여자 채팅 | 참여자와 채팅으로 함께 준비 |
| 4 | `phone-04-applications.png` | 내 모임 상태 | 신청·승인 상태를 분명하게 확인 |
| 5 | `phone-05-review.png` | 후기 작성 | 함께한 활동을 후기로 기록 |
| 6 | `phone-06-interests.png` | 관심사 선택 | 등산·사진·원예, 좋아하는 주제로 시작 |

휴대전화 최종 크기는 1080×1920 RGB PNG다.

### 태블릿 기기군별 4장

7인치와 10인치에서 각각 홈, 모임 상세, 채팅, 내 모임 상태를 캡처한다.

- 7인치: `tablet-7-01-home.png` ~ `tablet-7-04-applications.png`, 1080×1920
- 10인치: `tablet-10-01-home.png` ~ `tablet-10-04-applications.png`, 1080×1920 이상

태블릿은 대화면 홈의 잘림을 피하기 위해 추가 카피를 합성하지 않고 실제 UI를
우선한다.

## 캡처 환경 고정

1. 앱과 서버를 최종 캡처 commit으로 고정한다.
2. 서명된 internal/preview APK를 설치한다. Expo Go 개발 UI가 노출되는 캡처는
   사용하지 않는다.
3. 에뮬레이터의 언어를 한국어, timezone을 `Asia/Seoul`, 테마를 light,
   글자 크기를 기본값으로 맞춘다.
4. 알림을 제거하고 배터리·Wi-Fi·이동통신 표시가 정상인지 확인한다.
5. 시스템 애니메이션을 꺼 같은 프레임을 재현 가능하게 한다.

ADB로 애니메이션과 글자 크기를 고정할 수 있다.

```bash
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell settings put system font_scale 1.0
adb shell cmd uimode night no
```

캡처가 끝나면 애니메이션 값을 복원한다.

```bash
adb shell settings delete global window_animation_scale
adb shell settings delete global transition_animation_scale
adb shell settings delete global animator_duration_scale
```

## 해상도와 방향

시니어클럽은 `orientation: portrait`로 설정되어 있다. 모든 기기를 세로 9:16으로
캡처한다.

### 휴대전화

```bash
adb shell wm size 1080x1920
adb shell wm density 420
```

### 7인치 태블릿

실제 7인치 프로필 또는 `smallestWidth` 600dp 이상인 전용 AVD를 사용한다.

```bash
adb shell wm size 1080x1920
adb shell wm density 280
```

### 10인치 태블릿

```bash
adb shell wm size 1440x2560
adb shell wm density 320
```

`wm size`만 바꾸어 휴대전화를 태블릿으로 표현하지 않는다. 각 기기군의
화면 크기와 반응형 레이아웃을 실제로 확인한다. 작업 후 오버라이드를 제거한다.

```bash
adb shell wm size reset
adb shell wm density reset
```

## 실제 화면 캡처

로그인과 화면 전환은 심사자가 사용할 동일한 앱 여정으로 진행한다. 자격
증명을 명령어 인자나 디버그 로그에 넣지 않는다.

각 화면이 완전히 렌더링되고 스크롤 위치를 확인한 뒤 캡처한다.

```bash
adb exec-out screencap -p > phone-01-home.raw.png
```

원본은 별도로 보관하고, 최종 파일은 24-bit RGB PNG로 내보낸다. alpha 채널이나
PNG `tRNS` chunk가 있으면 검증기가 실패한다. 색 프로파일은 sRGB를 사용하고
스트레치, 인공적 샤프닝, UI 요소 삭제를 하지 않는다.

## 휴대전화 문구 합성

문구는 [`../apps/mobile/store-listing/ko-KR/screenshot-copy.md`](../apps/mobile/store-listing/ko-KR/screenshot-copy.md)의
순서를 사용한다.

- 첫 세 장에 탐색, 신청, 관계 형성을 배치한다.
- 추가 문구는 화면 면적의 20% 이하다.
- `지금 다운로드`, `설치`, `1위`, `최고`, `무료` 같은 유도·성과·가격 문구를
  넣지 않는다.
- UI 글자를 가리지 않고 실제 앱 화면을 핵심으로 유지한다.
- 추가 문구가 있는 파일도 한국어 현지화본으로 별도 관리한다.

## manifest 완성

1. [`../apps/mobile/store-listing/screenshots/manifest.example.json`](../apps/mobile/store-listing/screenshots/manifest.example.json)을
   `manifest.json`으로 복사한다.
2. 실제 앱 version, Git commit, APK 파일명과 SHA-256, 캡처 시각을 입력한다.
3. `sourceRoute`, 파일 순서, 추가 문구, 140자 이하 `altText`를 확정한다.
4. 개인정보·브랜드·기능 도달·사용권·상태 표시를 사람이 검토한 뒤만
   `attestations`를 `true`로 바꾼다.

APK 해시 예:

```bash
shasum -a 256 REPLACE_WITH_SIGNED_APK_FILENAME
```

manifest에 심사용 계정, 비밀번호, service account, token을 넣지 않는다. 실제
심사 접근 정보는 Play Console의 보호된 앱 액세스 입력란에만 저장한다.

## 자동 규격 검증

앱 디렉터리에서 실행한다.

```bash
cd apps/mobile
node scripts/validate-play-screenshots.mjs
```

Play 제출 전에는 production config, 등록정보와 이 strict 검사를 한 번에 실행한다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
EXPO_PUBLIC_WEB_URL=https://실제-웹-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

검증기는 다음을 확인한다.

- 휴대전화 5~6장, 7인치 4~8장, 10인치 4~8장
- `phone-01-home.png` 형식의 순서가 있는 파일명
- 폭·높이와 세로 9:16 비율
- 유효한 PNG chunk와 CRC
- 8-bit 24-bit RGB, alpha·`tRNS` 없음
- 8MiB 이하
- manifest에 누락된 최종 PNG 없음
- 자격 증명 키가 manifest에 없음
- 수동 검토 항목이 모두 `true`

검증기는 파일을 생성·보정·삭제하지 않는다. `manifest.example.json`은 실제
자산이 아니며 그대로는 반드시 실패하도록 구성되어 있다.

## 최종 사람 검토

자동 검증이 통과해도 다음을 모두 확인하기 전에는 Play Console에 업로드하지
않는다.

- [ ] 이전 이름 `클럽시니어`가 없음
- [ ] `체험`, `준비 중`, Expo/debug 표시가 없음
- [ ] 표시된 신청·승인·채팅·후기가 심사자 계정에서 재현됨
- [ ] 지난 모임이 `예정`으로 표시되지 않음
- [ ] 검은 태블릿 레터박스가 없음
- [ ] 텍스트가 잘리거나 탭 바에 가려지지 않음
- [ ] 테스트 이메일·실제 개인정보·운영자 알림이 없음
- [ ] 휴대전화 추가 문구가 20% 이하이고 본문이 읽힘
- [ ] 피처 그래픽·아이콘·앱 UI의 색과 로고가 일치함
- [ ] 모든 자산이 현재 리리스의 실제 기능만 보여 줌

## 실패 처리

- RGB 오류: 합성/내보내기 도구에서 24-bit RGB PNG, alpha 없음으로 다시 내보낸다.
- 비율 오류: 스트레치하지 말고 올바른 AVD 표시 크기에서 다시 캡처한다.
- 누락 파일: `assetRoot` 안의 PNG와 manifest `files` 목록을 일치시킨다.
- CRC 오류: 손상된 파일을 버리고 원본 캡처에서 다시 내보낸다.
- 수동 확인 오류: 자동으로 `true`로 바꾸지 말고 담당자가 실제 상태를 재검토한다.
