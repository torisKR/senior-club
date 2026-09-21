# Main deployment

Both direct pushes and merged PRs create a `push` event on `main`.

- Vercel project `club_senior` is connected to `torisKR/senior-club`, production branch `main`. Vercel owns web deployment and PR previews.
- `Deploy main` runs the reusable CI checks before updating ECS. OIDC trusts only this repository's `main`; permissions target the existing API ECR repository, ECS service and execution role.
- After API deployment and Sites packaging succeed, the Android workflow builds an auto-incremented production AAB and submits its exact validated EAS build ID. It does not submit `--latest`.
- Play package `com.toris.seniorclub`. The owning Play developer account and its numeric developer ID are held privately by the release owner; they are not recorded in this repository.
- A dedicated Play upload service account is used. The production workflow pins its expected `client_email` and rejects any other key supplied through the `play-store-production` environment secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. The account must hold app-level release permissions only; the private key never leaves the ephemeral runner.

## Configuration

Repository secret: `AWS_ROLE_TO_ASSUME`.

Environment `play-store-production` (main only) secrets:
`EXPO_TOKEN`, `GOOGLE_SERVICES_JSON_BASE64`, `KAKAO_NATIVE_APP_KEY`, `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

Environment variables `EXPO_PUBLIC_API_URL` and `EXPO_PUBLIC_WEB_URL` must exactly match the EAS production environment. Credentials are materialized privately on the ephemeral runner and removed even after failures.

## Release scope

Automatic `binary_update` updates the already-published app only; existing Play screenshots and listing text stay unchanged. Mobile checks, production config, live readiness/policies and exact build validation remain required. The separately dispatched store-listing release retains strict final screenshot evidence and draft submission.

`productionUpdate` uses Play's `completed` release status to request production rollout, not draft upload. Google review, managed publishing or policy restrictions can still delay public availability. A successful CI build is not proof of a public Play release: check the submission result and Play Console production track.

Inspect failed runs before rerunning: EAS uses remote auto-increment, and a retry can create another version. Never print or commit service account JSON. Rotate it in Google Cloud and replace the GitHub environment secret if compromised.
