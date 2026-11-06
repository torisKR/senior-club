# Dependency compatibility decisions

- Nest runtime (common/core/platform-express/platform-socket.io/websockets) and testing move together from 11.1.28 to supported legacy 11.2.5. A coherent 12.0.3 trial failed the real `nest build`: TS2379 in `socket-io.adapter.ts` (changed ServerOptions contract). A major ESM/adapter migration is deferred, not force-merged.
- TypeScript stays on 6.0.3: PR #26's CI demonstrates that 7.0.2 lacks the programmatic compiler API required by Nest CLI. Ignore only 7.0.x automatic proposals.
- PR #29's native upgrades are not accepted: Expo 57 pins RN 0.86.3, React 19.2.3, Reanimated 4.5.1 and Worklets 0.10.1. Its non-native upgrades require a separate scoped validation; this change does not claim to supersede them.
- A real Nest TestingModule now starts the Express adapter and requests /healthz and /readyz. Local API build, typecheck and 258 tests pass; 10 database-dependent tests remain skipped.
- Original PRs #21/#22/#24/#25/#27/#28 target Nest 12, so this supported-version fallback does not claim to merge their contents. They remain open pending a deliberate migration.
- Branch protections and release evidence gates remain unchanged. Manual build-only production workflow still requires final screenshot provenance; missing screenshots must not be fabricated or bypassed.
