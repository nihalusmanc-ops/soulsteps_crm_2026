import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testIgnore: [],
  testMatch: "**/password-login.spec.ts",
  webServer: {
    ...(base.webServer as object),
    command: "node scripts/test-server.mjs",
    url: "http://127.0.0.1:8791/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    env: { SOULSTEPS_PASSWORD_TEST: "1" },
  },
});
