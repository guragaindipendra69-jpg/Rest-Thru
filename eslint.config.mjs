import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Codebase convention: server actions and Prisma payloads are typed
      // loosely by design; tsc --noEmit is the type gate.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "warn",
      // react-hooks v7 React-Compiler-era rules. The codebase predates the
      // compiler migration: effects that seed state from stores, polls and
      // device APIs are deliberate patterns, not bugs. Re-enable when the
      // app moves to React Compiler.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/immutability": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "public/uploads/**",
    "lovable/**",
    "components/menu/**",
  ]),
]);
