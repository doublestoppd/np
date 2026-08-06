import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

/**
 * Critical browser flows (see e2e/). Runs against a production build:
 *   npm run build && npm run test:e2e
 * Uses the development database; tests create uniquely named users and only
 * add data. On a fresh machine run `npx playwright install chromium` once —
 * in environments with a preinstalled browser (PLAYWRIGHT_BROWSERS_PATH),
 * the fallback executablePath below is used automatically instead.
 */
const PREINSTALLED_CHROMIUM = "/opt/pw-browsers/chromium";

const PORT = 3100;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Server actions + redirect round-trips share one small machine with the
  // app server in CI-like environments; give assertions breathing room.
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    launchOptions: existsSync(PREINSTALLED_CHROMIUM)
      ? { executablePath: PREINSTALLED_CHROMIUM }
      : {},
  },
  projects: [
    {
      // Mobile-first: the entire journey must work at 360 CSS pixels.
      name: "mobile-360",
      use: { viewport: { width: 360, height: 740 } },
    },
  ],
  webServer: {
    command: `npm run start -- --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/sign-in`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
