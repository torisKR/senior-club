# 운영 배포 및 Android 재검사 — 2026-09-30

Galaxy M33 / Android 16에서 Android 디자인 QA APK `8d117e…`의 로그인 복원·프로필·5개 탭·사진 슬롯과 6개 글자 확대 조합을 검사했다. 기본 글자와 하단 탐색을 조정하고 실기기에서 발견한 확대 아이콘 정렬 문제도 수정했다. 이후 스크롤 상태 표시줄 겹침을 수정한 새 APK `3fa88a…`를 설치했으며 아래 추가 절에 검증 한계를 기록했다. 웹은 새 Vercel production에 배포해 Playwright CLI 검사가 통과했다. 전체 출시 검증 완료는 아니며 Firebase SMS 설정·origin TLS·별도 Play 조건이 남아 있다.

## 추가 상태 표시줄 수정과 최신 후보

앞선 모임 목록 캡처를 직접 검토하면서 검색창이 스크롤 시 상태 표시줄 뒤로 올라가는 문제를
발견했다. source `9a9825b32ae47f5abcfdbbc2af1b8f7103cabecd`에서 상태 표시줄 inset을 고정 viewport로
옮기고 스크롤 내용에는 콘텐츠 여백만 적용했다. 공통 Screen과 모임·커뮤니티·대화방 목록·알림 목록이
대상이다. pagination/filter/refresh/keyboard/반응형 배치와 하단 탐색은 보존했다. 모바일 354개 /
46 files, TypeScript·scoped ESLint가 통과했고 공통 Screen 5개·discovery viewport 4개 회귀도 통과했다.

새 release-mode QA APK는 `apps/mobile/build-output/android-scroll-inset-9a9825b3/app-release.apk`,
SHA-256 `3fa88ac99743a0ff593a697b500cdfb99973461139d72eed30ac36263b4a04a7`, 64,126,775 bytes다.
기존 QA 서명 일치·compiled manifest·package/version/target36·7개 사진/Material font·운영 주소를
확인하고 데이터를 유지하는 업데이트 후 실제 설치 해시 일치를 확인했다. 설치 명령은 timeout으로
종료했으나 provider 상태를 먼저 대조해 설치 완료를 확인했으며 중복 설치하지 않았다.
현재 다른 앱이 foreground여서 입력 guard가 새 실기기 스크롤 검사를 중단했다. 새 APK의 runtime
시각/스크롤 QA는 미완료이며 아래 `8d117e…`의 검사 결과를 새 APK 성공으로 바꾸지 않는다.
[새 native 후보 증거](qa-evidence/20260930/native-scroll-inset-candidate.json).

같은 source에서 생성한 최신 upload-signed AAB 후보는
`apps/mobile/build-output/signed-candidate-9a9825b32ae4/app-release.aab`, SHA-256
`968066c227bf77dfa7ba210cbdd7b3d310c5daa5c2e189514a60543f104086e0`, 93,679,910 bytes다.
4개 ABI·target36·pinned bundletool·전체 서명·compiled manifest·운영 설정·동일 사진/font와 SDK
property metadata를 검증했다. [최신 서명 후보 증거](qa-evidence/20260930/android-scroll-inset-signed-candidate.json).
Play max version/signing/provider·최종 screenshot 검토·hosted run·업로드는 아직 없다.
아래 `8f25f7d…` AAB는 상태 표시줄 수정 전 후보로 보존한다.

## 실제 배포

- API: 서울 ECS `senior-club-api:25`, running 1, rollout `COMPLETED`, automatic rollback 활성화.
- Image: `sha256:a7c01a4561a39478742d0298ea8d2143c09cf2b579d0e9a0e321d60d20891314`.
- API: https://d33totqtaqpyfs.cloudfront.net
- Web: https://senior.toris.kr, Vercel `dpl_FumS2oKgsfdmRXbSCESNJrtRPRet`.
- QA APK: `apps/mobile/build-output/android-design-qa-0d91c27/app-release.apk`, 0.1.1 / versionCode 212215980 / target API 36, arm64.
- APK SHA-256: `8d117e63324d4de82c4550f2c2ced5e283a528704b07459bec80b7ae2014bad5`, 64,126,243 bytes. 기기에 설치된 base APK 해시가 이 값과 일치했다.
- APK는 standalone release 모드이며 debuggable=false다. 기존 기기 데이터를 보존하려고 **debug certificate로 서명한 QA 빌드**다. Play upload/signing artifact나 제출 AAB가 아니다. 공식 테스트 광고 ID를 번들에서 확인했다. 최종 APK의 모임 화면에서 테스트 광고가 실제 표시됨을 확인했다. 광고 클릭은 0회다.

## 장애 원인과 수정

1. 실제 API는 Lambda가 아닌 ECS였다. Kakao 로그인 transaction의 `$queryRaw`가 `pg_advisory_xact_lock`의 void 결과를 처리하다 Prisma P2010으로 실패했다. `$executeRaw`로 변경하고 실제 Postgres 재현·동시 로그인 회귀를 통과했다. 운영 카카오 로그인이 성공했고 새 API task의 ERROR 로그 개수는 0이었다.
2. 프로필 PATCH 후 과거 session의 이름/번호가 cache를 덮어쓰던 문제를 수정했다. profile cache와 session metadata를 함께 갱신하며 과거 profile GET이 새 저장 결과를 덮어쓰지 않게 했다.
3. 앱 초기 session 복원과 보호 화면 API가 같은 refresh token을 두 번 소비하는 경쟁 조건을 실제 HttpClient 회귀로 재현했다. session 소유자의 단일 refresh Promise로 합쳤다.
4. 운영 웹에서 SSR의 `/index`와 browser의 `/` 경로가 home navigation markup을 다르게 만들어 React #418이 발생했다. shell의 home 경로를 정규화했다. 세 회귀 테스트가 수정 전 실패하고 수정 후 통과했다.
5. Android 지난 모임 카드의 남은 좌석·신청 안내·지난 승인 대기 badge를 종료/취소 상태에 맞게 수정했다. 최종 설치 APK의 접근성 계층에 “종료된 모임”을 확인했다.
6. Expo source introspection만으로 APK 권한을 판단하지 않도록 compiled merged manifest gate를 추가하고 CI 회귀와 production Gradle build 이후 gate에 연결했다.
7. 운영 DB URL이 `sslmode=verify-full`을 사용하도록 시작 시 검사한다. 검증을 약화시키는 옵션, 중복/모호한 TLS query parameters와 `NODE_TLS_REJECT_UNAUTHORIZED=0`을 거절한다. 검증 오류에 DB URL을 노출하지 않는다. 이 변경은 API task 25에 배포했다.
8. 추가 ADB 검사에서 모임 상세의 요약·본문이 같은 문장으로 중복 표시되고 종료 모임에도 남은 자리를 안내하는 문제를 확인했다. 동일 요약은 생략하고 신청 불가능한 모임은 참여 인원·전체 정원만 표시한다.
9. 격리된 실제 웹 QA에서 보호 링크의 Next prefetch와 mounted session 조회가 같은 refresh token을 동시에 소비했다. 엄격한 재사용 거절 뒤 continue 응답이 쿠키를 제거해 인증 성공/실패가 섞였다. 브라우저의 session 조회·로그아웃을 공통 요청과 Web Locks로 조정하고, 보호 페이지의 복원은 `/auth/continue`의 실제 mounted component에서 수행하도록 변경했다. legacy `/api/auth/continue`와 미리보기는 토큰 회전·쿠키 변경을 하지 않는다. 이동 경로·onboarding·재시도·외부 주소 및 인증 순환 차단을 검사했다. 실제 UI의 수정 후 판정은 [역할 UI QA](QA_ROLE_UI_20260930.md)를 확인한다.

## 최신 웹 세션 수정과 재배포

웹 소스 `9a376d96f4e8a955fa29ad305c480d2d156d321b`를 고정한 별도 사본에서 production에 배포했다. 원격 Turbopack compile과 READY 상태를 확인했고 실제 canonical 주소에서 Playwright CLI 공개 화면·이동·글자 크기 27개, 익명 인증 경계 15개, legacy prefetch 무회전·안전한 익명 continuation 11개를 모두 통과했다. page/console error와 실패한 resource는 0개다. 실제 웹 provider login/token exchange와 운영 유효 계정의 restore는 이번 live 검사의 범위가 아니다. [새 웹 배포·세션 경계 증거](qa-evidence/20260930/web-session-live.json).

격리된 실제 Nest/Prisma/Next HTTPS 환경에서 회원·리더·관리자 전체 19개와 동일 context 두 tab restore/logout 5개 검사가 통과했다. mounted reader는 모두 인증된 회원을 받았고 access 제거 후 refresh는 한 번만 회전했다. 보호 화면은 새 document navigation으로 실제 SSR에 다시 도달했다. 외부 Kakao identity verifier만 합성 신원으로 대체했다. [실제 역할 UI 보고서](QA_ROLE_UI_20260930.md). 이후 Android 디자인 수정 소스는 이 웹 검증 manifest에 포함되지 않는다.

## 최신 Android 디자인과 실기기 판정

최종 Native source는 `0d91c279bb8d14c210a9dbac89326da9234a8428`이며 APK SHA-256은 `8d117e63324d4de82c4550f2c2ced5e283a528704b07459bec80b7ae2014bad5`다. Gradle 강제 JS 재번들·release build 중 제품 소스 hash가 유지됐고, 기존 QA certificate와 같은 서명·package/version/target36·compiled manifest 34 permissions/10 exports·production endpoint와 테스트 banner·동일 사진 7개·Material font byte 일치를 확인했다. 기존 데이터를 유지하는 install-r 후 설치 APK hash가 일치했다.

- 기본 caption 13/body 16/title 24와 Regular/SemiBold 역할을 적용했다. 프로필·선택 번호 인증·채팅 입력란도 body 토큰을 사용한다.
- 하단 탐색 기본 row는 실제 60.09dp였다. 실제 시스템 하단 inset을 한 번만 적용하며 각 탭의 touch 폭은 76.8dp다. 시스템 배율 2.0에서 라벨 줄 수 때문에 icon 줄이 달라지던 문제를 실제 캡처에서 찾고 고쳤다.
- 기본/큰 글씨와 시스템 배율 1.0/1.3/2.0의 6개 조합에서 5개 icon의 Y 좌표가 모두 같았다. row 높이는 각각 60.09/62.22/65.07/67.91/108.09/115.91dp이며 큰 글씨 선택은 재시작 후 유지됐다. 임시 font scale·앱 큰 글씨·시스템 night mode를 원래 1.0/false/no로 복구했다.
- 홈 사진의 실제 slot은 약 1.7794, 16:9와 rounding 범위에서 일치했다. 홈/로그인/목록 16:9와 상세 3:2, fallback·세로 원격 이미지·legacy height 충돌은 component 검사도 통과했다. 홈의 정상/최대 확대 캡처를 직접 보고 줄바꿈·사진·아이콘 정렬을 확인했다.
- 최신 현재 프로필 기준을 private local에 보관하고 여러 cold start 뒤 이름·연락처·지역 일치를 확인했다. 예전 baseline의 연락처만 달랐으므로 예전 값을 복원하지 않았다. 실제 프로필 저장·SMS 요청은 0회다.
- 최종 8개 core 검사와 6개 확대 조합이 통과했다. 5개 탭 이동에 통신 오류가 없고 마지막 현재 PID의 FATAL EXCEPTION/ReactNativeJS Error/P2010은 모두 0이었다.
- 앱은 기존 app.json의 `userInterfaceStyle: light`를 유지한다. 시스템 night mode에서 layout이 유지되는 검사이며 앱의 dark palette를 실제 검증한 결과는 아니다. 3버튼 탐색 실기기 384dp이며 다른 폭 360/393/430dp와 gesture inset은 unit 계산 범위다.
- 최종 APK에서 지난 모임 목록 사진 1.7762(16:9)와 상세 사진 1.5(3:2)의 실제 slot을 측정하고 두 화면의 pixels를 직접 확인했다. 모임과 프로필 변경은 0회였다. 기기가 자동 Dozing에 들어갔던 검사는 wake와 대상 앱 실행 뒤 새 foreground guard로 재개했다. QA가 만든 remote UI dump는 제거했고 개인 캡처는 private local에만 보관했다.
- 탭 변경 뒤 선택 배경이 사각형으로 보이던 문제는 그래픽 wrapper의 native view 유지와 높이 절반인 14dp radius로 보완했다. 최종 5개 탭의 실제 캡처에서 둥근 선택 배경을 확인했다. 렌더러 내부 원인을 확정한 것은 아니다.

최신 소스의 mobile 전체 348 tests / 45 files, TypeScript와 scoped ESLint, 하단 탐색 12개 회귀가 통과했다. 이 APK는 기존 QA 데이터를 유지하는 debug-certificate QA 빌드다. 최종 Play 제출 artifact나 모든 화면의 시각 승인을 의미하지 않는다. [실기기·확대·이미지 검증 증거](qa-evidence/20260930/native-design-live.json), [디자인 기준과 구현](MOBILE_DESIGN_REVISION_20260930.md).

## 앞선 인증 APK의 ADB 검사

아래 provider 로그인·운영 프로필 저장 검사는 앞선 인증 QA APK `bd35379f…`와 task 24에서 수행한 결과다. 이전 공통 디자인 `778ae626…` APK의 별도 재검사는 다음 절에 기록한다.

| 검사 | 결과 |
| --- | --- |
| 이 기기 로그아웃 → Kakao-only 로그인 화면 | 통과, 다른 로그인 수단 없음 |
| 필수 동의 없이 로그인 클릭 | 서버 인증으로 진행하지 않고 동의 안내 표시 |
| 필수 동의 → 공식 kauth.kakao.com의 기존 계정 계속하기 → 앱 복귀 | 실제 카카오 재로그인 성공 |
| 새 세션에서 force-stop / cold start | 로그인·원래 이름·연락처·지역 유지 |
| 앞선 인증 QA APK 업데이트 후 해시 비교 / force-stop / cold start | 일치, 로그인 복원 성공 |
| 프로필 편집 원본 비교 및 원본 값으로 운영 API 저장 | 원본 비교 PASS, 저장 성공 표시 |
| 선택형 Phone Auth 동의 전 | 문자 요청 버튼 비활성화 |
| 정확히 `123` 입력을 확인한 뒤 인증 요청 | 로컬 번호 오류 안내, 실제 SMS 발송 없음 |
| 인증 화면 이탈 정리 | 프로필·카카오 session 유지, 동의/입력 시험 상태가 정상 화면으로 복구 |
| 홈·커뮤니티·모임·채팅·내 정보 이동 | 정상, 서버 데이터 및 실제 빈 상태 표시 |
| 운영 모임 필터 | 예정 0개, 지난 3개, 종료 상태 표시; 임의 모임 생성 없음 |
| 큰 글씨 모드 | 주요 컨트롤·탭 접근 가능, 검사 후 원래 설정 복구 |
| 앞선 인증 QA 앱 PID 로그 | FATAL EXCEPTION 0, ReactNativeJS Error 0, P2010 0 |

앞선 인증 QA의 cold activity start WaitTime은 959ms였다. 이는 Android Activity 시작 시간이며 사용자 화면 준비 시간이나 p95 성능 수치가 아니다. 이 실행은 부하 시험이 아니다. task 24 readiness 7회는 모두 200 / database ok, 클라이언트 왕복 중앙값 34ms였다. TLS 설정 검사만 추가한 task 25 readiness 3회도 모두 통과했고 중앙값 36ms였다. task 25의 phone/email/Google 로그인은 403, 비인증 프로필/번호 proof API는 401, 해당 새 task의 ERROR 로그는 0이었다. 실제 provider 로그인은 task 24와 앞선 인증 QA APK에서 검사한 결과이며 task 25에서 다시 수행했다고 주장하지 않는다.

## 이전 공통 디자인·이미지와 APK 재검사

웹과 앱은 `shared/design/foundation.ts`의 색상, 버튼 역할, 카드·터치 치수를 함께 사용한다. 화면 폭과 탐색 방식은 플랫폼 adapter에서 적용한다. 밝은 테마의 주요 버튼 대비는 최소 4.76, 어두운 테마는 최소 6.69이며 어두운 selected 배경의 보조 글자 대비도 4.53 이상으로 수정했다. 이는 코드의 WCAG 대비 계산이며 screenshot 미감 승인이나 실제 스크린리더 사용성 시험을 대신하지 않는다.

웹의 주제 사진 7개를 그대로 앱에 포함했고 SHA-256이 모두 일치했다. 유효한 서버 사진이 우선이며 실패하면 공용 주제 사진으로 한 번 fallback한다. category fallback에는 접근성 설명과 “주제 참고 이미지” caption을 제공한다. 목록의 source/recycling key가 바뀌면 오류 상태를 초기화하고 이전 이미지 callback이 새 항목을 실패시키지 않도록 회귀 검사했다. 사진 파일의 pixels는 수정하지 않았다.

이전 `778ae626…` APK는 데이터를 유지하는 `install -r`로 교체했다. force-stop 후 로그인된 홈과 원본 프로필 비교가 통과했고 큰 글씨를 켜고 끈 뒤 원래 설정을 복구했다. 5개 탭과 참고 이미지 caption을 XML로 확인했다. 공통 디자인이 동일한 직전 APK에서 커뮤니티 상세, 예정 0개·지난 모임, 종료 안내와 채팅 빈 상태도 확인했다. 최종 APK의 설명은 1회만 표시되고, 종료 모임에는 전체 정원·종료 안내가 있으며 남은 자리 문구와 신청 컨트롤은 없었다. 마지막에는 기본 글씨의 홈으로 복구했다. 최종 현재 PID의 FATAL EXCEPTION·ReactNativeJS Error·P2010은 각각 0이다. 이 8개 실기기 검사가 통과했다. Activity WaitTime은 1067ms이며 화면 준비 시간이나 부하 성능 수치가 아니다. 현재 APK에서 provider 재로그인이나 SMS 발송은 하지 않았다.

[공통 디자인·동일 사진 증거](qa-evidence/20260930/shared-design-assets.json), [새 APK 실기기 증거](qa-evidence/20260930/native-shared-live.json).

## 실제 운영 DB TLS 검증

운영 task 24와 같은 image·secret reference·network로 API 서버를 실행하지 않는 일회성 ECS 검사를 수행했다. 사용자 데이터 대신 현재 연결의 `pg_stat_ssl`만 읽었다. 서버 인증서 검증 결과 `authorized=true`, socket 및 PostgreSQL TLS 1.3, 잘못된 hostname 거절과 신뢰하지 않는 CA 거절을 확인했고 task는 exit 0으로 종료했다. task 25는 같은 DB secret 및 CA bundle을 보존하며 위 시작 검사를 추가했다.

[DB TLS 증거](qa-evidence/20260930/database-tls-live.json), [task 25 smoke 증거](qa-evidence/20260930/api-tls-live.json). 이 검사는 백업 복구·네트워크 private 전환·부하 성능을 증명하지 않는다.

## 운영 DB 공개 접근 해제와 스키마 검사

2026-09-30 16:18 KST에 RDS `PubliclyAccessible=false`, `available`, pending 변경 없음과 API readiness 200을 확인했다. 기존 endpoint·보안그룹·서브넷·DB secret을 유지하고 공개 접근 설정만 변경했다. encrypted, 7일 backup, deletion protection도 유지했다. API task 25에서 새 연결을 열어 VPC 내부 DNS와 socket, TLS 1.3 및 인증서 검증, 잘못된 hostname·신뢰하지 않는 CA 거절을 다시 확인했다. 변경 중·후 readiness 12회는 모두 200/database ok였고, 중앙값 79.1ms는 로컬 네트워크의 비부하 관찰이다. private subnet 이전이나 Multi-AZ 전환은 수행하지 않았다. [공개 접근 해제·새 연결 증거](qa-evidence/20260930/database-private-live.json).

별도의 운영 read-only / repeatable-read transaction에서 마이그레이션 이름·SQL SHA-256·완료 상태 10개와 테이블 35개가 로컬 소스와 일치했다. 무효 제약조건과 인덱스는 각각 0개였다. TLS 검증과 read-only 상태도 통과했다. 비즈니스 row를 읽지 않았으므로 사용자 데이터의 정확성이나 모든 Prisma 의미 차이를 검증한 결과는 아니다. [운영 스키마 메타데이터 증거](qa-evidence/20260930/database-schema-live.json).

동일 VPC에 암호화·비공개 PITR 복구 DB 1개와 전용 보안그룹 2개를 만들고, 고정한 2026-09-30 16:20:11 KST 시점으로 복구했다. API 서버·worker를 시작하지 않는 동일한 one-shot reader로 strict TLS 및 read-only 상태, SQL migration 10개, 테이블 35개, migration/catalog fingerprint와 집계의 운영 baseline 일치를 확인했다. 요청 준비 시작부터 스키마 증거까지 845.3초, 정리 완료까지 1148.0초였다. 16:51 KST에 복구 DB·전용 보안그룹 부재와 새 snapshot/retained backup 0개, 운영 DB available/private 및 7일 backup·deletion protection 보존을 확인했다. 원본 endpoint·secret·보안그룹·route는 이 훈련에서 변경하지 않았다. [실제 PITR 메타데이터 비교·정리 증거](qa-evidence/20260930/database-recovery-live.json), [복구 실행 범위와 런북](RDS_RECOVERY_PLAN.md).

이 훈련은 업무 row 대조, 전체 물리 블록 무결성, 운영 교체·failback·Multi-AZ/cross-region 복구나 snapshot restore를 검증하지 않았다. 위 시간은 한 번의 제한된 훈련 관찰이며 RPO/RTO SLA가 아니다. 비용 목표 $1은 청구 hard cap이 아니고 실제 청구액은 아직 확인하지 않았다.

## 실제 DB 권한·데이터 검사

Node 24 / PostgreSQL 17.11의 별도 disposable DB에서 migration 10개와 seed 이후 auth/events 9개, reviews 1개, safety 2개를 실행했다. **12 passed / 0 failed / 0 skipped**다. 이전 email OTP fixture를 카카오 전용 정책으로 수정했으며 외부 KakaoTokenVerifier만 deterministic test response로 대체했다. Nest 서비스·인증 guard·Prisma transaction·session 발급은 실제 코드다.

회원, 담당 리더, 다른 리더, 관리자의 조회/승인 권한과 거절 후 DB 상태, refresh 회전과 재사용 거절, onboarding 저장/잘못된 관심사 rollback, 신청 idempotency/과거 모임 신청 거절, 이메일 없는 회원의 알림 queue, 계정 삭제 시 session 폐기 및 재인증 후 취소를 검사했다. 후기 lifecycle과 신고/차단 concurrency도 실제 DB에서 통과했다. fixtures 정리와 전용 DB 폐기를 확인했다.

실행 안전성 guard 4개는 운영/외부 DB, URL 불일치, 외부 발송 설정, credential 상속 및 skip 결과를 거절한다. CI에는 같은 전용 DB job을 추가했다. [실제 local DB 검사 증거](qa-evidence/20260930/database-roles-local.json)의 source hash를 parent가 다시 확인했다. local 통과와 hosted CI 관찰은 별개이며 공개 저장소 push가 보류되어 hosted 실행은 아직 없다. 운영 데이터 변경, 실제 역할별 웹/앱 UI E2E나 외부 카카오 provider 증거로 보고하지 않는다.

ADB 조작은 fresh UI hierarchy와 현재 foreground package를 확인했다. 다른 앱이 화면을 차지하면 입력을 거절했다. 개인 프로필 원본·원시 logcat·provider UI는 비공개 임시 파일에만 보존하고 이 보고서에는 포함하지 않았다. 기기 알림 권한 등 기존 선호를 변경하지 않았다.

## 이전 공통 디자인 배포의 Playwright CLI 검사

4개 조건으로 각 5개 공개 페이지를 확인했다: Seoul 1440px 기본 글씨, LA 390px 큰 글씨+가짜 로컬 cache, UTC 360px 큰 글씨+날짜 경계, Seoul 390px 저장소 접근 차단. `/`, `/events`, `/clubs`, `/login?error=...`, `/privacy`와 client 이동·뒤로가기 및 font toggle을 검사했다.

- 공개 페이지 20개 + 화면 이동/설정 흐름 7개 통과.
- page error 0, console error 0, horizontal overflow 0, 실패 0.
- BFF session/interests 응답 200.
- 가짜 cache는 비인증 렌더링 fixture이며 실제 session으로 취급하지 않았다. 실제 계정/프로필 쓰기 0회.
- 원격 Next.js 16.3.4 Turbopack build와 실제 alias에서 검증했다. 로컬 webpack 결과로 운영 성공을 대신하지 않았다.
- [운영 웹 증거](qa-evidence/20260930/web-live.json), [API smoke 증거](qa-evidence/20260930/api-live.json).

이전 공통 디자인 배포의 첫 화면 흐름 검사에서는 `client events → home`에서 404 console error 2개가 나타났다. 리소스 경로를 수집하도록 보강한 재실행은 27개 검사, page/console error 0, HTTP 4xx/5xx 리소스 0으로 통과했다. 최초 오류의 리소스 경로는 수집하지 못했고 원인은 확정하지 않았으므로 특정 수정으로 해결했다고 보고하지 않는다.

별도 익명 인증 경계 15개가 통과했다. 필수 동의 누락/중복 거절, canonical Kakao 진입, 안전한 returnTo, host-only HttpOnly/Secure/SameSite=Lax intent cookie, state 불일치·취소, 기존 로그인 수단 410, 비인증 프로필 PATCH 401, 외부 Origin 403, non-JSON 415와 익명 logout cookie 삭제를 확인했다. provider 로그인·token exchange·실제 계정 쓰기·SMS 발송은 없다. [운영 인증 경계 증거](qa-evidence/20260930/web-auth-boundary-live.json).

웹 폰트는 native OTF와 같은 Pretendard 1.3.9의 공식 variable subset을 자체 호스팅한다. 92개 WOFF2와 CSS/license 2개 모두 운영 HEAD 200 및 immutable 1년 cache다. 홈에서는 13개 subset만 요청하고 제3자 font 요청이나 전체 font preload는 없었다. 공통 CSS의 primary/canvas/56px touch height도 실제 배포에서 일치했다. [운영 font·CSS 증거](qa-evidence/20260930/web-asset-contract-live.json).

1440px/DPR 1과 390px/DPR 2에서 `/`, `/clubs`, `/events?view=past`, `/events`를 각각 새 익명 context로 3회씩 측정했다. 전후 각 24개가 통과했고 image decode 실패·JS 오류·가로 넘침·관찰된 CLS는 0이었다. 390px의 사진 요청 폭은 1024에서 768로 줄었다. 커뮤니티 페이지 이미지 전송량 중앙값은 159,975 → 130,173 bytes였다. 반면 이전 웹은 지정 font를 실제 로딩하지 않았으므로 새 font의 첫 전송 208,728–341,844 bytes가 추가되어 전체 첫 방문 전송량은 증가했다. 로컬 네트워크의 비부하·비throttle Chromium 검사이며 field p75나 인과적인 속도 개선으로 보고하지 않는다. [전후 성능·이미지 증거](qa-evidence/20260930/web-performance-live.json).

## 코드와 artifact 검증

| 범위 | 통과 결과 |
| --- | --- |
| 웹 인증 수정 source `9a376d96…` | 529 tests / TypeScript / root ESLint / local production webpack build. 로컬 Turbopack은 포트 생성 제한으로 미검증 |
| API 최종 source | 381 passed, 24 skipped / TypeScript; TLS env 회귀 90개. runtime TLS source build와 배포 통과 |
| 실제 local PostgreSQL auth | migration 10개, auth regression 12개 |
| 추가 실제 local DB 역할/후기/신고 | auth/events 9 + reviews 1 + safety 2 = 12 passed, 0 skipped |
| DB 실행 안전성 guard | 4 passed; root ESLint와 CI YAML/전용 DB 계약 검사 통과 |
| 이전 모바일 공통 디자인 통합 source | 330 tests / TypeScript / ESLint; 이후 상세 표시 2개 수정의 TypeScript·scoped ESLint·native rebuild 통과 |
| 최종 Android 디자인 source `0d91c27…` | 348 tests / 45 files / TypeScript / scoped ESLint / 하단 탐색 회귀 12; 실제 APK 증거 참조 |
| 새 compiled manifest 회귀 | 35 tests; compiled AAB의 정확한 numeric enum도 검사 |
| compiled release manifest | allowlist 권한 34개, 정확한 exported component 10개 |
| Play production workflow 계약 | 8 tests / internal wrapper 계약 / 세 workflow actionlint; exact screenshot 발급·수신 Python 계약 19 tests. hosted 실행 미관측 |
| 최종 root ESLint / diff whitespace | 통과 |
| 최종 native APK | Gradle release build / apksigner / 설치 hash 일치 |

manifest export 10개는 intent가 제한된 activity 4개와 권한으로 보호된 SDK component 6개다. Firebase reCAPTCHA/IDP callback을 임의 제거하지 않는다. camera/contacts/location/storage/SMS/audio 권한, unknown export, debug/backup/cleartext, 약화된 SDK protection을 거절하는 회귀가 포함된다. 이것은 최종 Play AAB 또는 모든 SDK 동작의 안전성을 포괄적으로 증명하지 않는다.

Android 디자인 수정 전의 `f513abe…` / AAB SHA-256 `99f577e…`는 historical 후보로
[당시 증거](qa-evidence/20260930/android-signed-candidate.json)를 보존한다. 최신 제품 후보로 재사용하지 않는다.

## 최신 서명 AAB와 출시 사전 검사

소스 `8f25f7dd366fe2e8a43f41b1060e6403e611cf4c`에서 기존 upload certificate로 서명한
최신 Android 디자인 AAB 후보를 생성했다. `0.1.1` / versionCode `212215980`, 4 ABI,
93,679,754 bytes이며 SHA-256은 `4a6bd77bd2a7aa6181036bdb6dbb1d7fdb36b35a2a33811c4f6e669b692d6355`다.
pinned bundletool·모든 entry 서명·certificate·실제 AAB manifest 34 permissions/10 exports·
공용 사진 7개/Material font byte 일치·production endpoint 및 banner 설정을 확인했다. Billing
9.1.0 / Firebase Auth 24.2.0 / Google Ads 25.0.0 / UMP 4.0.0은 이 정확한 AAB의 property metadata다.
SDK traffic·동의·광고 제공·전체 의존성 인벤토리를 검증한 결과는 아니다.
[최신 후보 증거](qa-evidence/20260930/android-latest-signed-candidate.json).

기존 QA APK와 기기 데이터를 보존했다. 이 후보의 기기 설치·provider 로그인·최신 Play versionCode
대조·최종 screenshot 검토·hosted CI·Play 업로드는 수행하지 않았다. 이후 release 검증기/등록정보
변경은 AAB의 전체 source SHA 밖에 있으며 제출 소스를 고정한 뒤 해당 exact-SHA 계약을 충족해야 한다.

현재 Material 탐색 구현을 예전 PNG require 검사로 잘못 거절하던 release gate를 수정했다.
TypeScript AST로 실제 layout→BottomNavigation→AppIcon 연결·다섯 destination·글리프·font loader를
확인하고 설치된 실제 TTF cmap에 모든 glyph가 있는지 검사한다. 내부 release wrapper의 screenshot
run ID/`actions: read` 누락도 수정했다. 검증기 회귀·workflow 계약 검사와 actionlint가 통과했다.

등록정보는 카카오 전용 로그인·선택 프로필 연락처로 고쳤고 0.1.1 notes를 추가했다. Data Safety는
실제 SDK/삭제 경로를 대조한 초안으로 갱신했으며 Console 확정 답변으로 취급하지 않는다.
소스 `1babf95749bb7995cd06e41ad20c92a87cd25e2b`의 전체 로컬 preflight는 자산/문구/Material font·
production config·과거 후보 PNG 규격을 통과했지만 `/privacy`의 공급자 처리정보 미확정과 최종
screenshot manifest 부재로 실패했다(2/5 단계). API readiness·약관·계정 삭제 endpoint는 통과했다.
두 실패 단계가 모든 production 수용 조건의 목록은 아니다.
[정제된 preflight 증거](qa-evidence/20260930/android-release-preflight.json), [현재 출시 인수 문서](PLAY_UPLOAD_HANDOFF.md).

## 남은 운영 설정과 별도 출시 조건

- Firebase `clubsenior-app`: actual QA SHA-1/SHA-256 등록 및 native rebuild 완료. Auth config 초기화는 `BILLING_NOT_ENABLED`로 거절됨. 사용할 결제 계정, Phone provider/KR region policy와 서버 Admin ADC가 필요함. 실제 SMS/번호 linking, Play signing SHA는 미검증.
- 웹 OAuth callback/HttpOnly cookie/로그아웃의 실제 계정 E2E는 별도다. Android Kakao 성공으로 이를 대체하지 않음.
- CloudFront→ALB는 HTTP. direct origin 403과 CloudFront prefix ingress는 적용했으나 origin DNS/ACM을 통한 HTTPS 전환은 남아 있음. Cloudflare DNS 로그인/권한이 필요하며 서울 ACM 인증서는 `PENDING_VALIDATION`. [정확한 DNS 레코드와 전환 순서](ORIGIN_TLS_HANDOFF.md).
- RDS 공개 접근 해제, encrypted/backup/deletion protection 및 변경 후 strict DB certificate verification 확인. 임시 PITR 복구 DB의 migration/catalog 비교와 리소스 정리까지 통과. 기존 서브넷 구성과 single-AZ는 유지하며 전체 업무 데이터 복구·가용성 훈련은 별도 범위임.
- 이메일/SMS outbox/FCM 채널은 disabled. 회원/리더/관리자 신청·승인·취소와 후기/신고는 위 local DB 범위를 통과했다. 외부 알림 수신, 실제 Plus 구매/복원, 역할별 운영 웹/앱 UI에서의 신청·취소/UGC/채팅/신고/관리자 E2E, 최종 서명 AAB/Play screenshot provenance와 Play 공개는 이번 재검사에서 완료하지 않음.
- 화면 구조·접근성 상태는 XML/DOM으로 검사했다. 최신 Android 홈의 정상·확대, 5개 탭 선택 배경, 모임 목록·상세 사진의 캡처를 직접 시각 검토했다. 전체 제품 화면·웹·스토어 screenshot의 미감 승인을 포괄하는 결과는 아니다.

[운영 런북](DEPLOYMENT.md), [선택형 번호 인증 설정](../apps/mobile/src/phone-verification/NATIVE_SETUP.md).
