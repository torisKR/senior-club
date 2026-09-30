# 시니어클럽 Google Play 출시 가이드

갱신: 2026-09-30. 대상 앱은 `com.toris.seniorclub`, 현재 versionName은 `0.1.1`이다.
이 문서는 현재 저장소의 직접 Gradle/Android Publisher 릴리스 경로와 남은 수용 조건을 설명한다.
로컬 검증, 기기의 QA APK, hosted CI, Play 설치·심사·공개 결과는 서로 다른 증거다.

## 1. 현재 릴리스 계약

| 항목 | 현재 기준 |
| --- | --- |
| 앱/패키지 | 시니어클럽 / `com.toris.seniorclub` |
| 소스/런타임 | Expo SDK 57, React Native, Expo Router, 세로 방향 |
| production API | `https://d33totqtaqpyfs.cloudfront.net` — 실제 API는 AWS ECS |
| 웹/정책 origin | `https://senior.toris.kr` |
| 산출물 | 직접 Gradle `:app:bundleRelease`로 만든 upload-key 서명 AAB |
| 대상 API | 실제 compiled manifest의 targetSdkVersion ≥ 36이라는 저장소 검증 계약 |
| versionCode | 릴리스마다 Play tracks/bundles/APKs 조회값과 시간값으로 할당; 업로드 직전 다시 대조 |
| 서명 | upload certificate와 Play App Signing certificate를 별도로 확인 |
| workflow | [production](../.github/workflows/android-play-production.yml), [internal wrapper](../.github/workflows/android-play-internal.yml) |
| screenshot 전달 | 동일 main SHA의 [issuer](../.github/workflows/android-play-screenshot-evidence.yml) run → 검증된 Actions artifact → receiver |

`app.json`의 versionCode `212215980`는 현재 로컬 후보의 값이며 다음 Play 제출에 사용할 수 있다고 확정하지 않는다.
현재 경로는 EAS 원격 autoIncrement/build/submit이나 `--latest` artifact 선택을 사용하지 않는다.
EAS project metadata가 앱 설정에 남아 있어도 EAS credential 설정이나 결제 플랜이 이 workflow의 필수 단계는 아니다.
target API는 날짜별 정책을 단정하지 않고 실제 AAB와 제출 시점의 [공식 요구사항](https://developer.android.com/google/play/requirements/target-sdk)을 확인한다.

## 2. 최신 증거와 한계

| 산출물 | 소스/해시 | 확인 범위 |
| --- | --- | --- |
| 설치된 Android 디자인 QA APK | native source `0d91c279bb8d14c210a9dbac89326da9234a8428`; APK SHA-256 `8d117e63324d4de82c4550f2c2ced5e283a528704b07459bec80b7ae2014bad5` | Galaxy M33/Android 16의 디자인·글자 확대·탭·이미지·기존 로그인 복원과 프로필 유지 QA. release 모드, 기존 debug certificate 서명, 테스트 광고 설정 |
| 최신 로컬 upload-signed AAB 후보 | source `8f25f7dd366fe2e8a43f41b1060e6403e611cf4c`; SHA-256 `4a6bd77bd2a7aa6181036bdb6dbb1d7fdb36b35a2a33811c4f6e669b692d6355` | `0.1.1` / `212215980`, 93,679,754 bytes, 4 ABI, bundletool·전체 서명·compiled manifest·공통 사진·Material font·production endpoint/ad 설정 검증 |

AAB 후보의 upload certificate SHA-256은 `58d2a5f2d30822599ff5b1d46e3d499e85a25c0ffb6efe396da0daba38b0634b`다.
[최신 후보 증거](qa-evidence/20260930/android-latest-signed-candidate.json)에 native 디자인 소스 및 빌드 파일 hash가 기록돼 있다.
이 후보는 기기 설치, 해당 artifact의 provider 로그인, Play 최신 version 대조, 최종 screenshot 검토, hosted CI, Play 업로드를 완료하지 않았다.
production banner 설정 확인은 실제 광고 제공·동의 화면 검증이 아니다. SDK의 test ID 상수가 존재하는 것과 설정된 광고 ID도 구분한다.
기기의 debug-signed QA APK를 Play 제출 파일이나 Play 서명 설치물로 표시하지 않는다. 실제 카카오 재로그인은 앞선 인증 APK와 API task 24에서 확인했으며 최신 QA APK에서 provider 재로그인을 반복한 결과는 아니다.
이전 f513 소스/99f577 AAB와 7월 캡처·업로드 기록은 historical 자료이며 최신 출시 증거로 재사용하지 않는다.
상세 실행 결과는 [운영 QA 보고서](QA_PRODUCTION_20260930.md), 릴리스 전달 절차는 [인수 문서의 현재 계약](PLAY_UPLOAD_HANDOFF.md#소스-고정-후-screenshot-evidence-전달)을 본다.

## 3. 실제 앱 기능과 심사 안내

- 로그인은 **카카오만** 사용한다. 휴대전화 SMS OTP, 이메일 OTP 또는 Twilio 로그인 계정으로 심사 경로를 안내하지 않는다.
- 이름·별명과 휴대전화 연락처는 내 정보에서 본인이 선택적으로 수정·삭제한다. 연락처 저장은 번호 인증이나 로그인 조건이 아니다.
- Firebase 번호 인증/linking은 선택 기능의 구현 경로다. 현재 프로젝트의 Auth 초기화가 `BILLING_NOT_ENABLED`로 막혀 있으며 Phone provider, 한국 SMS 정책, 서버 Admin ADC와 실제 서명 SHA 구성이 필요하다. 실제 SMS·linking 성공이나 제공 완료를 선언하지 않는다.
- 모임 신청/승인/취소, 게시글·댓글·후기·참여자 채팅, 신고·차단/해제, 운영자 처리와 계정 삭제 경로가 있다. 화면/API 연결과 모든 역할의 운영 환경 E2E 완료는 구분한다.
- Android에는 Google AdMob 배너와 동의/개인정보 옵션 경로가 있다. 광고 포함 여부를 '예'로 선언한다. 테스트 광고 QA를 production 광고 검증으로 표시하지 않는다.
- 플러스는 `expo-iap`의 Google Play 일회성 상품 `seniorclub.remove_ads`와 구매 복원 경로를 사용한다. 정기 구독이나 모임 참가비 결제로 설명하지 않는다. 실제 Play 구매·복원은 별도 수용 조건이다.
- Expo Notifications/FCM의 token 등록과 알림 이동 코드가 있다. 운영 이메일/SMS outbox·FCM 발송 채널은 disabled이며 실제 알림 수신을 완료로 표시하지 않는다.

심사자가 카카오 로그인과 동의, 필요한 회원/리더 권한으로 화면에 실제 도달할 수 있는 접근 안내를 마련한다.
다른 로그인 수단을 만들거나 테스트 신원을 production 인증으로 대체하지 않는다. 심사용 계정·연락처·비밀번호·token은 문서/로그/스크린샷에 넣지 않는다.
번호 인증 준비 중이라는 현재 동작과 스토어 설명을 일치시키며, 이를 카카오 로그인 차단 조건으로 만들지 않는다.

## 4. 배포 환경과 직접 빌드

production은 `play-store-production`, 내부 제출은 `play-internal` GitHub Environment를 사용한다.
현재 reusable workflow가 요구하는 구성은 다음과 같다.

| 종류 | 이름 |
| --- | --- |
| secrets · 업로드 서명 | `ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `ANDROID_UPLOAD_CERT_SHA256` |
| secrets · 서비스 | `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_SERVICES_JSON_BASE64`, `KAKAO_NATIVE_APP_KEY` |
| variables · 공개 origin | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` — 위 canonical 값과 정확히 일치 |
| 선택적 public certificate | `PLAY_APP_SIGNING_CERTIFICATE_BASE64` — Play Console에서 확인한 DER 인증서, 개인 키 아님 |

Google Services JSON의 package 일치는 Firebase **클라이언트** 구성 검증이며 Phone provider 활성화나 서버 Admin credential을 뜻하지 않는다.
Play 서비스 계정은 코드에서 정한 app-scoped uploader와 일치해야 한다. 키·클라이언트 JSON·keystore·암호를 Git에 커밋하지 않는다.
Play upload certificate와 실제 Play App Signing certificate 각각의 Kakao key hash 및 Firebase SHA 등록을 확인한다. QA debug 서명 등록만으로 대신하지 않는다.

workflow는 locked dependencies와 모바일 품질/릴리스 검사를 실행하고, 검증된 screenshot provenance로 전체 preflight를 수행한다.
그 뒤 Play history로 versionCode를 할당하고 Expo prebuild, 직접 Gradle AAB 빌드, compiled merged manifest 검사를 수행한다.
pinned bundletool 검증, AAB 실제 package/version/target/권한·export 계약, 전체 entry 서명과 upload cert, JS endpoint를 확인한 정확한 bytes만 업로드한다.
`direct-play-release.py`는 업로드 직전 versionCode와 AAB를 다시 대조하고 Play 응답의 version/hash, edit validation/commit 및 별도 track read-back을 확인한다.
네트워크 오류로 provider 상태가 불명확하면 확인 후 새 dispatch를 준비한다. 동일 run의 rerun은 거절되며 자동 재업로드하지 않는다.
환경이 준비돼 있다는 추측이나 로컬 후보 결과는 hosted 실행 결과를 대신하지 않는다.

## 5. 모든 모드의 screenshot issuer/receiver

1. 최종 검토 소스를 **main의 full SHA**로 고정한다. 실제 서명 APK에서 휴대전화 5–6장, 7인치·10인치 태블릿 각각 4–8장을 캡처한다.
2. 실제 검토자가 기능 도달·최종 UI·브랜드/데모 문구·개인정보·콘텐츠 사용권·상태 바를 확인한다. APK/PNG 해시와 캡처 환경을 기록한다.
3. 원본 manifest/PNG를 Git 밖의 ZIP에 담고 고정 SHA 전용 published prerelease asset으로 전달한다. 공개 저장소에서는 입력도 공개되므로 실제 공개 허용 범위를 먼저 확인한다.
4. 같은 검토자 계정이 issuer에 source SHA, Release/asset ID, 원본 ZIP SHA를 입력한다. `manual_review`의 기본값은 false이며 실제 검토를 마친 사람이 명시적으로 선택한다.
5. producer는 원본 event/발급자·source·asset digest를 검증하고 원본 bytes의 artifact를 발급한다. 프로그램이 attestations를 생성하거나 false를 true로 보정하지 않는다.
6. release에는 성공한 **구체적인 `screenshot_evidence_run_id`**를 전달한다. receiver는 고정 repo/workflow/main/SHA/첫 attempt/success/유일한 미만료 artifact/digest와 다운로드 중 교체 여부를 확인한다.
7. archive의 안전성, manifest/PNG hash·RGB/CRC/규격 및 6개 수동 확인 값 검증 후 같은 전체 production preflight를 실행한다.

manifest의 `capture.commit`을 Git에 쓰고 다시 commit하는 자기 참조 방식을 사용하지 않는다.
screenshot manifest의 app version은 release의 app.json과 같아야 한다. 캡처/발급/소비 사이에 main이 달라지면 새 SHA에서 다시 준비한다.
issuer artifact는 `android-play-final-screenshots-<full source SHA>`; review receipt는 별도 artifact다.
호출자는 `contents: read`와 **`actions: read`**를 제공한다. 내부 wrapper도 run ID를 필수로 전달한다.
`binary_update=true`는 기존 등록정보 유지 의미이며 screenshot receiver나 preflight를 생략하는 옵션이 아니다.
기존 후보 screenshot, synthetic PNG, 자동 작성한 manual attestation, 최신 artifact 자동 선택으로 통과시키지 않는다.
현재 최종 수동 검토·issuer/receiver hosted run 증거는 없다. 상세 schema/입력 명령은 [현재 인수 문서](PLAY_UPLOAD_HANDOFF.md#소스-고정-후-screenshot-evidence-전달)를 사용한다.

## 6. 실행 모드와 제출 영향

| 호출 | 명시적 입력 | Play 결과 |
| --- | --- | --- |
| internal wrapper | run ID, `submit_to_play=false` | 후보만 빌드·검증 |
| internal wrapper | run ID, `submit_to_play=true` | internal / draft |
| production | run ID, `binary_update=false`, `submit_to_play=true` | production / draft |
| production published update | run ID, `binary_update=true`, `submit_to_play=true` | production / **completed** |
| production 또는 deploy-main 후보 | run ID, `submit_to_play=false` | 후보만 빌드·검증 |

production `completed` 경로는 단순 draft가 아니며 현재 코드에 소규모 staged rollout 옵션은 없다.
Play 심사·managed publishing·실제 공개 상태는 별도로 확인한다. 코드가 completed를 요청한 사실만으로 사용자 공개를 확정하지 않는다.
수동 dispatch의 submit 기본값은 false지만 reusable `workflow_call` 기본값은 true다. 호출자에서 의도한 값을 명시한다.
main push의 deploy-main은 API/Sites를 처리한다. Android는 수동 dispatch와 run ID가 있을 때만 `submit_to_play=false`로 후보 빌드를 호출한다.
`internal_release=true`와 `binary_update=true` 조합은 거절한다. 실제 Play upload는 reviewed main을 요구한다.

검증된 issuer run이 준비된 뒤 후보 빌드 호출은 다음과 같다. 아래 명령은 현재 실행 완료 기록이 아니다.

```bash
screenshot_issuer_run_id='<검증된 issuer run ID>'
gh workflow run android-play-production.yml \
  --repo torisKR/senior-club --ref main \
  -f screenshot_evidence_run_id="$screenshot_issuer_run_id" \
  -f binary_update=false -f submit_to_play=false
```

내부 wrapper를 사용할 때도 `screenshot_evidence_run_id`와 `submit_to_play=false`를 명시한다.
후보 빌드도 versionCode 할당을 위해 Play edit를 생성/삭제하므로 **읽기 전용 작업이 아니다**.
실제 제출은 별도 제출 의사와 모든 조건을 확인한 뒤 진행한다. 위 명령의 false를 자동으로 true로 승격하지 않는다.

## 7. 정책 URL·개인정보·스토어 콘텐츠

- 개인정보: [https://senior.toris.kr/privacy](https://senior.toris.kr/privacy)
- 계정 삭제: [https://senior.toris.kr/account-deletion](https://senior.toris.kr/account-deletion)
- 이용약관: [https://senior.toris.kr/terms](https://senior.toris.kr/terms)

정책 안내는 익명/모바일 환경에서 열려야 하며 삭제 절차는 앱을 재설치하지 않고 시작할 수 있어야 한다.
계정 생성 앱의 인앱 삭제와 외부 웹 경로, 연결 데이터 삭제·정당한 보유 예외 공개를 [Google의 계정 삭제 요구사항](https://support.google.com/googleplay/android-developer/answer/13327111?hl=ko)과 대조한다.
앱 내 `내 정보 → 개인정보와 계정`의 삭제 요청과 서버 `POST /v1/me/deletion-request`, 취소 기간·worker 처리·세션/푸시 해제·백업을 검증한다. 화면 존재만으로 운영 완료 처리하지 않는다.

**현재 공개 개인정보 페이지는 수탁자·처리 국가·항목·기간 공개를 공급자 계약 확정 뒤로 미룬다.**
운영자의 실제 명칭/책임 주체, 수신 가능한 지원·개인정보 연락처, 공급자·국가·항목·기간·삭제/보유 기준을 실제 계약과 일치시켜 확정해야 한다.
URL이 200으로 열리는 것은 내용 확정이나 담당자의 실제 문의 수신을 증명하지 않는다. 운영자 정보에 대한 사용자 응답은 아직 필요하다.

Data Safety와 스토어 설명의 최종 작업은 [DATA_SAFETY.md](DATA_SAFETY.md) 및 [스토어 자산](../apps/mobile/store-listing/README.md)을 기준으로 진행한다.
카카오 식별자/닉네임, 선택 연락처·프로필, 관심사/지역·참여 이력, UGC/채팅·신고/차단, 광고 ID/진단, 구매와 푸시 token을 실제 API·SDK·traffic·운영 설정과 대조한다.
Firebase·FCM·AdMob·Google Play·Kakao·호스팅/DB 공급자와 활성 처리 범위를 확인한다. SMS 로그인/Twilio를 현재 동작으로 선언하지 않는다.
미사용 SDK 이름만으로 수집 유무를 단정하지 않으며 외부 SDK 처리도 포함한다. 수집/공유·선택성·보유·삭제 선언의 책임과 예외는 [공식 Data Safety 안내](https://support.google.com/googleplay/android-developer/answer/10787469?hl=ko)를 확인한다.
앱 콘텐츠에는 광고 '예', 실제 카카오 접근 절차, UGC/채팅 콘텐츠 등급, 성인 대상 설정과 적용되는 추가 선언을 반영한다.

UGC는 작성 전 정책 동의, 콘텐츠/사용자 신고, 사용자 차단, 지속적인 운영자 검토와 조치가 필요하다.
서버 응답·채팅 상호작용·운영 화면까지 실제로 확인한다. [공식 UGC 정책](https://support.google.com/googleplay/android-developer/answer/9876937?hl=ko).

공식 정책은 2026-09-30에 확인했으며 제출 직전에 다시 확인한다.
2023-11-13 이후 생성한 개인 개발자 계정에는 12명/14일 연속 비공개 테스트 후 production 접근 신청 요건이 있다.
이 계정의 적용 여부나 충족 결과는 확인하지 않았으므로 [공식 테스트 안내](https://support.google.com/googleplay/android-developer/answer/14151465?hl=ko)와 Play Console을 대조한다.

## 8. 최종 수용 체크리스트

체크하지 않은 항목은 구현 코드나 로컬 테스트로 자동 충족되지 않는다.

- [ ] 공개 Git 저장소에 소스·배포 증거를 올리는 범위를 승인받고 검토된 main SHA를 확정
- [ ] 최종 서명 APK의 실제 휴대전화/태블릿 screenshot·6개 수동 확인·issuer/receiver hosted run 확보
- [ ] 같은 소스의 hosted 품질 검사·직접 빌드·AAB hash/compiled manifest·서명·endpoint·최신 Play versionCode 검증
- [ ] upload cert와 Play App Signing cert, Kakao key hash/Firebase SHA 및 Play에서 설치한 artifact의 로그인·콜백 확인
- [ ] 회원/리더/관리자의 운영 앱·웹에서 신청·승인·취소, 채팅·후기, 신고·차단/해제와 관리자 조치 E2E
- [ ] 세션 복원/회수, 네트워크 오류·오프라인·재연결, 대기/마감/빈 상태와 최신 날짜·가격·정원 데이터 검증
- [ ] 최저 지원 Android, 작은/대형 화면·태블릿, 시스템 글자 확대와 큰 글씨 모드, TalkBack, 제스처/3버튼·키보드·predictive back 확인
- [ ] 최종 이미지 크롭·비율·fallback, 카드/하단 바 잘림과 저사양 성능·오류/ANR 확인
- [ ] production 광고의 동의/옵션·실제 제공, Plus 상품/가격·구매·복원/광고 제거를 허용된 Play 테스트 환경에서 검증
- [ ] 알림을 제공한다고 안내한다면 FCM 권한/token/수신/탭 이동·로그아웃 해제의 실제 운영 결과 확보
- [ ] 선택 Firebase 번호 인증을 제공하기 전 billing/Phone provider/region/Admin credential/서명 설정과 실제 SMS·linking 검증; 미제공 상태면 설명과 UI 일치
- [ ] CloudFront→origin HTTPS 조건 완료 및 모든 데이터 전송·보관/접근·삭제 정책을 실제 운영 구성과 일치
- [ ] 실제 운영자·담당 연락처·수탁자·국가·항목·기간이 확정된 공개 정책과 Data Safety·등록정보 일치
- [ ] 앱/웹 삭제 경로, 재인증·취소 기간·worker·연결 데이터/로그/백업 삭제와 담당자의 처리 가능 여부 확인
- [ ] Play 계정/package/앱 액세스, 콘텐츠 등급·타깃·광고·국가/가격, 적용되는 테스트/production 접근 조건 확인
- [ ] 실제 제출된 version/hash/track/status read-back, App Bundle Explorer와 Pre-launch report 결과 확인
- [ ] 심사·managed publishing·실제 공개 상태와 출시 후 Android vitals/문의/신고/삭제 요청 담당자 확인

## 9. 현재 외부 의존으로 남은 조건

- 공개 Git push는 소스와 내부 배포 증거의 공개 전달에 대한 **자동 승인 검토 거절**로 보류돼 있다. 해당 공개 범위의 명시적 승인이 필요하며 우회 업로드하지 않는다. main/hosted workflow/screenshot 입력 공개는 아직 완료하지 않았다.
- 최종 screenshot의 실제 캡처·사용권/개인정보·수동 검토와 신뢰할 issuer/receiver run이 없다. 로컬 AAB 후보를 final artifact로 승격하지 않는다.
- Play의 최신 versionCode/실제 App Signing certificate, 해당 설치물의 provider/Billing/FCM E2E·심사·공개는 별도 확인이 필요하다.
- Firebase billing 계정·Phone provider/지역 설정·서버 Admin ADC, origin TLS용 DNS/인증서 접근 등 필요한 외부 설정이 남아 있다.
- 실제 운영자·지원/개인정보 수신 담당자 및 공급자 계약 정보에 대한 사용자 답변이 남아 있다. 확정 전 정책/지원 조건을 완료로 표시하지 않는다.
