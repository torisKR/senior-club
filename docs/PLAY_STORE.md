# 시니어클럽 Google Play 출시 가이드

기준일: 2026-07-30

이 문서는 시니어클럽(Senior Club) Android 앱 `com.toris.seniorclub`을 Google Play에 출시하기 위한 실행 체크리스트다. Google 정책과 Play Console 화면은 바뀔 수 있으므로 제출 직전에 연결된 공식 문서를 다시 확인한다.

## 1. 출시 구성

| 항목 | 결정 |
| --- | --- |
| 앱 이름 | 시니어클럽 |
| package | `com.toris.seniorclub` |
| EAS 프로젝트 | [`@tony3000/club-senior`](https://expo.dev/accounts/tony3000/projects/club-senior) |
| EAS projectId | `89cbd11f-03c0-4d30-9062-295654924f59` |
| 기술 | Expo SDK 57 / React Native / Expo Router |
| 방향 | 세로 고정 |
| Android UI | edge-to-edge, predictive back 활성화 |
| 배포 파일 | production AAB |
| 버전 | `0.1.0`, 초기 versionCode `1` |
| 버전 관리 | EAS 원격 versionCode + production `autoIncrement` |
| 권한 | 기능에 꼭 필요한 권한만 선언, 현재 민감 권한 차단 |

Expo SDK 57은 Android API 36 호환 기반으로 선택했다. 실제 제출 산출물의 대상 API는 Play Console의 App Bundle Explorer에서 반드시 확인한다.

## 2. 2026년 정책 확인

### 대상 API 36

2026년 8월 31일부터 휴대전화·태블릿용 신규 앱과 업데이트는 Android 16, 즉 API 36 이상을 대상으로 해야 한다. 기준일 이후 API 35 AAB는 신규 제출이나 업데이트가 막힐 수 있다.

- [Android 개발자 대상 API 요구사항](https://developer.android.com/google/play/requirements/target-sdk)
- [Google Play 대상 API 수준 정책](https://support.google.com/googleplay/android-developer/answer/11926878?hl=ko)

### 신규 개인 개발자 계정의 비공개 테스트

2023년 11월 13일 이후 만든 개인 개발자 계정에는 프로덕션 액세스 신청 전 비공개 테스트가 적용된다. 최소 12명의 테스터가 연속 14일 이상 참여 상태를 유지해야 한다. 조직 계정이나 기존 계정에는 적용 범위가 다를 수 있으므로 Play Console에 표시된 요건을 우선한다.

- [신규 개인 개발자 계정 테스트 요건](https://support.google.com/googleplay/android-developer/answer/14151465)

테스터는 단순 등록만 하지 않고 설치, 핵심 여정 수행, 오류·접근성 피드백을 남기도록 한다. 시니어 대상 실제 사용성 검증을 위해 서로 다른 제조사·화면 크기·글자 크기 설정을 포함한다.

### AAB, 개인정보, Data Safety, 계정 삭제

- 신규 Play 앱은 Android App Bundle(AAB)로 게시한다. [Android App Bundle 안내](https://developer.android.com/guide/app-bundle/)
- 게시하는 모든 앱은 Data Safety 양식을 실제 동작과 SDK까지 포함해 정확히 작성한다. [Data Safety 안내](https://support.google.com/googleplay/android-developer/answer/10787469)
- 계정을 만들 수 있는 앱은 앱 안에서 삭제를 요청할 수 있어야 하며, 앱을 삭제한 사용자도 이용할 수 있는 웹 삭제 경로를 제공해야 한다. [계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111)
- 공개 개인정보 처리방침 URL은 정상 로드되고, 앱/개발자 이름과 데이터 처리 방식을 명시해야 한다.

### 사용자 생성 콘텐츠(UGC)

게시글·댓글·후기·채팅을 제공하므로 Google Play의 UGC 정책을 출시 필수 조건으로 적용한다.

- 회원이 UGC를 작성하기 전에 이용약관과 커뮤니티 운영 원칙에 동의해야 한다.
- 앱 안에서 콘텐츠와 사용자를 각각 신고할 수 있어야 한다.
- 앱 안에서 다른 사용자를 차단하고 차단을 해제할 수 있어야 하며, 차단 결과가 실제 노출과
  상호작용에 반영돼야 한다.
- 운영자는 신고를 지속적으로 검토하고 콘텐츠 숨김·삭제 또는 이용 제한을 수행할 수 있어야 한다.
- 이용약관에는 음란물, 성적 착취, 혐오·괴롭힘, 폭력 조장, 불법 거래, 사칭, 개인정보 침해,
  스팸 등 금지 행위와 제재 기준을 명시한다.

- [Google Play 사용자 생성 콘텐츠 정책](https://support.google.com/googleplay/android-developer/answer/9876937?hl=ko)
- [Google Play UGC 신고·차단 및 관리 안내](https://support.google.com/googleplay/android-developer/answer/12923286?hl=ko)

## 3. 계정과 앱 생성

- [ ] Google Play Console 개발자 계정의 신원·연락처 확인 완료
- [ ] 개인/조직 계정 유형과 비공개 테스트 적용 여부 확인
- [ ] Play Console에서 앱 이름 `시니어클럽`, 기본 언어 `한국어(ko-KR)`, 앱 유형 `앱`, 무료/유료 여부 생성
- [ ] `com.toris.seniorclub`의 Play Console 앱과 소유 관계 최종 확인
- [ ] 앱 생성 뒤 package 이름은 변경하지 않음
- [ ] Play App Signing 사용
- [ ] Expo 팀/organization 및 결제 플랜 확정

## 4. 앱 출시 차단 조건

다음 항목이 하나라도 남아 있으면 심사 제출하지 않는다.

- [x] 휴대폰 SMS OTP 가입/로그인, 관심사, 클럽·모임 탐색/신청, 텍스트 게시글·댓글·채팅·후기·알림,
      신고·차단과 계정 삭제 화면이 실제 백엔드 계약에 연결됨
- [ ] production 도메인·DB·자격 증명으로 위 핵심 여정을 역할별 실기기 end-to-end 검증함
- [x] 앱의 `내 정보 > 개인정보와 계정`에 최근 인증 확인을 포함한 삭제 요청 경로가 있음
- [x] 실제 서버 `POST /v1/me/deletion-request`와 앱 내 삭제 요청이 연결됨
- [ ] 임시 문의 주소를 실제 수신 가능한 개인정보·지원 이메일로 교체함
- [ ] 개인정보 처리방침과 실제 서버·SDK·보유 기간이 일치함
- [ ] Data Safety 초안을 네트워크 트래픽과 의존성 목록으로 다시 검증함
- [x] 모바일 게시글·댓글·후기·채팅의 콘텐츠/사용자 신고와 사용자 차단/해제 API, 관리자 신고 처리
      화면이 실제 운영 데이터와 연결됨
- [ ] 차단 대상 콘텐츠·상호작용이 모든 권위 서버 응답과 실시간 전송에서 일관되게 제외되는지 검증함
- [ ] 민감 권한이 새로 추가되지 않았는지 최종 Android Manifest 확인
- [ ] API 36, 64비트, 서명, versionCode를 App Bundle Explorer에서 확인함

## 5. EAS 준비와 빌드

앱 폴더에서 실행한다.

```bash
cd apps/mobile
npx expo-doctor
npx tsc --noEmit
npx eas-cli@21.3.0 login
npx eas-cli@21.3.0 init
```

`eas init`을 통해 실제 EAS 프로젝트를 연결했다. Google Play 서비스 계정 JSON 같은 비밀 값은 저장소에 커밋하지 않는다.

### 내부 QA

```bash
npx eas-cli@21.3.0 build --platform android --profile internal
npx eas-cli@21.3.0 build --platform android --profile preview
```

두 프로필은 기기에 직접 설치 가능한 APK를 만든다. APK는 Play 프로덕션 제출 파일이 아니다.

### Play 제출 AAB

```bash
npx eas-cli@21.3.0 build --platform android --profile playInternal
npx eas-cli@21.3.0 build --platform android --profile production
```

`playInternal`과 `production`은 AAB를 만들고 EAS의 원격 versionCode를 자동 증가시킨다. 동일한 versionCode는 Play에 두 번 업로드할 수 없다. `internal`과 `preview` APK는 Play 트랙에 제출하지 않는다.

첫 AAB는 Play Console에 수동 업로드해 package와 Play App Signing을 연결한다. 자동 제출을 사용할 때만 최소 권한의 Google Cloud 서비스 계정을 Play Console API access에 연결하고 EAS credential로 보관한다. JSON 키는 저장소에 커밋하지 않는다.

```bash
# 실제 Play 서비스 계정 연결 후
npx eas-cli@21.3.0 submit --platform android --profile playInternal
npx eas-cli@21.3.0 submit --platform android --profile production
```

두 제출 프로필은 `draft`다. 최종 공개는 Play Console에서 검토 후 수동 승인한다.

반복 가능한 내부 트랙 빌드는
[`android-play-internal.yml`](../.github/workflows/android-play-internal.yml)을 사용한다. 이 workflow는
수동 실행 전용이고 production preflight와 final screenshot 증빙을 먼저 검사한다. EAS build 결과에서
검증한 정확한 UUID만 선택적으로 내부 트랙 `draft` 제출에 사용하며 `--latest`나 production 승격을
수행하지 않는다. `play-internal` GitHub Environment에는 `EXPO_TOKEN`,
`GOOGLE_SERVICES_JSON_BASE64` secret과 `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` variables가 필요하다. 원격 build용 Firebase
file secret과 submit용 Play 서비스 계정은 EAS에 별도로 구성한다.

`main` push/merge production 배포는
[`android-play-production.yml`](../.github/workflows/android-play-production.yml)을 사용한다.
Environment `play-store-production`에 동일한 secret/variable이 필요하며, 검증된 `production` AAB를
Play production 트랙 `draft`로 제출한다. 최종 공개는 Play Console에서 승인한다.

## 6. 정책 페이지와 앱 콘텐츠

### 외부 URL

- 개인정보 처리방침: `https://확정-production-domain/privacy`
- 계정 삭제: `https://확정-production-domain/account-deletion`

도메인을 확정한 뒤 Play Console에 실제 URL을 입력한다. 배포 후 비로그인·시크릿 창·모바일
네트워크에서 두 URL이 200 응답으로 열리는지 확인한다. 리디렉션 루프, Basic Auth, 로그인 강제는
허용하지 않는다.

### Play Console App content

- [ ] 개인정보 처리방침 URL
- [ ] Data Safety 양식
- [ ] 계정 삭제 URL과 앱 내 삭제 제공 여부
- [ ] 광고 포함 여부 — 현재 광고 SDK가 없다면 `아니요`
- [ ] 앱 액세스 — 심사자가 로그인해야 하면 작동하는 심사용 계정과 한국어 안내 제공
- [ ] 콘텐츠 등급 설문 — 사용자 생성 콘텐츠와 채팅을 사실대로 포함
- [ ] 타깃 사용자 및 콘텐츠 — 성인 대상, 아동 대상이 아님을 실제 UX와 일치시킴
- [ ] 뉴스 앱, 건강 앱, 금융 기능 등 추가 선언 적용 여부 확인
- [ ] 사용자 생성 콘텐츠 신고·차단·운영 정책 경로 확인

## 7. Data Safety 검증

초안은 [`DATA_SAFETY.md`](./DATA_SAFETY.md)에 있다. 최종 제출 전 다음 자료를 함께 검토한다.

- 앱이 호출하는 모든 API와 휴대폰 SMS OTP, 프로필, 신청/참석, 텍스트 UGC, 신고·차단 payload
- Twilio SMS, 선택적 Resend 이메일, FCM, Expo/EAS와 배포 API·DB 사업자의 데이터 처리 문서
- Android 권한과 실제 런타임 권한 요청 화면
- TLS 적용, 저장 암호화, 접근 통제, 백업 삭제 정책
- 계정 삭제 시 원본 DB, 캐시, 알림 token, 로그와 백업에서의 처리

현재 릴리스에는 OAuth, 사용자 사진/파일 업로드, S3, 광고, 분석·오류 수집 SDK가 없다. 이 항목들을
현재 필수 공급자처럼 신고하지 않으며, 실제로 추가하는 릴리스에서 SDK·권한·Data Safety와 삭제 정책을
다시 검토한다.

Play의 `수집`·`공유` 정의는 일반적인 개인정보 용어와 다를 수 있다. 서비스 제공자 예외를 적용하려면 계약과 사용 목적을 확인하고, 광고·교차 서비스 목적이 있으면 공유로 선언한다.

## 8. 스토어 등록정보

- [x] 앱 아이콘 512×512 RGBA PNG — `apps/mobile/store-listing/icon-512-v2.png`
- [x] 그래픽 이미지 1024×500 RGB PNG — `apps/mobile/store-listing/feature-graphic-1024x500-v2.png`
- [x] ASO 제목·짧은 설명·전체 설명 초안 — `apps/mobile/store-listing/ko-KR/`
- [x] 실제 Android 앱의 휴대전화 후보 스크린샷 6종 — `screenshots/phone/`
- [x] 실제 반응형 UI의 7인치·10인치 후보 스크린샷 각 4종 — `screenshots/tablet-7/`, `screenshots/tablet-10/`
- [ ] 서명된 제출 APK에서 최종 캡처 후 commit·APK 해시·수동 확인 manifest 확정
- [ ] 지원 이메일과 웹사이트
- [ ] 카테고리 `소셜` 또는 실제 포지셔닝에 맞는 항목 확정
- [ ] 한국어 문구에서 고령·건강 관련 차별적이거나 의료적으로 오해할 표현 제거

현재 후보 이미지는 `시니어클럽` Android 앱 UI에서 캡처했고 1080×1920, 24-bit RGB 규격 검사를
통과했다. 이는 production OTP/API 통신을 증명하는 자료는 아니다. Play Console 제출 전에는 서명된
제출 APK와 동일 commit에서 다시 확인하고
[`PLAY_SCREENSHOTS.md`](./PLAY_SCREENSHOTS.md)의 출시 manifest를 완성해야 한다.
스크린샷은 큰 글자, 명확한 버튼, 실제 모임 정보 흐름을 보여주되 등록정보와 실제
앱 기능이 달라서는 안 된다.

최종 캡처 증빙까지 준비되면 다음 단일 사전 gate를 실행한다. production API URL은 공개 HTTPS만
허용되며 strict screenshot 검사는 생략할 수 없다.

```bash
EXPO_PUBLIC_API_URL=https://실제-api-도메인 \
EXPO_PUBLIC_WEB_URL=https://실제-웹-도메인 \
GOOGLE_SERVICES_JSON=/secure/path/google-services.json \
pnpm release:android:preflight \
  -- --screenshot-manifest store-listing/screenshots/final/ko-KR/manifest.json
```

이 사전 gate는 AAB 바이너리 분석을 대신하지 않는다. EAS build 후 App Bundle Explorer 검증을 완료한다.

## 9. 테스트 계획

### 필수 기기 조건

- [x] Android 16/API 36 에뮬레이터 — 휴대전화 핵심 여정과 7·10인치 논리 폭 반응형 레이아웃 확인
- [ ] 지원하는 가장 낮은 Android 버전
- [ ] 320dp급 소형 화면과 대형 화면
- [ ] 시스템 글자 크기 기본/크게/최대로 확대
- [ ] TalkBack 탐색 및 포커스 순서
- [ ] 제스처 탐색·3버튼 탐색·predictive back
- [ ] 느린 네트워크·오프라인·재연결
- [ ] 저사양 기기의 목록·이미지·채팅 성능

### Play 트랙

1. 내부 테스트: 개발팀 스모크 테스트
2. 비공개 테스트: 실제 시니어 사용자 포함, 계정 요건 대상이면 12명 이상 14일 연속 참여
3. 프로덕션 액세스 신청: 테스트 결과, 수정 내역, 피드백 근거 작성
4. 프로덕션: 첫 배포는 소규모 단계적 출시를 권장하고 Android vitals를 확인

## 10. 최종 제출 체크

- [ ] production AAB가 최신 커밋으로 만들어짐
- [ ] versionName/versionCode 확인
- [ ] Play App Signing과 업로드 키 백업 정책 확인
- [ ] App Bundle Explorer에서 target API 36 확인
- [ ] Pre-launch report의 비정상 종료, ANR, 접근성, 보안 경고 처리
- [ ] 심사용 계정 및 재현 절차 확인
- [ ] 개인정보·계정 삭제 URL 공개 확인
- [ ] Data Safety와 앱 권한·SDK가 일치
- [ ] 고객지원 문의가 실제로 수신되고 삭제 SLA를 수행할 담당자가 있음
- [ ] staged rollout/국가·지역/가격 검토
- [ ] 출시 후 Android vitals, 리뷰, 신고, 삭제 요청 모니터링 담당자 지정
