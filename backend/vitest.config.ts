import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    globals: true,
  },
  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "./src"),
    },
    conditions: ["node", "import", "require", "default"],
  },
});
