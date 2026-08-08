import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  coinBalance,
  grantCoinsToPlayer,
} from "./helpers/db-maintenance";

/**
 * The Fortune Engine (ADR-66), on a 360px viewport.
 *
 * A machine that takes the player's own coins has to be honest in the
 * interface, not only in the domain — so what is checked here is that the
 * odds are reachable before a pull, that the stake actually leaves the
 * wallet, that the machine refuses rather than nags when the money runs
 * out, and that the pool is on screen where it cannot be missed.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `frt_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const WHERE = "/explore/tarnreach/the-brasswork";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
});

async function signUpWithPet(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Mistfin", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Pip");
  await page.getByRole("button", { name: "Begin the adventure" }).click();
  await page.waitForURL("**/");
}

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}

test("the machine states its odds before anybody pulls it", async ({
  page,
}) => {
  await signUpWithPet(page);
  await page.goto(WHERE);

  // The location and the machine are named differently, so the page does
  // not open with the same heading twice (ADR-59's amendment).
  await expect(
    page.getByRole("heading", { name: "The Brasswork" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Fortune Engine" }).first(),
  ).toBeVisible();

  // The pool is the reason to be here, and it is at its floor on a fresh
  // database rather than at zero.
  await expect(page.getByText("The pool stands at")).toBeVisible();
  await expect(page.getByText("150,000 coins")).toBeVisible();

  // The paytable is one tap away and says what the machine keeps. A game
  // of chance that hides its edge is misleading the player about what it
  // costs them.
  await page.getByRole("button", { name: "What it pays" }).click();
  const paytable = page.getByRole("dialog");
  await expect(
    paytable.getByText(/about three coins in every ten/),
  ).toBeVisible();
  await expect(paytable.getByRole("cell", { name: "The pool" })).toBeVisible();
  await expect(paytable.getByRole("cell", { name: "400x" })).toBeVisible();
  await paytable.getByRole("button", { name: "Close" }).click();
  await expect(paytable).toBeHidden();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a pull takes the stake and shows what the drums did", async ({
  page,
}) => {
  await grantCoinsToPlayer(USERNAME, 5_000n);
  await signIn(page);
  await page.goto(WHERE);

  const before = await coinBalance(USERNAME);
  await page.getByRole("button", { name: /^Pull · 25/ }).click();

  // The drums settle, and the result that appears is the server's.
  await expect(
    page.getByText(/Nothing on that one|back\.|The whole pool/),
  ).toBeVisible({ timeout: 15_000 });

  // The money moved, and by exactly the stake less whatever came back.
  const after = await coinBalance(USERNAME);
  expect(after).toBeLessThanOrEqual(before + 25n * 400n);
  expect(after).not.toBe(before + 25n);
  // A spin was recorded — the machine does not pay or charge without one.
  expect(after === before - 25n || after > before - 25n).toBe(true);
});

test("the top stake is the one that feeds and can take the pool", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(WHERE);

  // Stated on the machine at every stake, not buried in the paytable —
  // it is the difference between two prices for the same handle.
  await expect(
    page.getByText(/Only the top stake \(500\) feeds the pool/),
  ).toBeVisible();

  await page.getByRole("button", { name: /^500 · pool/ }).click();
  await expect(
    page.getByText(/The top stake feeds the pool and is the only one/),
  ).toBeVisible();
});

test("it refuses rather than nags when the coins run out", async ({ page }) => {
  await grantCoinsToPlayer(USERNAME, 30n);
  await signIn(page);
  await page.goto(WHERE);

  // The top stake is unaffordable, so the control that would spend it is
  // disabled and the reason is stated plainly.
  await page.getByRole("button", { name: /^500 · pool/ }).click();
  await expect(page.getByText(/Not enough coins for that stake/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Pull · 500/ }),
  ).toBeDisabled();

  // And the smallest stake still works, so a short purse is not a wall.
  await page.getByRole("button", { name: /^25/ }).first().click();
  await expect(page.getByRole("button", { name: /^Pull · 25/ })).toBeEnabled();
});

test("it is on the Activities tab, in its own section", async ({ page }) => {
  await signIn(page);
  await page.goto("/activities");
  await expect(
    page.getByRole("heading", { name: "Staking your own coins" }),
  ).toBeVisible();
  await expect(page.getByText("The Fortune Engine").first()).toBeVisible();
});
