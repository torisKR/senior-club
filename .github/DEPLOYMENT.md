# Main deployment

- Vercel project `club_senior` owns web deployment and PR previews from `torisKR/senior-club`.
- `Deploy main` runs reusable CI before updating ECS. OIDC trusts this repository's `main` only.
- After API deployment and Sites packaging succeed, Android builds an incremented production AAB directly with Gradle. **Main builds only; it does not automatically publish to Play.**
- Package: `com.toris.seniorclub`. The workflow pins the dedicated Play service account email and validates the exact signed AAB before any upload.

## Configuration

Repository secret: `AWS_ROLE_TO_ASSUME`.

The `play-store-production` (and optional `play-internal`) environment supplies:
`ANDROID_UPLOAD_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
`ANDROID_KEY_PASSWORD`, `ANDROID_UPLOAD_CERT_SHA256`, `GOOGLE_SERVICES_JSON_BASE64`,
`KAKAO_NATIVE_APP_KEY`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
No new production signing keys are generated. Native keys must be checked against the intended Kakao application before setting secrets; never print them.

Environment variables `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` must match the pinned production endpoints. Credentials are materialized privately and removed even after failures.

## Kakao certificate evidence

After Expo prebuild, the existing production/internal reusable workflow exports only public certificates from the configured upload keystore and the actual generated `android/app/debug.keystore`. It verifies upload SHA-256 against the pinned certificate, then records `base64(SHA-1(DER))` as `kakaoKeyHash` and SHA-256 in `kakao-key-hashes.json` in the release evidence artifact and Actions summary.

Optionally set environment variable `PLAY_APP_SIGNING_CERTIFICATE_BASE64` to base64 of the **public DER X.509 app-signing certificate downloaded from Play Console**. Never supply a private key or a fingerprint string. Invalid supplied certificates fail closed. Absence is explicitly reported as unverified, not substituted with upload signing.

- Play-installed apps use **Play app signing**, not the upload certificate.
- Upload hashes apply to binaries installed with that signing identity.
- Debug evidence applies only to that generated project's actual debug keystore. Developers must check their own signing certificate; no universal debug hash is assumed.
- These artifacts do not register hashes in Kakao Console or prove login works. Preserve existing registrations and confirm the intended Kakao app/package in the Console separately. Key rotation can require multiple app-signing certificates.

## Release scope

Manual production `binary_update=true` retains existing store listing assets. `submit_to_play` defaults to false and must be explicitly enabled to publish. Published binary updates request `completed`; screenshot-bound store-listing/internal paths retain draft gates. Quality checks, live endpoint checks, pinned signing and exact AAB validation remain required.

Google review/managed publishing may delay public availability. Verify the Play production track after upload; a successful build alone is not public release proof. Inspect failures before creating a fresh dispatch; rerun attempts are deliberately rejected to avoid accidental duplicate releases.

The Expo template used a 2 GiB Gradle heap and failed D8 `mergeDexRelease`. CI now bounds Gradle to 4 GiB heap, 1 GiB metaspace and two workers, retaining all architectures. No heap dumps are enabled (they could contain credentials).
