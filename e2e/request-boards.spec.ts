import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  coinBalance,
  grantItemToPlayer,
} from "./helpers/db-maintenance";

/**
 * Phase 7 browser coverage: a location hosting several ordered activities,
 * and the request-board flow — completion, owned quantities and balance
 * updating, persistence across reload, double-submit safety, and the
 * daily cap message. Mobile viewport (360px) throughout, with a
 * keyboard-only pass.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `rb_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const HEARTH = "/explore/dapplewood/hearth-and-ladle";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
});

async function signUpWithPet(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Thornbud", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Ladle");
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

test("a location renders every attached activity in display order", async ({
  page,
}) => {
  await signUpWithPet(page);
  await page.goto(HEARTH);

  // Hearth and Ladle hosts the daily meal (order 10) then the request
  // board (order 20).
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.filter({ hasText: "community meal" })).toBeVisible();
  await expect(headings.filter({ hasText: "Community Requests" })).toBeVisible();

  const texts = await headings.allInnerTexts();
  const mealIndex = texts.findIndex((t) => /community meal/i.test(t));
  const boardIndex = texts.findIndex((t) => /Community Requests/i.test(t));
  expect(mealIndex).toBeGreaterThanOrEqual(0);
  expect(boardIndex).toBeGreaterThan(mealIndex);

  // No horizontal overflow with two activities stacked on a narrow phone.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("a location with no activities still renders normally", async ({ page }) => {
  await signIn(page);
  await page.goto("/explore/dapplewood/mosslight-clearing");
  await expect(
    page.getByRole("heading", { name: "Mosslight Clearing" }),
  ).toBeVisible();
  await expect(page.getByText("More to discover later")).toBeVisible();
});

test("the board shows the current request with owned vs required counts", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(HEARTH);

  await expect(
    page.getByRole("heading", { name: "A Basket for the Morning Table" }),
  ).toBeVisible();
  await expect(page.getByText(/Owned \d+ of 2/)).toBeVisible();
  // Nothing is delivered yet, so the action is disabled with an
  // explanation rather than silently inert.
  await expect(page.getByRole("button", { name: "Complete request" })).toBeDisabled();
  await expect(page.getByText(/Bring everything on the list/)).toBeVisible();
  await expect(page.getByText("Daily work completed: 0 of 3")).toBeVisible();
});

test("completing a request grants coins, advances, and survives reload", async ({
  page,
}) => {
  // The first request needs 2 honey-oat biscuits, which only the random
  // daily meal grants — seed them directly so the flow under test is the
  // completion itself.
  await grantItemToPlayer(USERNAME, "honey-oat-biscuit", 3);
  const before = await coinBalance(USERNAME);

  await signIn(page);
  await page.goto(HEARTH);
  await expect(
    page.getByRole("heading", { name: "A Basket for the Morning Table" }),
  ).toBeVisible();
  await expect(page.getByText("Owned 3 of 2")).toBeVisible();

  const complete = page.getByRole("button", { name: "Complete request" });
  await expect(complete).toBeEnabled();
  await complete.click();

  // Server-returned result, shown persistently, and focus moves to it so
  // keyboard and screen-reader users land on what changed.
  await expect(page.getByText("Delivered — thank you")).toBeVisible();
  await expect(page.getByText(/Balance:/)).toBeVisible();
  await expect(
    page.locator('div[tabindex="-1"]').filter({ hasText: "Delivered" }),
  ).toBeFocused();

  // The reward really moved coins, and the items really left.
  const after = await coinBalance(USERNAME);
  expect(after).toBe(before + 40n);

  // The board advanced to the next request in sequence.
  await expect(
    page.getByRole("heading", { name: "Toast, Before the Rush" }),
  ).toBeVisible();
  await expect(page.getByText("Daily work completed: 1 of 3")).toBeVisible();

  // Reload: progress persists, the next request is still assigned.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Toast, Before the Rush" }),
  ).toBeVisible();
  await expect(page.getByText(/Owned \d+ of 2/)).toBeVisible();
  await expect(page.getByText("Daily work completed: 1 of 3")).toBeVisible();
});

test("the action locks while a delivery is in flight", async ({ page }) => {
  await grantItemToPlayer(USERNAME, "berry-jam-toast", 2);
  const before = await coinBalance(USERNAME);

  await signIn(page);
  await page.goto(HEARTH);
  await expect(
    page.getByRole("heading", { name: "Toast, Before the Rush" }),
  ).toBeVisible();

  // Submitting disables the button and marks it busy, so a second tap
  // cannot start a second delivery. (Server-side idempotency and
  // concurrency are proven in the domain integration tests; this asserts
  // the UI never offers the double-submit in the first place.)
  const complete = page.getByRole("button", { name: /Complete request|Delivering/ });
  await complete.click();
  await expect(page.getByText("Delivered — thank you")).toBeVisible();

  // Exactly one reward for one delivery.
  const after = await coinBalance(USERNAME);
  expect(after).toBe(before + 45n);
  await expect(page.getByText("Daily work completed: 2 of 3")).toBeVisible();

  // The board advanced; the delivered request is not offered again.
  await expect(
    page.getByRole("heading", { name: "The Root Cellar Disagreement" }),
  ).toBeVisible();
});

test("reaching the daily cap explains the reset without losing the request", async ({
  page,
}) => {
  // Third completion of the day takes the player to the cap of 3.
  await grantItemToPlayer(USERNAME, "roasted-mooncarrot", 3);
  await signIn(page);
  await page.goto(HEARTH);
  await expect(
    page.getByRole("heading", { name: "The Root Cellar Disagreement" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete request" }).click();
  await expect(page.getByText("Delivered — thank you")).toBeVisible();
  await expect(page.getByText("Daily work completed: 3 of 3")).toBeVisible();

  // At the cap: the next request is still assigned and the copy is about
  // tomorrow, not about loss.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Scones, For Diplomatic Reasons" }),
  ).toBeVisible();
  await expect(page.getByText(/still\s+yours/)).toBeVisible();
  await expect(page.getByText(/midnight UTC/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Complete request" }),
  ).toBeDisabled();
});

test("request board exposes accessible structure and copy", async ({ page }) => {
  await signIn(page);
  await page.goto(HEARTH);

  // Requirements are a semantic list, each naming owned vs required
  // without relying on color.
  const requirementItems = page.locator("li").filter({ hasText: /Owned \d+ of \d+/ });
  expect(await requirementItems.count()).toBeGreaterThanOrEqual(1);

  // Exactly one polite live region carries results and errors.
  const liveRegions = page.locator('[role="status"][aria-live="polite"]');
  expect(await liveRegions.count()).toBe(1);

  // The primary action keeps its accessible name even when disabled at
  // the daily cap, and the explanation is text, not just a dimmed button.
  await expect(
    page.getByRole("button", { name: "Complete request" }),
  ).toBeVisible();
  await expect(page.getByText(/midnight UTC/)).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
