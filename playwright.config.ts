import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/browser",
  timeout: 20_000,
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "line",
  use: {
    baseURL: "http://127.0.0.1:4187",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run examples:install-current && npm run example:build && npm run example:preview",
      url: "http://127.0.0.1:4187",
      reuseExistingServer: false,
      // CI browser matrices can spend most of 30s rebuilding the packed example.
      timeout: 90_000,
    },
    {
      command: "vite --host 127.0.0.1 --port 4274 --strictPort",
      url: "http://127.0.0.1:4274/tests/browser/fixtures/frame-parity.html",
      reuseExistingServer: false,
      timeout: 30_000,
    },
  ],
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
});
