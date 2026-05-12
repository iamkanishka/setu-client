import { builtinModules } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [
    dts({
      include: ["src/**/*"],
      outDir: "dist",
      rollupTypes: false,
      copyDtsFiles: true,
    }),
  ],

  build: {
    lib: {
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        "payments/upi": resolve(__dirname, "src/payments/upi.ts"),
        "payments/bbps": resolve(__dirname, "src/payments/bbps.ts"),
        "data/aa": resolve(__dirname, "src/data/aa.ts"),
        "data/esign": resolve(__dirname, "src/data/esign.ts"),
        "data/kyc/index": resolve(__dirname, "src/data/kyc/index.ts"),
        "webhook/index": resolve(__dirname, "src/webhook/index.ts"),
      },

      formats: ["es", "cjs"],

      fileName: (format, entryName) =>
        format === "es"
          ? `${entryName}.js`
          : `${entryName}.cjs`,
    },

    rollupOptions: {
      external: [
        ...builtinModules,
        /^node:/,
      ],

      output: {
        exports: "named",
        preserveModules: false,
      },
    },

    target: "node18",
    minify: false,
    sourcemap: true,
  },

  test: {
    globals: true,

    environment: "node",

    coverage: {
      provider: "v8",

      reporter: ["text", "lcov", "html"],

      include: ["src/**/*.ts"],

      exclude: ["src/index.ts"],

      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },

    mockReset: true,
    restoreMocks: true,
  },

  resolve: {
    alias: {
      "@setu": resolve(__dirname, "src"),
    },
  },
});