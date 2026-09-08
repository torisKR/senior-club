import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  globalIgnores([
    ".next/**",
    "out/**",
    "output/**",
    "build/**",
    ".open-next/**",
    ".wrangler/**",
    "dist/**",
    "apps/api/**",
    "apps/mobile/**",
    "next-env.d.ts",
  ]),
]);
