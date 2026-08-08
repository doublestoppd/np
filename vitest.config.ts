import { defineConfig } from "vitest/config";
import { fileURLToPath } from "url";

export default defineConfig({
  esbuild: {
    // Next.js uses the automatic JSX runtime; mirror it for .test.tsx.
    jsx: "automatic",
  },
  resolve: {
    alias: {
      "@test": fileURLToPath(new URL("./test", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "prisma/**/*.test.ts",
      // The deploy scripts are checked against startup validation, so a
      // variable production needs cannot be added without providing it.
      "scripts/**/*.test.ts",
    ],
  },
});
