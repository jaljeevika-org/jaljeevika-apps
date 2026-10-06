import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests. Run them with `npm run test:e2e` (scripts/run-e2e.mjs),
 * which prepares a throwaway database first. They drive a production build
 * (`next start`) in the locally installed Microsoft Edge, with a local mail
 * catcher and stub "applications" to launch.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;
const SMTP_PORT = process.env.E2E_SMTP_PORT ?? "2025";
const MAIL_HTTP_PORT = process.env.E2E_MAIL_HTTP_PORT ?? "2080";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    channel: process.env.E2E_BROWSER_CHANNEL ?? "msedge",
    headless: process.env.E2E_HEADED !== "1",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 860 },
  },
  outputDir: "test-results",
  webServer: [
    {
      command: "node scripts/dev-mail.mjs",
      url: `http://127.0.0.1:${MAIL_HTTP_PORT}/api/messages`,
      env: { DEV_MAIL_SMTP_PORT: SMTP_PORT, DEV_MAIL_HTTP_PORT: MAIL_HTTP_PORT },
      reuseExistingServer: false,
    },
    {
      command: "node tests/e2e/stub-apps.mjs",
      url: "http://127.0.0.1:3199/health",
      reuseExistingServer: false,
    },
    {
      command: `node node_modules/next/dist/bin/next start --port ${PORT}`,
      url: `${BASE}/api/health`,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: process.env.E2E_DATABASE_URL ?? "",
        DATABASE_URL_UNPOOLED: process.env.E2E_DATABASE_URL ?? "",
        APP_BASE_URL: BASE,
        EMAIL_PROVIDER: "smtp",
        SMTP_HOST: "127.0.0.1",
        SMTP_PORT,
        SMTP_USER: "",
        SMTP_PASSWORD: "",
        FROM_EMAIL: "no-reply@e2e.jaljeevika.local",
        FROM_NAME: "Jaljeevika App Portal",
        STORAGE_DRIVER: process.env.E2E_STORAGE_DRIVER ?? "database",
        ...(process.env.E2E_AWS_ENDPOINT_URL_S3 ? { AWS_ENDPOINT_URL_S3: process.env.E2E_AWS_ENDPOINT_URL_S3 } : {}),
      },
    },
  ],
});
