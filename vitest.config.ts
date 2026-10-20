import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://rayed:rayed@localhost:5432/rayed_test?schema=erp";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 120000,
    env: { DATABASE_URL: TEST_DB, NODE_ENV: "test" },
    globalSetup: ["tests/global-setup.ts"],
    alias: { "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname },
  },
});
