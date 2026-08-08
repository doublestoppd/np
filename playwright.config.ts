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
    env: {
      // Random events are OFF for the suite. They are modal by design, so
      // an 8% chance per page view would occasionally drop a dialog over
      // an unrelated assertion and make a passing suite flaky at random.
      // The system's own behaviour is covered deterministically in
      // src/server/modules/events/*.test.ts; e2e/random-events.spec.ts
      // turns it on for one dedicated run (see that file's header).
      RANDOM_EVENT_CHANCE_BP: "0",

      /**
       * Production secrets, because `next start` IS production.
       *
       * Without these the suite could not start at all: startup
       * validation refused the server, Playwright waited 120s for a URL
       * that would never answer, and the whole thing failed before a
       * single test ran (src/server/security/configuration.ts).
       *
       * That had been true since the config validator started requiring
       * them — the same omission that took the demo droplet down, in a
       * second place. It went unnoticed because a suite that cannot start
       * looks like a suite nobody ran.
       *
       * These are deliberately NOT the development fallbacks, which the
       * validator refuses by name. They are fixed rather than random so a
       * run is reproducible; nothing here is secret, because nothing here
       * guards anything — this server is thrown away at the end of the
       * run and never faces a network.
       */
      RESTOCK_SEED_SECRET: "e2e-restock-seed-not-a-real-secret",
      CRON_SECRET: "e2e-cron-not-a-real-secret",
      DAILY_ROTATION_SECRET: "e2e-rotation-not-a-real-secret",
      APP_URL: `http://127.0.0.1:${PORT}`,
      // No proxy in front of the test server, so forwarded addresses are
      // not to be trusted. "false" rather than unset: the validator wants
      // the choice made explicitly, which is the point of the variable.
      TRUSTED_PROXY: "false",
    },
  },
});
