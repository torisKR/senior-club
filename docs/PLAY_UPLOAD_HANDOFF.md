# Play Console 업로드 인수 문서

이 문서는 Android 게임 `com.toris.seniorclub`의 현재 스크린샷 증거와 배포 절차를 설명한다. 실제 검토·서명·제출 여부는 각 실행의 결과로 확인한다.

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
push 시 API/Cloudflare를 처리하고, Android 후보는 수동 dispatch에서 `screenshot_evidence_run_id`가
제공된 경우에만 동일한 검증 workflow를 호출한다. Android workflow를 직접 호출할 때 입력이
없거나 잘못되면 실패한다. `submit_to_play=false`여도 뒤의
versionCode 할당은 Play edit를 생성하므로 dispatch는 읽기 전용 작업이 아니다. AAB 서명·실제
binary 검사와 최종 Play 제출 승인은 이 screenshot 전달 검사와 별도다.
