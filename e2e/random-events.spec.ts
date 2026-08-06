import { expect, test } from "@playwright/test";

/**
 * Browser coverage for random events, at 360px.
 *
 * Opt-in, because it needs a server running at 100% event chance and that
 * setting would drop a modal over every other spec's assertions. Run it
 * against a dedicated server:
 *
 *   npm run build
 *   RANDOM_EVENT_CHANCE_BP=10000 RESTOCK_SEED_SECRET=… CRON_SECRET=… \
 *     APP_URL=http://127.0.0.1:3100 npx next start -p 3100 &
 *   RUN_RANDOM_EVENT_E2E=1 npx playwright test e2e/random-events.spec.ts
 *
 * The system's own rules — pacing, concurrency, effects, replay — are
 * covered deterministically in src/server/modules/events/*.test.ts. What
 * only a browser can show is the part this file asserts: that the roll
 * actually fires on a real navigation, that the result is presented as a
 * dismissible dialog, and that it lands in the history the player can
 * check afterwards.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `re_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

test.skip(
  process.env.RUN_RANDOM_EVENT_E2E !== "1",
  "needs a server started with RANDOM_EVENT_CHANCE_BP=10000 — see file header",
);

test("an event fires on a real navigation and is recorded", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // Onboarding is not an eligible route, so nothing fires here.
  await expect(
    page.getByRole("heading", { name: "Choose your companion" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.getByText("Thornbud", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Puddle");
  await page.getByRole("button", { name: "Begin the adventure" }).click();

  // Home is eligible: the watcher rolls once the route has actually
  // loaded, and the server's response is presented as a modal dialog.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading")).toBeVisible();

  const title = await dialog.getByRole("heading").textContent();
  expect(title?.trim()).not.toBe("");

  // Dismissible, and it stays dismissed.
  await dialog.getByRole("button", { name: "Carry on" }).click();
  await expect(dialog).toBeHidden();

  // The cooldown means a second navigation produces nothing, so the page
  // behind stays usable rather than becoming a wall of dialogs.
  await page.goto("/inventory");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // And the player can verify it afterwards — which is the whole point of
  // the log, since the roll commits before the browser hears about it.
  await page.goto("/history/events");
  await expect(
    page.getByRole("heading", { name: "Chance findings" }),
  ).toBeVisible();
  await expect(page.getByText(title!.trim(), { exact: false })).toBeVisible();

  // No horizontal overflow at 360px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
