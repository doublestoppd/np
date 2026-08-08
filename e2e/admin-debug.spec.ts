import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  coinBalance,
  promoteToAdmin,
} from "./helpers/db-maintenance";

/**
 * The administrator's debug screen, on a 360px viewport.
 *
 * The screen had no browser coverage at all, and it has just grown the
 * one control in the game that MINTS coins. Two things are worth proving
 * in a real browser rather than in isolation: that an ordinary player
 * cannot reach it, and that a grant moves the wallet without breaking the
 * reconciliation report rendered a few lines below the button.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const ADMIN = `adm_${RUN_ID}`.slice(0, 20);
const PLAYER = `plr_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
});

async function signUpWithPet(page: Page, username: string, petName: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Mistfin", { exact: true }).click();
  await page.getByLabel("Name your companion").fill(petName);
  await page.getByRole("button", { name: "Begin the adventure" }).click();
  await page.waitForURL("**/");
}

async function signIn(page: Page, username: string) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}

test("an ordinary player is sent home rather than shown the debug screen", async ({
  page,
}) => {
  await signUpWithPet(page, PLAYER, "Pebble");
  await page.goto("/admin");
  // Authenticated but not authorised: home, not the sign-in page.
  await page.waitForURL("**/");
  await expect(page.getByRole("heading", { name: /Debug/ })).toHaveCount(0);
  // And the tab is not offered either.
  await expect(page.getByRole("link", { name: "Debug" })).toHaveCount(0);
});

test("granting coins moves the wallet and leaves reconciliation clean", async ({
  page,
}) => {
  await signUpWithPet(page, ADMIN, "Quill");
  await promoteToAdmin(ADMIN);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Debug" })).toBeVisible();

  /**
   * How many findings the report shows, whatever they are.
   *
   * This deliberately does NOT assert "No findings." The report runs
   * across every account in the database, so asserting it is empty makes
   * this test a claim about the whole dev database — which any hand
   * testing, any half-finished experiment, any directly-edited row breaks.
   * It failed exactly that way the first time it ran. What the test
   * actually means is "the grant adds none", so it counts before and
   * after and compares.
   */
  const findingCount = async () =>
    (await page.getByText("No findings.").count()) > 0
      ? 0
      : await page.getByRole("listitem").filter({ hasText: /—/ }).count();
  const findingsBefore = await findingCount();

  const before = await coinBalance(ADMIN);
  await page.getByLabel("Amount").fill("2500");
  await page.getByRole("button", { name: `Grant to ${ADMIN}` }).click();

  await expect(page.getByText(/2,500 coins granted/)).toBeVisible();
  expect(await coinBalance(ADMIN)).toBe(before + 2500n);

  // The wallet credit and its ledger row are one transaction, so the
  // report on this same page must be no worse than it was.
  expect(await findingCount()).toBe(findingsBefore);

  // The player is told, in their own history, what happened to their
  // purse — an adjustment is not a secret from the person it lands on.
  await page.goto("/history");
  await expect(page.getByText("Adjustment").first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("a grant of nothing is refused, and says what would be accepted", async ({
  page,
}) => {
  // Each test gets a fresh context, so the session from the last one is
  // not carried over.
  await signIn(page, ADMIN);
  await page.goto("/admin");
  const before = await coinBalance(ADMIN);

  const amount = page.getByLabel("Amount");
  const grant = page.getByRole("button", { name: `Grant to ${ADMIN}` });

  // The browser stops it first, from `min`: the form never submits.
  await amount.fill("0");
  await grant.click();
  await expect(page.getByText(/coins granted/)).toHaveCount(0);
  expect(await coinBalance(ADMIN)).toBe(before);

  // Now take the attribute away and send it anyway. This is the check
  // that matters — a server action is a public endpoint, and the input
  // attributes are a convenience for the person typing, not a guard.
  await amount.evaluate((node) => node.removeAttribute("min"));
  await amount.fill("0");
  await grant.click();

  await expect(page.getByText(/between 1 and 1,000,000,000/)).toBeVisible();
  expect(await coinBalance(ADMIN)).toBe(before);
});
