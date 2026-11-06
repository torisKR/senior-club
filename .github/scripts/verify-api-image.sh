#!/usr/bin/env bash
set -euo pipefail

image="${1:?Pass the API image name}"
test "$(docker image inspect "$image" --format '{{.Config.User}}')" = "node"

docker run --rm --network none --entrypoint node "$image" -e '
  const assert = require("node:assert/strict");
  const fs = require("node:fs");
  assert.equal(process.versions.node.split(".")[0], "26");
  for (const path of ["/app/dist/main.js", "/app/dist/phone-credential/auth/firebase-wif.credential.js", "/app/rds-ca.pem"]) fs.accessSync(path);
  assert.equal(typeof require("/app/dist/phone-credential/auth/firebase-wif.credential.js").createFirebasePhoneCredential, "function");
  console.log(`Runtime ${process.version}; generated artifacts are present`);
'

# Start the image's real entrypoint in production mode without external services.
container_id="$(docker run -d --network none \
  -e DATABASE_URL='postgresql://ci:ci@127.0.0.1:5432/senior_club?sslmode=verify-full&sslrootcert=/app/rds-ca.pem' \
  -e CORS_ORIGINS=https://web.invalid -e KAKAO_APP_ID=1 \
  -e AUTH_ACCESS_TOKEN_SECRET=ci-only-access-token-secret-at-least-32-characters \
  -e AUTH_OTP_PEPPER=ci-only-otp-pepper-secret-at-least-32-characters \
  -e AUTH_OTP_ENCRYPTION_KEY_BASE64=BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc= \
  -e OUTBOX_WORKER_ENABLED=false -e EMAIL_PROVIDER=disabled -e SMS_PROVIDER=disabled -e PUSH_PROVIDER=disabled \
  "$image")"
trap 'docker rm -f "$container_id" >/dev/null' EXIT

for attempt in {1..45}; do
  if docker exec "$container_id" node -e '
    fetch("http://127.0.0.1:4000/healthz", {signal: AbortSignal.timeout(2000)})
      .then(async response => {
        const body = await response.json();
        if (!response.ok || body.status !== "ok" || body.service !== "senior-club-api") process.exit(1);
      }).catch(() => process.exit(1));
  ' >/dev/null 2>&1; then
    echo "Production entrypoint passed /healthz (attempt $attempt)"
    exit 0
  fi
  if [[ "$(docker inspect "$container_id" --format '{{.State.Running}}')" != "true" ]]; then
    break
  fi
  sleep 1
done

docker logs "$container_id"
echo "Production entrypoint failed to pass /healthz" >&2
exit 1
