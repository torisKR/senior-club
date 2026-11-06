# Senior Club — offline game

The Expo mobile app contains the village and three games. The former member, meeting, board, chat and review services are retired; the app does not sign in or call the community API. The retired API, Prisma sources and website-only assets are removed from this checkout. No external resources or data are removed by this source change.

## Development and validation

- `pnpm install --frozen-lockfile` (Node 24 and pnpm 9.14.2)
- `pnpm mobile:start`, `pnpm mobile:android`, `pnpm mobile:typecheck`, `pnpm mobile:lint`
- `pnpm test`, `pnpm build` (Android Expo export)
- `pnpm mobile:test:release-validators` (release-owner checks; see below)

`shared/` is imported by mobile. Local game progress, purchase tokens, analytics consent and font preferences retain their existing storage keys. A large-text preference in an older app-state key is read without deleting the old or unrelated saves. Firebase Analytics, Google Mobile Ads, Expo IAP and RevenueCat remain in use.

## Pixel art pipeline

The RPG village and arcade boards are rendered as true pixel art on a **1 art pixel = 1dp** grid
(3× nearest-neighbour runtime PNGs). Effects are animated sprite sheets baked from
[pixelfx](https://github.com/patch-gg/pixelfx), and rank outfits are baked with
[sprite-gen](https://github.com/aldegad/sprite-gen) `recolor`.

- Rebuild every asset: `node tools/pixel-art/build.mjs`
- Pipeline and contracts: `design/art/pixel-art-pipeline.md`
- Preview: `design/previews/pixel-village-preview.png`, `design/previews/pixel-fx-sheet.png`

## Game design and Android release baseline

- Android game plan (loops, CP curve, retention, monetization, device rules): `design/gdd/android-game-plan.md`
- Story bible (premise, cast, causality, plausibility audit): `design/story/story-bible.md`
- Android UI/UX spec (layout, typography, states, motion, a11y): `design/design/android-ui-spec.md`
- NPC bonds and companion walks (healing relationship loop): `apps/mobile/src/rpg/bond-logic.ts`, `companion-coach.tsx`
- First-run prologue + 3-step tutorial: `apps/mobile/src/rpg/onboarding.ts`, `onboarding-overlay.tsx`

## Android release boundary

`.github/workflows/deploy-main.yml` runs CI and can invoke the existing Android candidate workflow; it does not deploy an API or website. The existing release scripts and production workflow are maintained separately. At this baseline the store-asset validator still expects a retired notification icon, web favicon and login screen; the release owner is updating those checks for the offline app without weakening signing, merged-manifest, store-evidence or Play submission verification. Until then the full release gate is not expected to pass.

The app continues to link to the published privacy policy and retains consent controls and purchase restoration. Do not remove or change an existing Worker, DNS record, database, account, user data, signing credential or secret as part of this repository cleanup. Historical evidence is not an instruction to redeploy the retired service. Three legacy image inputs remain under `public/images/` because the existing Android brand-asset generator still reads them; its owner must relocate those inputs before that directory can be removed.
