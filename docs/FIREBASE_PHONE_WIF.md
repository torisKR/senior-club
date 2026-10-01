# Optional phone verification on AWS ECS

Kakao remains the only application login. Firebase Phone Authentication supplies a short-lived proof for a signed-in member's optional profile phone number. Firebase credentials never become an application session.

The API verifies the Firebase ID token signature, issuer, audience, expiry, phone sign-in method and recent `auth_time`. `verifyIdToken(token, true)` also reads the Firebase user's disablement and revocation state. That read requires server credentials; Android `google-services.json` is not an Admin credential.

## Production identity

Production uses Google Workload Identity Federation with the ECS task's temporary AWS credentials. No service account key is created or bundled. Configure all four values together:

```text
FIREBASE_PROJECT_ID=clubsenior-app
FIREBASE_WIF_AUDIENCE=//iam.googleapis.com/projects/982568561637/locations/global/workloadIdentityPools/senior-club-prod/providers/aws-ecs
FIREBASE_WIF_SERVICE_ACCOUNT_EMAIL=senior-phone-verifier@clubsenior-app.iam.gserviceaccount.com
AWS_REGION=ap-northeast-2
```

The dedicated ECS task role is `senior-club-phone-verifier`. Its trust is limited to ECS tasks in the owning AWS account; it grants no AWS resource permissions. Google accepts only the exact owning account and this assumed role. The service account's custom project role contains only `firebaseauth.users.get`. The service account grants `roles/iam.workloadIdentityUser` to that pool's exact `attribute.aws_role` principal set, never the whole pool.

The adapter uses an AWS security credential supplier because EC2 metadata-based ADC does not retrieve ECS/Fargate task credentials. It permits the injected ECS relative credential path only, validates expiring session credentials and derives Google STS and impersonation URLs internally. Tokens and signed AWS assertions are never logged. Local environments can retain ADC when WIF settings are absent. Production rejects Firebase Auth emulator configuration.

The existing deployment workflow preserves runtime task identity and environment when updating the immutable API image. Its `iam:PassRole` permission permits only the execution role and this dedicated task role, restricted to `ecs-tasks.amazonaws.com`.

## Firebase and Android settings

Use the existing project's authorized Blaze billing account. Initialize Authentication, enable Phone, and set the SMS region policy to an allowlist containing only KR. Enabling Phone includes the console's Play Integrity API terms acceptance; the account owner must approve that step. Preserve Kakao-only application login and all other providers' disabled state.

Register the actual debug, upload and Play app signing SHA-1/SHA-256 fingerprints on the Android app matching `com.toris.seniorclub`. Do not derive a Play signing certificate from the upload certificate. SMS verification does not need SMS reading or sending permissions.

## Verification

- Unit tests cover credential refresh, rejected configuration, sanitized failures, and the existing phone token checks.
- A production ECS probe must exchange its temporary identity and perform a read-only lookup before the credential path is reported as working. A synthetic nonexistent UID can confirm permission without creating a user or sending SMS.
- Real SMS, Play Integrity/reCAPTCHA, number linkage, cooldown, cancellation and profile changes require separate device acceptance. A successful build or token exchange does not establish those results.
- Missing configuration or unavailable credentials returns a controlled service-unavailable response; invalid, stale, revoked or disabled tokens cannot verify a phone number.

[Google AWS federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-other-clouds), [custom AWS credential supplier](https://github.com/googleapis/google-auth-library-nodejs#accessing-resources-from-aws-using-a-custom-aws-security-credentials-supplier), [Firebase Android phone authentication](https://firebase.google.com/docs/auth/android/phone-auth).
