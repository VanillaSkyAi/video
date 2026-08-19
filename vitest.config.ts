import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@vanillaskyai/video/server": fileURLToPath(
        new URL("./src/server.ts", import.meta.url),
      ),
      "@vanillaskyai/video/templates": fileURLToPath(
        new URL("./src/templates.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
