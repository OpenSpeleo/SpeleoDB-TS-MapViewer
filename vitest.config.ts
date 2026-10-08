import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { conditions: ["speleodb-source"] },
  test: {
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    environment: "node",
  },
});
