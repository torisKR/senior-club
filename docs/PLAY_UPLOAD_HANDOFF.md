# Play Console 업로드 인수 문서

갱신: 2026-09-30 — exact screenshot evidence 전달 계약

현재 production release는 아래 전달 계약을 사용한다. 뒤의 2026-07-30 기록은 과거 인수 자료이며,
당시 `v5`, versionCode `6`, SMS 로그인 설명을 현재 출시 지침으로 사용하지 않는다.

## 소스 고정 후 screenshot evidence 전달

`capture.commit`을 Git 안의 manifest에 쓰고 다시 commit하는 방식은 사용하지 않는다. 모든 release
mode는 고정한 소스 SHA의 **별도 Actions artifact**를 받아 검증한다. `binary_update=true`도 같은
전달 helper와 전체 production preflight를 반드시 통과한다. 이전의 등록정보 유지 옵션은
screenshot 증거 생략 옵션이 아니다.

발급 계약은 코드에 고정돼 있고 dispatch 입력으로 바꿀 수 없다.

| 항목 | 필수 값 |
| --- | --- |
| 저장소 | `torisKR/senior-club`, issuer/consumer와 head repository의 numeric ID도 일치 |
| 신뢰할 발급 workflow | `.github/workflows/android-play-screenshot-evidence.yml` |
| 발급 실행 | `main`, `workflow_dispatch`, 동일한 full lowercase `head_sha`, 첫 attempt, completed/success |
| 발급자 | dispatch sender·actor·triggering actor·Release 작성자·asset 업로더가 동일한 GitHub `User`, PR/fork 실행 거절 |
| artifact 이름 | `android-play-final-screenshots-<full source SHA>` |
| artifact | 같은 run/repository/head SHA의 유일한 미만료 artifact, GitHub SHA-256 digest 필수 |
| release 입력 | `screenshot_evidence_run_id`만 제공. repository/ref/workflow/artifact-name override 없음 |
| receiver 권한 | `contents: read`, `actions: read`; storage redirect에 GitHub token 전달하지 않음 |

발급 workflow와 `issue-play-screenshot-evidence.py`도 구현했다. 사람이 검토한 ZIP을 같은 저장소의
고정 SHA 전용 **published prerelease asset**으로 올리면 발급 workflow가 입력을 검증해 위 Actions
artifact를 만든다. Release/asset 생성·업로드는 사람이 자신의 기존 계정으로 수행한다. workflow
token은 읽기 전용이며 Release를 만들거나 credential을 생성하지 않는다. Draft release 조회에 더
높은 접근 권한을 요구하는 경로를 피하기 위해 published prerelease만 받는다. 공개 저장소에서는
이 입력도 공개되므로, 개인정보를 제거하고 사용권을 확인한 screenshot만 업로드한다.
접근 조건은 [GitHub Release API](https://docs.github.com/en/rest/releases/releases)와
[Release asset API](https://docs.github.com/en/rest/releases/assets)의 공식 계약을 기준으로 한다.

현재 실제 수동 확인된 최종 입력·artifact·hosted run은 없다. 이번 작업은 로컬 코드와 offline
계약 검사만 수행했다. 증거가 없거나 review가 없으면 실패한다. `f513abe`는 변경 전 소스이며,
실제 캡처/발급/출시에는 **이번 workflow/helper를 포함해 고정한 다음 commit**의 full SHA를 사용한다.

발급 입력은 `source_sha`, numeric `release_id`/`release_asset_id`, 원본 ZIP의 `zip_sha256`, 사람이
직접 지정하는 `manual_review`다. `manual_review`의 기본값은 false다. helper는 GitHub dispatch
event에 기록된 원본 입력과 sender를 확인하고 환경 입력과 일치시킨다. 단순히 env에서 `true`를
만들어 전달하는 것으로는 통과하지 않는다. GitHub가 해당 저장소의 workflow dispatch 및 Release
업로드 권한을 가진 계정의 실행을 허용한다는 경계를 사용하며, 같은 계정의 `User` ID/login을 API로
다시 확인한다. 프로그램은 manifest의 attestations를 만들거나 보정하지 않는다. 실제 시각적
검토를 자동 판정하거나 GitHub 계정이 사람이 직접 클릭했는지를 증명하는 기능은 아니다.

입력 tag는 `android-play-screenshot-input-<SHA>`, asset 이름은 `reviewed-screenshots-<SHA>.zip`으로
고정한다. Release의 target_commitish와 lightweight tag의 commit이 모두 해당 SHA여야 한다.
immutable 입력은 **release ID + asset ID + 사람이 고정한 ZIP SHA-256**으로 지정하며, GitHub
asset digest와 다운로드 bytes도 일치해야 한다. Release의 서버 측 immutable 설정에 의존하지
않는다. 같은 이름을 삭제·재업로드하면 asset ID가 달라져 기존 입력은 실패한다. 다운로드 중
tag/source·asset metadata·release membership·run attempt 변경도 거절한다. 임의 URL, 저장소,
tag/ref, workflow 또는 artifact 이름을 입력하는 옵션은 없다.

발급 artifact ZIP의 루트는 다음처럼 구성한다. screenshot manifest와 PNG를 Git에 다시 commit하지
않는다. `manifest.example.json`의 상대 경로를 그대로 복사하지 말고 ZIP 루트를 기준으로 맞춘다.

```text
manifest.json
assets/
  phone-01-home.png
  ...
  tablet-7-01-home.png
  ...
  tablet-10-01-home.png
  ...
```

기존 schemaVersion 1을 유지한다. `assetRoot`는 `assets` 같은 manifest 하위 상대 디렉터리이고,
각 `sets[].files[].path`도 `assets/...png`다. `app.version`은 release의 app.json 값과 같아야 하며
`capture.commit`은 release SHA 전체 40자리와 같아야 한다. 실제 캡처 APK 파일명·SHA와 캡처 환경을
기록하고, 모든 PNG의 `sha256`을 넣는다. 기존 6개 수동 검토 항목은 **검토한 사람만** 실제 결과에
따라 설정한다. helper는 이를 읽고 검증하며 생성·수정하지 않는다. APK 해시의 실제 캡처 이력과
화면 사용권·개인정보·기능 도달 여부는 발급자의 수동 확인 책임이며 문자열 검사를 그 증명으로
대체하지 않는다.

producer와 receiver는 같은 archive 검사와 실제 Node strict validator를 사용한다. producer는
원본 manifest/PNG bytes만 발급하고, dispatch review 입력·human ID·release/asset ID·ZIP/manifest
digest의 receipt를 별도 `android-play-screenshot-review-<SHA>` artifact에 보존한다. 이 receipt는
screenshot artifact payload에 섞이지 않으며, review 값은 검증한 원본 입력을 기록한 것이다.

receiver는 API의 issuer workflow ID/path, 저장소 ID, run/ref/event/head SHA와 archive digest를 먼저
확인한다. 다운로드 중 rerun/expiry/교체도 거절한다. ZIP은 새 RUNNER_TEMP 디렉터리에만 풀고
traversal, symlink, 특수 파일, 숨김 경로, 중복 경로, 미선언 payload와 크기 초과를 거절한다. manifest 및 PNG
해시와 수동 확인 항목 검증 후 **기존 `validate-play-screenshots.mjs`**를 실행한다. 휴대전화 5~6장,
태블릿 각 4~8장, RGB/CRC/크기 등 기존 strict 조건도 그대로 적용된다.

release는 receiver가 출력한 manifest 경로를 전체 `release:android:preflight`에 전달한다. 이후
release evidence에 원본 manifest+assetRoot를 `reviewed-screenshots/`로 보존하고, issuer run/artifact
ID·digest와 manifest digest를 보존한다. 오래된 Git manifest나 최신 artifact로 대체하는 fallback은 없다.

로컬 계약 회귀 검사 (네트워크·Play API·실제 캡처/승인 생성 없음):

```bash
python3 -B -m unittest discover -s .github/scripts -p 'test_play_screenshot_*.py' -v
node --test apps/mobile/scripts/android-play-production-workflow.test.mjs
actionlint .github/workflows/android-play-screenshot-evidence.yml .github/workflows/android-play-production.yml
```

### 실제 업로드와 발급의 다음 명령 — 이번 작업에서 실행하지 않음

먼저 이 변경을 검토한 뒤 main에 반영하고 소스를 고정한다. 그 commit의 실제 서명 APK에서
캡처하고, 검토자가 manifest의 APK 해시·PNG 해시·6개 항목을 직접 확인한다. ZIP 디렉터리는 Git
밖에 둔다. 아래 placeholder는 실제 경로/ID로 바꿔야 한다. 테스트의 synthetic PNG/manifest는
출시 증거로 사용하지 않는다. 캡처부터 issuer 및 consumer dispatch까지 main이 바뀌면 새 SHA로
다시 준비한다. 이전 SHA를 임의 ref로 실행해 통과시키는 방법은 제공하지 않는다.

같은 **검토자 본인**이 기존 GitHub 계정으로 다음을 수행한다. 실제 화면 검토와 고정된 입력 준비를
마친 뒤 실행하며, 프로그램이 대신 수동 검토 사실을 만들어 넣지 않는다.

```bash
set -euo pipefail
release_source_sha="$(git rev-parse HEAD)"
git diff --quiet HEAD --
test "$release_source_sha" = "$(gh api repos/torisKR/senior-club/git/ref/heads/main --jq '.object.sha')"
reviewed_directory='<absolute reviewed directory outside Git>'
screenshot_zip="${reviewed_directory}/../reviewed-screenshots-${release_source_sha}.zip"
test ! -e "$screenshot_zip"
(cd "$reviewed_directory" && zip -X -r "$screenshot_zip" manifest.json assets)
screenshot_zip_sha256="$(shasum -a 256 "$screenshot_zip" | cut -d ' ' -f 1)"
screenshot_tag="android-play-screenshot-input-${release_source_sha}"

gh release create "$screenshot_tag" "$screenshot_zip" \
  --repo torisKR/senior-club --target "$release_source_sha" \
  --prerelease --latest=false --title "Android screenshot input ${release_source_sha}" \
  --notes 'Screenshot evidence input; no app binary or Play delivery.'

gh api "repos/torisKR/senior-club/releases/tags/${screenshot_tag}" \
  --jq '{id,tag_name,target_commitish,assets:[.assets[] | {id,name,digest,uploaderId:.uploader.id}]}'
```

위 metadata에서 exact Release/asset ID와 digest를 확인한다. 같은 이름의 asset을 overwrite하거나
다른 사람의 입력으로 교체하지 않는다. 검토를 실제로 마친 사람만 다음의 `manual_review=true`를
명시적으로 선택한다. producer는 이 입력을 event에서 재검증하며 기본 false를 승격하지 않는다.

```bash
screenshot_release_id='<verified positive release ID>'
screenshot_asset_id='<verified positive asset ID>'
gh workflow run android-play-screenshot-evidence.yml \
  --repo torisKR/senior-club --ref main \
  -f source_sha="$release_source_sha" \
  -f release_id="$screenshot_release_id" -f release_asset_id="$screenshot_asset_id" \
  -f zip_sha256="$screenshot_zip_sha256" -f manual_review=true
```

발급 run이 같은 head SHA에서 첫 attempt로 completed/success이며 exact screenshot artifact를
발급했는지 확인한다. 해당 **구체적인 issuer run ID**를 다음 release 입력으로 전달한다. 최신 run
자동 선택은 없다. 승인 후 실행할 consumer 명령도 이번 작업에서는 실행하지 않았다.

```bash
screenshot_issuer_run_id='<verified positive issuer run ID>'
gh workflow run android-play-production.yml \
  --repo torisKR/senior-club --ref main \
  -f screenshot_evidence_run_id="$screenshot_issuer_run_id" \
  -f binary_update=false -f submit_to_play=false
```

재사용 workflow 호출자도 `actions: read` 권한과 이 run ID를 명시적으로 전달한다. `deploy-main`은
push 시 API/Sites를 처리하고, Android 후보는 수동 dispatch에서 `screenshot_evidence_run_id`가
제공된 경우에만 동일한 검증 workflow를 호출한다. Android workflow를 직접 호출할 때 입력이
없거나 잘못되면 실패한다. `submit_to_play=false`여도 뒤의
versionCode 할당은 Play edit를 생성하므로 dispatch는 읽기 전용 작업이 아니다. AAB 서명·실제
binary 검사와 최종 Play 제출 승인은 이 screenshot 전달 검사와 별도다.

## 현재 로컬 서명 AAB 후보

2026-09-30에 소스 `8f25f7dd366fe2e8a43f41b1060e6403e611cf4c`에서 기존 upload keystore로
최신 Android 디자인을 포함한 AAB를 생성했다. `0.1.1` / versionCode `212215980`, 4개 ABI,
93,679,754 bytes다. SHA-256은 `4a6bd77bd2a7aa6181036bdb6dbb1d7fdb36b35a2a33811c4f6e669b692d6355`이며
파일은 `apps/mobile/build-output/signed-candidate-8f25f7dd366f/app-release.aab`다.

공식 pinned bundletool, 모든 entry의 서명 및 upload certificate, 실제 compiled AAB manifest의
권한 34개·exported component 10개, 공통 사진 7개와 Material font의 byte 일치,
production endpoint 및 설정된 banner를 확인했다. 기기의 기존 debug-signed QA APK와 데이터를
유지했다. 후보 AAB 설치·실제 provider 로그인·최신 Play versionCode 대조·최종 screenshot 검토·
Play 제출은 수행하지 않았다. 이후 release 검증기와 등록정보 변경은 이 후보의 전체 소스 SHA에
포함되지 않는다. 최종 고정 소스의 capture/build 계약을 다시 충족해야 한다.
[최신 후보 검증 증거](qa-evidence/20260930/android-latest-signed-candidate.json).

앞선 `f513abe6569f479a5e014ede29f4135e4650353e` / AAB SHA-256
`99f577e1e70c38806c86c1f4b1273891827243dc24937fc011ac0f937dd9598b`는 Android 디자인 수정 전
historical 후보다. [당시 증거](qa-evidence/20260930/android-signed-candidate.json)를 보존하지만
현재 제출 후보로 재사용하지 않는다.

검증기/등록정보를 수정한 소스 `1babf95749bb7995cd06e41ad20c92a87cd25e2b`에서 전체 로컬
preflight를 실행했다. Material font/자산·문구·production config·과거 PNG 규격은 통과했고,
공개 개인정보 페이지의 공급자 처리정보 미확정과 최종 screenshot manifest 부재로 2/5 단계가
실패했다. [실제 소스와 단계별 결과](qa-evidence/20260930/android-release-preflight.json).
내부 wrapper도 필수 screenshot run ID와 `actions: read`를 전달한다. hosted run이나 사람의
승인 증거를 새로 만들거나 기존 capture SHA를 바꾸지는 않았다.

---

## 2026-07-30 과거 인수 기록

## 1. 완료된 것

| 항목 | 값 |
| --- | --- |
| Play Console 앱 | 생성 완료 (이름 `시니어클럽`, 기본 언어 `한국어 – ko-KR`, 앱/무료) |
| 앱 ID | `4972151297890422177` |
| 개발자 계정 | 유주환 (`6912640494861955983`) |
| 패키지 이름 | `com.toris.seniorclub` |
| 서명된 AAB | `../apps/mobile/build-output/app-seniorclub-v5.aab` (81MB) |
| AAB SHA-256 | `d07908ff85ad380e6d915fabc71aa69fb5b0ae74e4ef33e0aa83a956e70a946f` |
| versionName / versionCode | `0.1.0` / `6` |
| API URL (번들에 포함) | `https://d33totqtaqpyfs.cloudfront.net` (검증 완료) |
| Firebase 프로젝트 | `clubsenior-app` (프로젝트 번호 `982568561637`) |
| Firebase Android 앱 ID | `1:982568561637:android:0005fb64d823de045f1d0c` |

### 업로드 keystore

| 항목 | 값 |
| --- | --- |
| 경로 | `~/keystores/clubsenior-upload.keystore` |
| alias | `clubsenior-upload` |
| 비밀번호 (store/key 동일) | `~/keystores/clubsenior-upload.password` 파일 참조 |
| 인증서 만료 | 2053-12-15 |
| EAS 로컬 참조 | `../apps/mobile/credentials.json` (git ignore 처리됨) |

**이 keystore를 잃어버리면 앱 업데이트를 올릴 수 없다.** 별도 백업을 권장한다.

## 2. Play Console에 입력할 텍스트

### 앱 이름 (30자 이내)

```
시니어클럽
```

### 간단한 설명 (80자 이내)

```
관심사와 지역으로 시니어 취미 모임을 찾고 안전하게 신청하는 커뮤니티
```

### 자세한 설명 (4000자 이내)

원문은 `../apps/mobile/store-listing/ko-KR/full-description.txt`에 있다. 그대로 복사해 붙여넣으면 된다.

### 릴리스 노트

`../apps/mobile/store-listing/ko-KR/release-notes-0.1.0.txt` 참조.

## 3. 업로드할 그래픽 파일 경로

| Play Console 항목 | 파일 |
| --- | --- |
| 앱 아이콘 (512×512) | `../apps/mobile/store-listing/icon-512-v2.png` |
| 그래픽 이미지 (1024×500) | `../apps/mobile/store-listing/feature-graphic-1024x500-v2.png` |
| 휴대전화 스크린샷 (2~8장) | `../apps/mobile/store-listing/screenshots/phone/` 6장 |
| 7인치 태블릿 스크린샷 | `../apps/mobile/store-listing/screenshots/tablet-7/` 4장 |
| 10인치 태블릿 스크린샷 | `../apps/mobile/store-listing/screenshots/tablet-10/` 4장 |

프로모션 노출을 원하면 각 변이 1080px 이상인 스크린샷이 4장 이상 필요하다.

## 4. 남은 Play Console 작업

### 앱 콘텐츠

1. **개인정보처리방침** — `https://senior.toris.kr/privacy` (페이지 실제 로드 및 내용 확정 필요)
2. **앱 액세스 권한** — 휴대폰 SMS OTP 로그인이 필요하므로 심사용 테스트 번호와 SMS 수신 절차를 제공
3. **광고** — 광고 없음
4. **콘텐츠 등급** — 설문 작성 (UGC 있음: 게시글·댓글·후기·채팅)
5. **타겟층** — 성인 대상, 아동 대상 아님
6. **데이터 보안** — `DATA_SAFETY.md` 기준으로 작성
7. **정부 앱 / 금융 기능 / 건강** — 모두 해당 없음
8. **계정 삭제 URL** — `https://senior.toris.kr/account-deletion`

### 출시

9. **앱 카테고리** — 소셜 또는 라이프스타일, 연락처 이메일 등록
10. **내부 테스트 트랙에 AAB 업로드** → Play App Signing 자동 등록됨
11. **App Bundle Explorer에서 확인** — package `com.toris.seniorclub`, versionCode `6`, target API 36, 서명 상태
12. **비공개 테스트** — 2023-11-13 이후 만든 개인 개발자 계정이면 테스터 12명 × 14일 요건 확인 (조직 계정이면 미적용)

## 5. AWS 백엔드 (서울, ap-northeast-2)

| 항목 | 값 |
| --- | --- |
| API HTTPS | `https://d33totqtaqpyfs.cloudfront.net` — `/healthz` 200, `/readyz` 200 |
| CloudFront | `E1CZ7895HL6MWG` (ALB 앞단, HTTPS 종료) |
| ALB | `senior-club-alb-1510403427.ap-northeast-2.elb.amazonaws.com` |
| ECS | 클러스터 `senior-club`, 서비스 `senior-club-api` (Fargate 0.25 vCPU / 512MB) |
| RDS | `senior-club-db.cbo8a62u6q1k.ap-northeast-2.rds.amazonaws.com` (db.t4g.micro) |
| DB 비밀번호 | `~/.senior-club/rds-password` |
| 시크릿 | Secrets Manager `senior-club/api` |
| 월 비용 | 약 $44 |
| 테스트 계정 | 심사용 휴대폰 번호 (SMS 인증·온보딩·약관 동의 완료) |

DB 마이그레이션과 시드 데이터는 적용 완료 상태다. 테스트 계정 로그인은 비밀번호가 아니라 휴대폰
SMS OTP를 쓴다.

`AUTH_DEV_OTP_EXPOSE`는 `false`다. API가 공개 인터넷에 열려 있어 응답에 인증번호를 담으면 이메일
주소만 아는 사람이 아무 계정으로나 로그인할 수 있기 때문이다. `EMAIL_PROVIDER=console`이라 메일도
나가지 않으므로, 테스트 계정으로 로그인하려면 개발 환경 로그에서 인증번호를 직접 조회한다.

```bash
aws logs tail /ecs/senior-club-api --since 5m
```

DB 접속은 `sslmode=verify-full`이며 RDS 공개 CA 번들이 이미지 `/app/rds-ca.pem`에 들어 있다
(이미지 태그 `0.1.1`, 태스크 정의 revision 3).

## 6. 아직 검증되지 않은 것

- **현재 배포는 `NODE_ENV=development`다.** API가 production 모드에서 `RESEND_API_KEY`와
  `FCM_SERVICE_ACCOUNT_JSON_BASE64`를 필수로 요구해 기동에 실패하므로 내부 테스트용으로 낮춰 두었다.
  프로덕션 심사 제출 전에 두 자격 증명을 Secrets Manager에 넣고 `NODE_ENV=production`으로 재배포한다.
- SMS(Twilio), 이메일(Resend) 발송과 FCM 푸시는 실기기 검증 전이다.
- ECS는 VPC 커넥터 없이 퍼블릭 서브넷에서 실행 중이며 RDS 접근은 보안 그룹 참조로 제한했다. Resend와
  FCM을 붙일 때 송신 경로를 다시 점검한다.
- 스토어 스크린샷 14장은 이전 색·서체로 촬영한 것이다. Pretendard와 ember 팔레트 적용 후 재촬영이
  필요하다.
- `../apps/mobile/store-listing/screenshots/final/ko-KR/manifest.json` (제출 빌드와 동일 commit 증빙)은 아직 없다.

## 7. 주의: 폐기된 AAB

당시에는 `v5`만 사용하고 이전 빌드를 폐기했다. 아래 값은 과거 기록이며 현재 제출 후보는 아니다.

| 빌드 | 폐기 사유 |
| --- | --- |
| `app-seniorclub.aab`, `-v2`, `-v3` | API URL이 번들에 없다. `getMobileEnvironment()`가 `process.env`를 객체째로 넘겨 Expo의 빌드 타임 치환이 적용되지 않았고, 네이티브 빌드에는 런타임 환경변수가 없으므로 앱이 서버에 접속할 수 없다. |
| `-v4` | API URL은 들어갔으나 서체가 섞인다. `fontWeight`를 직접 쓰는 46곳이 Pretendard 대신 시스템 폰트로 렌더링된다(로그인 화면 다수 포함). |

`v5`에서 확인한 것: 번들에 API/웹 URL 두 개 모두 존재, Pretendard 3종 포함, 패키지 `com.toris.seniorclub`.

## 8. 검증 방법

빌드한 AAB가 실제로 올바른지 확인하려면 압축을 풀어 번들 문자열을 검사한다. 값을 넘겼다는 사실과
번들에 들어갔다는 사실은 다르다. 이 프로젝트에서 실제로 세 개의 빌드가 이 차이 때문에 폐기됐다.

```bash
unzip -q -o build-output/app-seniorclub-v5.aab -d /tmp/aabcheck
strings /tmp/aabcheck/base/assets/index.android.bundle | grep -oE "https://d33totqtaqpyfs\.cloudfront\.net" | sort -u
find /tmp/aabcheck -iname "*Pretendard*"
```

## 2026-09-30 Android 디자인 재수정

최신 native UI source `0d91c27…`는 글자·하단 탐색·사진 슬롯을 수정한다. 상단의 `8f25f7d…`
서명 AAB 후보에는 이 디자인이 포함되며 실제 설치 QA APK는 `8d117e…`다. 디자인 실기기 결과는
[QA 보고서](QA_PRODUCTION_20260930.md)를 따른다. 제출할 전체 소스 SHA를 고정하고 실제
screenshot provenance·Play versionCode·certificate·provider 조건을 확인해야 한다.
