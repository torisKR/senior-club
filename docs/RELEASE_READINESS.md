# 시니어클럽 Android 출시 준비 상태

기준일: 2026-09-30. 이 문서는 현재 출시 범위와 남은 수용 조건을 기록한다. 과거 SMS OTP 로그인,
Railway 배포와 EAS release 절차를 현재 출시 지침으로 사용하지 않는다.

## 현재 결론과 고정 소스

로그인은 웹과 Android 모두 **카카오만** 제공한다. 이름·별명과 휴대폰 연락처는 프로필에서 설정하며,
휴대폰 번호는 인증 없이 저장·삭제할 수 있다. Firebase 번호 인증은 선택 기능이고 카카오 로그인이나
모임 이용의 필수 조건이 아니다. 선택 기능 자체의 공급자 설정과 실제 성공 검증은 아직 남아 있다.
모임 신청에는 로그인과 서버 온보딩 완료가 필요하다. UGC는 게시글·댓글·후기·채팅의 텍스트 범위다.

현재 제품 검증과 production 제출 완료를 구분한다. 저장소 소스
`9a9825b32ae47f5abcfdbbc2af1b8f7103cabecd`에서 로컬 업로드 서명 AAB 후보를 생성하고,
4개 ABI·target 36·실제 병합 manifest·업로드 서명·운영 주소/광고 설정·사진/Material font를 검증했다.
AAB SHA-256은 `968066c227bf77dfa7ba210cbdd7b3d310c5daa5c2e189514a60543f104086e0`다.
[정확한 후보 증거](qa-evidence/20260930/android-scroll-inset-signed-candidate.json)를 확인한다.
최신 native 제품 소스도 `9a9825b…`다. 상태 표시줄 겹침을 추가 수정한 새 QA APK `3fa88a…`는
동일 QA 서명과 실제 설치 해시를 확인했지만 기기에 다른 앱이 foreground여서 스크롤 재검사는 중단됐다.
아래 6개 확대 조합과 시각 검토는 앞선 native 소스 `0d91c27…` / APK `8d117e…`의 증거다.
[새 APK의 검증 한계](qa-evidence/20260930/native-scroll-inset-candidate.json).
Play versionCode 대조·최종 제출 artifact 확정·업로드·공개는 아직 수행하지 않았다. 이후 증거/문서 변경은
후보의 전체 소스 SHA에 포함되지 않는다. 문서만 변경해도 Actions의 exact
full SHA 계약이 바뀐다. `capture.commit`을 새 SHA로 덮어써 기존 증거를 재사용하지 말고,
제출할 소스를 고정한 뒤 실제 캡처·검토·발급·빌드 절차를 따른다.

공개 Git 게시·push는 이전 자동 승인 검토의 거절로 보류 중이다. 로컬 검증 성공은 게시 승인이 아니며
이 문서 수정은 해당 차단을 해제하지 않는다. 거절 이유는 공개 저장소 `torisKR/senior-club`에 소스·이미지와 정제된 배포/QA 증거를 게시할 동의가 확인되지 않았기 때문이다.
현재 소스의 hosted workflow 실행·스크린샷 증거 발급·공개 제출도 완료로 취급하지 않는다.

## 확인한 운영 환경과 검증 범위

| 대상 | 현재 증거 | 증거의 한계 |
| --- | --- | --- |
| API | 서울 AWS ECS `senior-club-api:25`, running 1 / rollout COMPLETED, 공개 HTTPS 진입점은 CloudFront | 실제 Kakao provider 로그인은 앞선 task 24에서 확인했다. task 25의 readiness·기존 로그인 거절·익명 인증 경계 통과가 provider 재검증을 대신하지 않는다. |
| DB | Amazon RDS PostgreSQL 18.3, 공개 접근 해제, encrypted, 7일 backup, deletion protection. task 25 새 연결의 TLS 1.3·인증서 검증과 migration 10개 / 테이블 35개 일치 | private subnet 이전·Multi-AZ·전체 업무 row 검증은 완료하지 않았다. PITR 훈련은 복구 DB의 read-only migration/catalog 비교와 임시 자원 정리까지다. |
| 웹 | `https://senior.toris.kr`, Vercel `dpl_FumS2oKgsfdmRXbSCESNJrtRPRet`. 공개 페이지·인증 경계·자체 호스팅 Pretendard·사진 검사 통과 | 로컬 역할 UI E2E는 외부 Kakao verifier를 대체했다. 운영 웹의 실제 provider callback·HttpOnly cookie·로그아웃 E2E는 별도다. |
| Native 정적 검사 | mobile 354 tests / 46 files, TypeScript·scoped ESLint 통과. 기본/큰 글씨 토큰, 하단 탐색·inset·image slot과 고정 스크롤 viewport 검사 | 테스트 계산과 mocked 컴포넌트 결과는 실제 기기 렌더링·공급자 동작·Play 승인 증거가 아니다. |
| 앞선 실기기 QA APK | SHA-256 `8d117e63324d4de82c4550f2c2ced5e283a528704b07459bec80b7ae2014bad5`, 0.1.1 / versionCode 212215980 / target API 36 / arm64. 설치 base APK hash 일치 | standalone release 모드지만 기존 기기 데이터를 보존하기 위한 debug certificate 서명이다. 새 상태 표시줄 수정의 runtime 검증이나 Play upload/signing AAB가 아니다. |
| 실기기 Native | Galaxy M33 / Android 16, core 8개와 기본/큰 글씨 × 시스템 배율 1.0 / 1.3 / 2.0의 6개 조합 통과. 확대 탭 icon 정렬·5개 selected 상태, 홈/목록 16:9와 상세 3:2 실제 사진 측정·픽셀 검토 | 임시 글자 설정 원복. 실제 앱 dark palette, 전체 화면·스토어 screenshot 승인, 최신 APK의 provider 재로그인·SMS·FCM·Plus 구매를 포괄하지 않는다. |

운영·기기 결과는 [QA 보고서](QA_PRODUCTION_20260930.md),
[모바일 수정 기준과 검증](MOBILE_DESIGN_REVISION_20260930.md), [운영 런북](DEPLOYMENT.md)을 따른다.
주제 사진 7개는 웹·앱에서 byte 단위로 같고, 실제 서버 사진이 우선이며 fallback은 참고 이미지로 표시한다.
앞선 서명 AAB의 `android-signed-candidate.json`과 `android-latest-signed-candidate.json`은 historical
후보 증거이며 최신 상태 표시줄 수정 artifact가 아니다.

## 현재 release 경로와 strict gate

현재 release는 [direct Gradle 절차](ANDROID_DIRECT_RELEASE.md)와
[production workflow](../.github/workflows/android-play-production.yml)를 사용한다. Node 24 / pnpm 9.14.2,
잠금 의존성, Expo prebuild 후 JDK 17의 `:app:bundleRelease`로 정확한 AAB를 생성한다. 기존 upload
keystore를 사용하고 versionCode는 실제 Play 이력과 비교해 할당·업로드 직전 재확인한다.
EAS build/credentials/submit과 원격 autoIncrement는 현재 release 경로가 아니다.

모든 모드(build-only, production draft, internal draft, `binary_update=true`)는 **동일한 strict
스크린샷 증거와 전체 production preflight**를 통과해야 한다. binary update의 기존 등록정보 유지가
gate 생략을 허용하지 않는다. issuer run은 동일 저장소·main·첫 attempt·성공·정확한 full source SHA에
묶인 `android-play-final-screenshots-<SHA>` artifact여야 한다. 자세한 전달 계약은
[현재 인수 문서](PLAY_UPLOAD_HANDOFF.md)의 상단을 따른다.

사람이 실제 검토한 manifest·PNG·ZIP과 원래 여섯 attestations를 보존하고, 검토한 사람이 직접
`manual_review=true`로 발급 workflow를 실행한다. QA 성공·checksum·자동 검사만으로 시각 검토나
심사자 접근 확인을 추정하거나 attestations를 생성하지 않는다. manifest는 Git 밖의 artifact로 전달한다.

`release:android:preflight`는 자산/문구 규격, production config, 공개 endpoint, 후보 screenshot 규격과
최종 screenshot provenance를 검사한다. 문구 규격 통과가 내용의 정확성이나 Data Safety/App access
제출 완료를 뜻하지 않는다. 생성한 AAB의 package/versionCode/versionName/target SDK 36 이상,
병합 manifest·권한·광고 consent metadata·실제 bundle endpoint·모든 entry 서명·upload certificate는
별도 검증한다. Play app-signing certificate와 실기기 provider/결제 수용도 별도다.

마지막 전체 preflight 실행 소스 `1babf95749bb7995cd06e41ad20c92a87cd25e2b`에서는 5개 중 2개 단계가
실패했다. 자산/문구·5개 Material glyph·production config와 과거 후보 PNG 규격은 통과했지만,
공개 `/privacy`의 공급자 처리정보 미확정 문구와 최종 screenshot manifest 부재가 출시를 차단한다.
API readiness·약관·계정 삭제 주소는 통과했다. [소스와 결과 증거](qa-evidence/20260930/android-release-preflight.json).
아래 공급자·운영·Play 수용 조건 전체가 이 두 실패 단계만으로 축약되는 것은 아니다.

`submit_to_play=false` 수동 production dispatch는 build-only다. 명시적 제출은 일반 production/draft,
internal/draft이며 `binary_update=true`와 `submit_to_play=true`의 조합은 production/completed다.
업로드 후 Play가 반환한 versionCode/SHA-256과 committed track read-back까지 일치해야 전송 성공이다.
draft 전송 성공을 공개 출시나 전체 정책 수용 완료로 표현하지 않는다.

`deploy-main.yml`의 Android job은 backend·sites-package 성공 뒤 **수동 실행에 exact screenshot run ID가
있을 때만** build-only로 호출된다. push만으로 Android 후보를 자동 생성하지 않는다. 웹 Vercel 배포
증거는 sites-package 성공과 구분한다. `android-play-internal.yml`에도 screenshot run ID를 필수 입력으로 받아 전달하고
`actions: read`를 부여했다. production과 internal의 계약 검사가 통과했지만 hosted 실행 증거는 아직 없다.

## production 제출에 남은 실제 수용 조건

1. **카카오와 심사자 접근**: 제출 artifact의 upload/Play signing certificate에 맞는 Kakao key hash를
   확인하고 native 로그인·복원·로그아웃을 검증한다. 운영 웹의 실제 provider callback/cookie/로그아웃도
   별도 검증한다. Play App access에는 실제 사용할 수 있는 Kakao 심사 계정과 동의·온보딩·신청 상태,
   승인된 채팅·후기 접근 절차를 제공한다. 과거 SMS OTP 계정/수신 안내를 사용하지 않는다.
2. **선택형 Firebase 번호 인증**: 현재 Auth 초기화가 `BILLING_NOT_ENABLED`로 거절됐고 실제 SMS/번호
   linking은 미검증이다. 승인된 결제 계정·Phone provider/KR SMS region policy·ECS Admin ADC,
   제출/Play signing SHA 등록 후 실제 SMS·Play Integrity/reCAPTCHA·만료·재발송·backend linking 및
   실패/취소 정리를 확인한다. 선택 기능의 미완료를 Kakao 로그인 자체의 실패로 표현하지 않는다.
3. **알림과 결제**: 현재 EMAIL/SMS outbox/FCM 채널은 disabled다. 제공할 채널의 실제 credential·수신과
   실패 처리를 확인하고, FCM foreground/background/terminated 수신·탭 allowlist·권한 거절·token 해제를
   검증한다. 선택 Firebase Phone Auth와 Twilio SMS outbox는 별개다. AdMob consent/privacy options와
   실제 광고 설정, Play 상품 `seniorclub.remove_ads` 활성화·구매·취소/보류·복원·광고 제거를 확인한다.
   테스트 광고 표시나 단위 테스트가 production 광고/결제 성공을 증명하지 않는다.
4. **TLS와 DB 운영**: CloudFront→ALB는 아직 HTTP이며 서울 ACM certificate는 PENDING_VALIDATION이다.
   [origin TLS 인수 절차](ORIGIN_TLS_HANDOFF.md)대로 승인된 DNS/ACM 설정과 HTTPS 전환·rollback·새
   연결을 검증한다. 공개 client HTTPS와 DB strict TLS 통과를 전체 경로 암호화 완료로 선언하지 않는다.
   역할 DB 통과·운영 catalog 일치·PITR metadata 훈련을 보존하고, 업무 데이터 복구/운영 교체 범위와
   복구 시 삭제 상태 재적용·백업 보유·장애 대응 책임을 실제 운영 수용 기준에 맞춰 확인한다.
5. **역할별 기능·UGC·삭제**: 회원/담당 리더/다른 리더/관리자의 실제 운영 웹·앱 신청/취소/승인/참석,
   게시글·댓글·후기·채팅·신고·차단/해제·관리자 처리를 끝까지 확인한다. 외부 verifier를 대체한 local
   PostgreSQL/UI E2E 통과가 운영 provider와 역할 E2E를 대신하지 않는다. 약관 동의 전 작성 차단,
   콘텐츠/사용자 신고 구분, 서버 응답·실시간 전송의 차단 효과와 운영 처리 책임을 유지한다. 앱/공개 웹의
   삭제 요청→즉시 session/푸시 해제→7일 취소→worker 삭제·비식별화·로그/백업 처리를 확인한다.
6. **등록정보와 정책**: `ko-KR` 설명과 0.1.1 릴리스 노트는 Kakao-only·선택 연락처에 맞췄고,
   `DATA_SAFETY.md` 초안과 `PLAY_STORE.md`도 실제 AdMob·Play Billing·FCM·텍스트 UGC에 맞게 보완했다.
   AAB의 SDK property 버전도 기록했지만 실제 traffic·Console 답변 확정을 대신하지 않는다.
   광고 포함은 `예`다. 실제 SDK 수집/공유·목적·선택성,
   운영 주체/위탁처리자·보유·삭제 SLA·동의 문서 버전과 공개 지원/개인정보 메일 수신을 확정한다.
   App access·Data Safety·공개 privacy/account-deletion URL·콘텐츠 등급·성인 대상/UGC 선언을 실제
   Console에서 확인한다. `PLAY_UPLOAD_HANDOFF.md`의 2026-07-30 부분은 historical 기록이다.
7. **최종 artifact와 Play 수용**: 최신 고정 소스의 signed AAB, 실제 Play 최대 versionCode와 signing,
   동일 SHA의 사람 검토 screenshot artifact를 확보한다. 지역/가격·신규 계정 비공개 테스트 적용 여부,
   App Bundle Explorer·pre-launch report의 crash/ANR/권한/접근성 문제와 심사자 기능 접근을 확인한다.
   승인된 제출의 exact artifact/track/status read-back 후에만 해당 단계 성공을 기록하고, 공개 rollout
   승인·게시 후 vitals/신고/삭제/outbox 모니터링 책임까지 완료한다. 모호한 upload는 상태를 대조한 뒤
   새 실행을 결정하며 workflow rerun·암묵적 latest 선택·다른 artifact 승격을 사용하지 않는다.

이미 통과한 broad suite를 문서 수정만으로 반복할 필요는 없다. 제품/배포 범위가 바뀌거나 새로운
실패·미해결 조건이 생기면 관련 검증과 필요한 release gate를 수행한다. 현재 남은 실제 공급자·운영·정책·
artifact 수용 조건을 static pass로 대체하거나 production 목표를 이미 끝난 검사로 축소하지 않는다.
