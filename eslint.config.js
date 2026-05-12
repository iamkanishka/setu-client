// @ts-check

import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default tseslint.config(
  // ── Global ignores ──────────────────────────────────────────────────────────
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "eslint.config.js",
      "tsup.config.ts",
      "vitest.config.ts",
    ],
  },

  // ── Base JavaScript recommended rules ───────────────────────────────────────
  eslint.configs.recommended,

  // ── Strict type-checked TypeScript rules for src/ ───────────────────────────
  ...tseslint.configs.strictTypeChecked.map((config) => ({
    ...config,
    files: ["src/**/*.ts"],
  })),

  // ── Recommended TypeScript rules for tests/examples ─────────────────────────
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["test/**/*.ts"],
  })),

  // ── Shared TypeScript configuration ─────────────────────────────────────────
  {
    files: ["src/**/*.ts", "test/**/*.ts"],

    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: __dirname,
      },
    },

    rules: {
      // ── ESLint core ──────────────────────────────────────────────────────────
      eqeqeq: ["error", "always"],
      "no-console": "warn",
      "no-implicit-coercion": "error",
      "no-var": "error",

      // ── TypeScript rules ────────────────────────────────────────────────────
      "@typescript-eslint/no-explicit-any": "error",

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],

      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",

      "@typescript-eslint/prefer-nullish-coalescing": "error",
      "@typescript-eslint/prefer-optional-chain": "error",

      "@typescript-eslint/no-unnecessary-type-assertion": "error",

      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],

      "@typescript-eslint/consistent-type-exports": "error",

      "@typescript-eslint/no-redundant-type-constituents": "error",

      "@typescript-eslint/explicit-function-return-type": [
        "error",
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
          allowDirectConstAssertionInArrowFunctions: true,
        },
      ],
    },
  },

  // ── Relaxed rules for tests/examples ────────────────────────────────────────
  {
    files: ["test/**/*.ts"],

    rules: {
      "no-console": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-floating-promises": "off",
    },
  },

  // ── Prettier (must be last) ─────────────────────────────────────────────────
  prettierConfig,
);
