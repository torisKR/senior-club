# Android candidate workflow

`Deploy main` calls the reusable CI workflow. A manual dispatch with reviewed screenshot evidence can request an Android production candidate build; submission remains disabled there. It does not deploy the retired API or website. Production submission uses the separately controlled Android release workflow.

The Android package remains `com.toris.seniorclub`. Preserve the existing upload signing identity, certificate checks, exact AAB and merged-manifest validation, screenshot evidence, store validation and explicit Play submission controls. A build, upload, review submission and public release are separate states.

The game release checks current app assets, the published privacy policy and app-ads seller file instead of retired login assets and API origins. Firebase Analytics still requires the correct production Firebase Android client configuration. The exact signed AAB, merged manifest and human-reviewed screenshot evidence remain release gates.

No Cloudflare, AWS, database, account, user data, credential or secret is changed by the source cleanup. The published privacy policy link and former-account contact path remain in the app.
