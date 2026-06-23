import { defineConfig } from "vitest/config";
import path from "path";

/**
 * Integration tests run against a real PostgreSQL database.
 * Set DATABASE_URL to a disposable test DB and run `prisma migrate deploy`
 * before invoking `npm run test:integration`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globals: true,
    testTimeout: 20_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
    conditions: ["node", "import", "require", "default"],
  },
});
