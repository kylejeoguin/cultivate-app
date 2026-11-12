import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // a11y guardrail: eslint-config-next registers jsx-a11y but enables only a 6-rule
  // subset. These high-value rules it omits (label/keyboard/interaction) were brought
  // to a clean zero on 2026-06-29 and are now ERRORS, so any regression fails lint.
  {
    rules: {
      // depth 3 (default 2): our checkbox/radio "cards" nest the visible label
      // text one level deeper (label > div > div), which the default heuristic
      // can't see even though the accessible name resolves correctly at runtime.
      "jsx-a11y/label-has-associated-control": ["error", { depth: 3 }],
      "jsx-a11y/click-events-have-key-events": "error",
      "jsx-a11y/no-static-element-interactions": "error",
      "jsx-a11y/no-noninteractive-element-interactions": "error",
      "jsx-a11y/anchor-is-valid": "error",

      // react-compiler rules (new in the react-hooks plugin, known-noisy on
      // hydration patterns): kept as WARN, not error. Every flagged site was
      // reviewed 2026-06-29 and is an intentional, commented SSR→local
      // hydration / prop-sync effect or an event-time Date.now()/random() call —
      // none is a bug. Revisit (and fix for real) when adopting React Compiler.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
  // Node CLI/util scripts are CommonJS — require() is correct there.
  {
    files: ["scripts/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
