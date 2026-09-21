# Direct Android release (GitHub Actions)

Android release builds and uploads no longer use EAS cloud, EAS local, EAS credentials, or EAS Submit. The locked Expo CLI runs `expo prebuild --platform android --clean --no-install`, then Gradle `:app:bundleRelease` on the GitHub runner. Legacy `eas.json` is retained for historical/development compatibility, not used by the release workflows.

## Authorization and prerequisites

- Merge through the protected main PR/check/reviewer process. Do not bypass administrator enforcement or self-approve.
- `deploy-main.yml` retains quality → backend/sites success → signed binary build, with `submit_to_play: false`. A merge does not authorize a Play rollout.
- Manual production dispatch defaults to build-only. Set `binary_update=true` explicitly for an already-published binary with unchanged store assets. Combining it with `submit_to_play=true` completes a production rollout; otherwise an explicit upload is production/draft. Internal remains optional internal/draft. Uploads require main.
- Screenshot provenance and strict preflight remain required except for the existing published-binary-update path. That path still validates assets, manifest, consent-related tests and live endpoints.
- All Android release paths share one non-cancelling concurrency group. Workflow reruns fail closed. Reconcile an ambiguous upload in Play before a fresh dispatch; never blindly retry or promote another artifact.

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

A maintainer must explicitly authorize provisioning signing secrets. Do not print key/password/credential contents, commit them, reset an upload key, or assume the ignored local credentials match Play. Compare the existing certificate with Play's **upload** certificate (not the app-signing certificate) first. Missing signing inputs stop before dependency installation or any Play request. No local credentials are read by CI.

## Version and artifact contract

The allocator reads all Play tracks, bundles and APKs using a temporary edit. The code is the larger of seconds since 2020-01-01 and the observed maximum + 1; Android's 2,100,000,000 limit is checked. The shared lock serializes runs, and the code is checked again against Play immediately before upload. Successful uploads consume the code even if a subsequent edit fails; a fresh release must allocate again. Build-only artifacts are not reserved in Play and are never later uploaded through an implicit latest selector.

The explicit `ANDROID_VERSION_CODE` flows through Expo prebuild. The exact `app-release.aab` is copied to evidence, then checked with checksum-pinned bundletool 1.18.2 and JDK tools: bundle structure, package, code/name, target SDK >=36, release/backup/cleartext settings, blocked permissions, delayed ad measurement consent metadata, actual bundled endpoint strings, cryptographic JAR signature and expected upload certificate.

Upload revalidates the same bytes, verifies Google's returned versionCode and SHA-256, writes only the explicitly selected track/status, validates/commits the edit, and reads the committed track back. No latest-build lookup, implicit retry, promotion or fallback signing exists. `validated-build.json`, merged manifest, AAB and successful `play-release.json` are retained 30 days. Credentials are outside evidence and removed in an always-run cleanup step.

## Commands

After signing configuration and reviewer approval:

```sh
# Build only; screenshot evidence must match the checked-out commit.
gh workflow run android-play-production.yml --ref main -f submit_to_play=false
# Published binary build only; existing listing assets stay unchanged.
gh workflow run android-play-production.yml --ref main -f binary_update=true -f submit_to_play=false
# Explicit production draft upload (not immediate public rollout).
gh workflow run android-play-production.yml --ref main -f submit_to_play=true
# Explicit internal draft upload.
gh workflow run android-play-internal.yml --ref main -f submit_to_play=true
```

Do not dispatch `deploy-main.yml` just to test Android: it also deploys backend/sites. Use the explicit build-only Android dispatch above.

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

Unit tests use fixtures and do not prove real signing or Play delivery. A release is successful only after a real signed build and confirmed Play read-back. First-release console declarations, device consent testing, and required review remain operator responsibilities.
