import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  use: {
    baseURL: "http://127.0.0.1:8791",
    channel: process.env.CI ? undefined : "msedge",
    headless: true,
  },
  workers: 1,
  reporter: "list",
  webServer: {
    command: "node scripts/test-server.mjs",
    url: "http://127.0.0.1:8791/api/health",
    reuseExistingServer: false,
    timeout: 120000,
  },
});
