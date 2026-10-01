# Direct Android release (GitHub Actions)

Updated: 2026-09-30. This is the current workflow contract; deployment and device acceptance are tracked in [release readiness](RELEASE_READINESS.md).

Android release builds and uploads no longer use EAS cloud, EAS local, EAS credentials, or EAS Submit. The locked Expo CLI runs `expo prebuild --platform android --clean --no-install`, then Gradle `:app:bundleRelease` on the GitHub runner. Legacy `eas.json` is retained for historical/development compatibility, not used by the release workflows.

Native authentication source `948c2327c70eaf42b997dd11ae384e1258bfc63f` additionally rejects stale login/refresh and previous-account protected responses. Mobile 361 tests / 46 files, typecheck and scoped ESLint passed. Its QA APK `d0c861…` passed build/manifest/signature checks but has not been installed or tested with a real provider. The installed `3fa88a…` APK and signed candidate below do not include this fix. See [current authentication evidence](QA_PRODUCTION_20260930.md#추가-모바일-인증-회귀-수정).

The newest local upload-signed AAB is from `948c2327c70eaf42b997dd11ae384e1258bfc63f`, SHA-256 `0a1a15f6a29bd1808a1b24013293c67f83bcae5f656909ff573ad0f2c02596f3` (93,681,400 bytes). Four ABIs, target36, exact manifest/signature, production configuration, shared photos/font and SDK metadata passed. [New signed candidate evidence](qa-evidence/20260930/android-auth-session-signed-candidate.json). It has no device/provider acceptance, Play version reconciliation, reviewed final screenshot or hosted/upload evidence. Later API and documentation commits are outside this candidate's full source SHA.

An earlier local upload-signed candidate was built from `9a9825b32ae47f5abcfdbbc2af1b8f7103cabecd` and its four ABIs, target 36, merged manifest, signature, endpoints, configured ads and photo/font bytes were verified. AAB SHA-256 is `968066c227bf77dfa7ba210cbdd7b3d310c5daa5c2e189514a60543f104086e0`; see [candidate evidence](qa-evidence/20260930/android-scroll-inset-signed-candidate.json). That candidate uses native product source `9a9825b…`, including the fixed scrolling status-bar inset. Its data-preserving debug-certificate QA APK is `3fa88ac99743a0ff593a697b500cdfb99973461139d72eed30ac36263b4a04a7`; source/build/manifest/signature and actual install hash passed, but runtime retesting stopped because another app is foreground. Prior visual/font QA remains tied to source `0d91c27…` / APK `8d117e…`; see [new QA limits](qa-evidence/20260930/native-scroll-inset-candidate.json). Later evidence/documentation changes are outside the candidate's full source SHA. Neither the local candidate nor the QA results establish final screenshot provenance, Play version reconciliation, provider/Play acceptance, or a hosted workflow run.

## Authorization and prerequisites

- Merge through the protected main PR/check/reviewer process. Do not bypass administrator enforcement or self-approve.
- On 2026-10-01 the user authorized publishing source, shared image assets and sanitized deployment/QA evidence to the public `torisKR/senior-club` repository. Publish through the branch and PR review process; exclude keys, credentials and raw device captures. Hosted checks, reviewed screenshot evidence and Play execution require their own observed results.
- `deploy-main.yml` calls Android only on `workflow_dispatch` with a nonempty `screenshot_evidence_run_id`, after backend and sites-package success, with `submit_to_play: false`. A push/merge alone does not run that Android job or authorize a Play rollout. A sites package is separate from the actual Vercel web deployment.
- Manual production dispatch defaults to build-only. Set `binary_update=true` explicitly for an already-published binary with unchanged store assets. Combining it with `submit_to_play=true` completes a production rollout; otherwise an explicit upload is production/draft. Internal remains optional internal/draft. Uploads require main.
- **Every mode requires exact reviewed screenshot evidence and the full strict production preflight**, including build-only, internal and `binary_update=true`. Published-update validation is an additional check, not a screenshot bypass. Both screenshot receipt and preflight steps in `android-play-production.yml` are unconditional.
- All Android release paths share one non-cancelling concurrency group. Workflow reruns fail closed. Reconcile an ambiguous upload in Play before a fresh dispatch; never blindly retry or promote another artifact.

## Screenshot evidence and human review

`screenshot_evidence_run_id` must identify a successful first-attempt `main` run of [the trusted issuer](../.github/workflows/android-play-screenshot-evidence.yml) in this repository at the exact full lowercase release SHA. The receiver verifies run/repository/actor/artifact identity and digest; `capture.commit` must exactly equal the consumer's `GITHUB_SHA`. The artifact is `android-play-final-screenshots-<SHA>` and carries the original manifest and assets. Full input and delivery rules are in the current section of [PLAY_UPLOAD_HANDOFF.md](PLAY_UPLOAD_HANDOFF.md).

The same human must actually review the exact screenshots and six original manifest attestations, upload the hash-pinned input ZIP, and directly dispatch the issuer with `manual_review=true` (default false). Preserve the original bytes and review receipt. Do not infer human approval from tests, generate true attestations, relabel a QA capture as a submitted build, or rewrite an old manifest's commit to a new SHA. Keep the manifest outside Git; freeze the release SHA before producing its evidence. Documentation-only commits still change this exact-SHA contract.

The `android-play-internal.yml` wrapper requires and forwards `screenshot_evidence_run_id` and grants `actions: read`. It uses the same strict production receiver; internal mode has no exemption. Local workflow-contract tests and actionlint passed, while actual hosted execution remains unobserved.

## Environment configuration

Use `play-store-production` for production and `play-internal` for internal. Each requires:

| Secret | Source |
| --- | --- |
| `ANDROID_UPLOAD_KEYSTORE_BASE64` | Base64 of the **existing Play upload keystore**, never a generated replacement |
| `ANDROID_KEYSTORE_PASSWORD` | Existing store password |
| `ANDROID_KEY_ALIAS` | Existing upload alias |
| `ANDROID_KEY_PASSWORD` | Existing key password |
| `ANDROID_UPLOAD_CERT_SHA256` | Existing Play upload certificate SHA-256, exactly 64 hexadecimal characters without colons; independently verify in Play Console |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` | Existing app-scoped toris-play-uploader service account |
| `GOOGLE_SERVICES_JSON_BASE64` | Android Firebase client JSON for `com.toris.seniorclub` |
| `KAKAO_NATIVE_APP_KEY` | Existing native application key |

Variables: `EXPO_PUBLIC_API_URL=https://d33totqtaqpyfs.cloudfront.net` and `EXPO_PUBLIC_WEB_URL=https://senior.toris.kr`. `EXPO_TOKEN` is no longer consumed.

These inputs are required by the current workflow even for build-only: version allocation queries Play through a temporary edit. Build-only means no binary upload or rollout, not an offline workflow. Node 24/pnpm 9.14.2 and JDK 17 are configured by the workflow. Optional `PLAY_APP_SIGNING_CERTIFICATE_BASE64` is a public DER certificate; final Kakao/Firebase provider validation still requires the actual Play signing identity.

A maintainer must explicitly authorize provisioning signing secrets. Do not print key/password/credential contents, commit them, reset an upload key, or assume the ignored local credentials match Play. Compare the existing certificate with Play's **upload** certificate (not the app-signing certificate) first. Missing signing inputs stop before dependency installation or any Play request. No local credentials are read by CI.

## Version and artifact contract

The allocator reads all Play tracks, bundles and APKs using a temporary edit. The code is the larger of seconds since 2020-01-01 and the observed maximum + 1; Android's 2,100,000,000 limit is checked. The shared lock serializes runs, and the code is checked again against Play immediately before upload. Successful uploads consume the code even if a subsequent edit fails; a fresh release must allocate again. Build-only artifacts are not reserved in Play and are never later uploaded through an implicit latest selector.

The explicit `ANDROID_VERSION_CODE` flows through Expo prebuild. The exact `app-release.aab` is copied to evidence, then checked with checksum-pinned bundletool 1.18.2 and JDK tools: bundle structure, package, code/name, target SDK >=36, release/backup/cleartext settings, blocked permissions, delayed ad measurement consent metadata, actual bundled endpoint strings, cryptographic JAR signature and expected upload certificate.

Upload revalidates the same bytes, verifies Google's returned versionCode and SHA-256, writes only the explicitly selected track/status, validates/commits the edit, and reads the committed track back. No latest-build lookup, implicit retry, promotion or fallback signing exists. `validated-build.json`, merged manifest, AAB and successful `play-release.json` are retained 30 days. Credentials are outside evidence and removed in an always-run cleanup step.

## Commands

After publication authorization, protected-source review, signing configuration and exact human-reviewed evidence are ready, use the actual successful issuer run ID below. These are operator instructions, not evidence that a dispatch or upload occurred.

```sh
# Build only; screenshot evidence must match the checked-out commit.
gh workflow run android-play-production.yml --ref main \
  -f screenshot_evidence_run_id="$reviewed_screenshot_run_id" -f submit_to_play=false
# Published binary build only; existing listing assets stay unchanged.
gh workflow run android-play-production.yml --ref main \
  -f screenshot_evidence_run_id="$reviewed_screenshot_run_id" \
  -f binary_update=true -f submit_to_play=false
# Explicit production draft upload (not immediate public rollout).
gh workflow run android-play-production.yml --ref main \
  -f screenshot_evidence_run_id="$reviewed_screenshot_run_id" -f submit_to_play=true
```

The internal wrapper can be dispatched with the same exact issuer ID when all prerequisites are met:

```sh
gh workflow run android-play-internal.yml --ref main \
  -f screenshot_evidence_run_id="$reviewed_screenshot_run_id" -f submit_to_play=true
```

`binary_update=true` plus `submit_to_play=true` selects **production/completed**, not draft, and requires public rollout authorization and the same strict proof.

Do not dispatch `deploy-main.yml` just to test Android: it also deploys the backend and packages the site. Use the explicit build-only Android dispatch above.

## Validation

Use Node 24 and pnpm 9.14.2:

```sh
pnpm --filter mobile test:release-validators
pnpm --filter mobile validate:play-production-workflow
pnpm --filter mobile validate:play-internal-workflow
pnpm --filter mobile lint
pnpm --filter mobile typecheck
pnpm --filter mobile test
actionlint .github/workflows/android-play-production.yml .github/workflows/android-play-internal.yml
```

Already-passed broad suites need not be rerun solely for these documentation edits. The commands describe the checks required for relevant source changes and the workflow's actual release gate. Tests use fixtures; source/config/endpoint/screenshot checks do not prove runtime providers, production policy correctness, signing or Play delivery. A build-only result is a validated candidate. Upload success additionally requires exact artifact identity and confirmed Play track/status read-back; production acceptance remains separate.

Before production acceptance, retain the outstanding [readiness requirements](RELEASE_READINESS.md): actual Kakao-only native/web provider and reviewer access; optional Firebase Phone billing/provider/region/Admin/signing setup and real linking; FCM delivery and token cleanup; AdMob consent and actual Play purchase/restore; role-specific UGC/report/block/moderation and deletion processing; current listing/Data Safety/operating privacy terms; CloudFront-to-ALB HTTPS (still pending); final AAB/Play signing, pre-launch and reviewed screenshot evidence. Static metadata and the latest QA APK do not close those requirements. Historical SMS/EAS handoff text must not be copied into current Console declarations.
