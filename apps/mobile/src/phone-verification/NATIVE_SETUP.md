# Parent configuration handoff — 2026-09-30

Install matching maintained native packages **@react-native-firebase/app@26.4.0** and **@react-native-firebase/auth@26.4.0**. Both versions were verified against the npm registry on 2026-09-30. Parent owns manifests, lockfiles, Expo configuration and rebuild.

- Add Expo plugins `@react-native-firebase/app` and `@react-native-firebase/auth`.
- Android `googleServicesFile`: use existing ignored `./android/app/google-services.json` (project `clubsenior-app`, package `com.toris.seniorclub`), or copy it to a secure location before a clean prebuild and point the setting there. Preserve the ignored original.
- Enable Firebase Authentication Phone provider; allow KR in SMS region policy; configure actual debug, release and Play signing SHA-256 (Play Integrity) and SHA-1 (reCAPTCHA). Check billing and SMS quota. No SMS reading/sending runtime permission is needed.
- Rebuild native Android binary; Expo Go cannot provide this native module. iOS additionally needs its own GoogleService-Info.plist, Firebase app configuration, APNs/reCAPTCHA setup and the framework configuration appropriate to the installed RNFirebase release. Web has an explicit native-app-only message.
- Firebase is a temporary phone proof session only. Kakao remains the only app login. Never install Firebase ID tokens into the app session or replace Kakao access tokens.
- Mobile calls authenticated `POST /v1/auth/firebase/verify-phone` with exactly `{ idToken }`, then loads `GET /v1/me`.

**Backend contract:** set `phoneVerifiedAt` after Firebase proof, return it in both profile endpoints, and clear it when the contact number changes or is removed (preserve it for an equivalent normalized number). Production ECS task `senior-club-api:24` includes these changes (2026-09-30). Mobile treats absent verification metadata as unverified. Missing metadata after a successful link is reported as incomplete verification, not silently labeled verified.

**Verified configuration and remaining limitation (2026-09-30):** the matching Android Firebase app has the actual QA signing certificate SHA-1 and SHA-256 registered. A standalone native APK with RNFirebase 26.4.0 was rebuilt and installed on Galaxy M33 / Android 16. Kakao login, session restore and optional phone input validation were tested through ADB. Firebase Auth configuration GET returns `CONFIGURATION_NOT_FOUND`; the official initializeAuth request fails with `BILLING_NOT_ENABLED`. Phone Auth therefore remains unavailable until the project has an authorized billing account, Authentication initialization, Phone provider and KR SMS policy. The API also needs authorized server ADC credentials and `FIREBASE_PROJECT_ID`; Android client JSON is not an Admin credential. Play signing certificate registration and real SMS / Play Integrity / reCAPTCHA success remain unverified. Do not report SMS verification complete from unit tests or native build success.

**Profile contract limitation:** current profile PATCH requires birth year, region and at least one interest. Editing preserves the actual stored birth year and selected interests; incomplete profiles must first complete those fields. No invented birth year or interest is submitted.

Implementation includes the optional profile card, normalized freely saved contact edits, native modular `verifyPhoneNumber` (RNFirebase 26 modular `signInWithPhoneNumber` does not accept force resend), manual code and Android instant verification, 60-second resend cooldown, expiry/error handling, retry of backend linking using refreshed proof, and cleanup on cancel, blur, account change and success. Kakao session modules remain untouched.

Validation on the shared workspace: mobile TypeScript check; scoped ESLint; mobile Vitest suite passed 330 tests across 41 files after refresh-race, cached-profile and cover-image regressions were integrated. Parent performed the ADB tests described above; implementation workers did not operate devices. The current artifact and subsequent shared-design ADB checks are recorded in docs/QA_PRODUCTION_20260930.md; these do not imply that Firebase billing, SMS or server ADC has been configured.

Changed implementation paths:
- `apps/mobile/src/api/profile-api-core.ts`
- `apps/mobile/src/screens/profile/profile-screen.tsx`
- `apps/mobile/src/screens/profile/phone-verification-card.tsx`
- `apps/mobile/src/screens/profile/profile-edit.ts`
- `apps/mobile/src/phone-verification/native-phone-auth.native.ts`
- `apps/mobile/src/phone-verification/native-phone-auth.ts`
- `apps/mobile/src/phone-verification/phone-auth-driver.ts`
- `apps/mobile/src/phone-verification/phone-number.ts`
- `apps/mobile/src/phone-verification/phone-verification-api.ts`
- `apps/mobile/src/phone-verification/phone-verification-controller.ts`
- `apps/mobile/src/phone-verification/phone-verification-error.ts`

Changed/new test paths:
- `apps/mobile/src/api/profile-api-core.test.ts`
- `apps/mobile/src/screens/profile/profile-edit.test.ts`
- `apps/mobile/src/phone-verification/native-phone-auth.test.ts`
- `apps/mobile/src/phone-verification/native-phone-auth-web.test.ts`
- `apps/mobile/src/phone-verification/phone-number.test.ts`
- `apps/mobile/src/phone-verification/phone-verification-api.test.ts`
- `apps/mobile/src/phone-verification/phone-verification-controller.test.ts`
- `apps/mobile/src/phone-verification/phone-verification-error.test.ts`

Existing prior profile editing and Plus UI were preserved and integrated. This task did not edit auth/login/http modules, `apps/api`, package manifests, lockfiles or Expo configuration.

Official references:
- https://rnfirebase.io/
- https://rnfirebase.io/auth/phone-auth
- https://rnfirebase.io/reference/auth
- https://firebase.google.com/docs/auth/android/phone-auth
- https://firebase.google.com/docs/auth/ios/phone-auth

No ADB/device operations are performed by this task.
