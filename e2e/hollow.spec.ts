import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  coinBalance,
  grantCoinsToPlayer,
} from "./helpers/db-maintenance";

/**
 * The Hollow at 360px: buy something, stand it somewhere, change the
 * light, and let somebody else look at it.
 *
 * The arranging flow is the thing worth covering in a real browser. It is
 * deliberately not a drag canvas — it is "tap a place, tap a thing" — so
 * this asserts that path works with a thumb and that a keyboard reaches
 * the same controls, which a canvas could not have offered without a
 * second implementation.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `hw_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

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
  await page.getByLabel("Name your companion").fill("Moss");
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

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test("a new Hollow is furnished enough to look lived in", async ({ page }) => {
  await signUpWithPet(page);
  await page.goto("/hollow");

  await expect(page.getByRole("heading", { name: "Your Hollow" })).toBeVisible();
  // Three worn things are already standing: an empty eight-place picture
  // would read as a chore list on day one.
  await expect(page.getByText("Steadying Stone").first()).toBeVisible();

  // No checklist anywhere: no totals, no fractions, no percentages.
  const body = (await page.locator("body").innerText()).toLowerCase();
  expect(body).not.toMatch(/\b\d+\s*(of|\/)\s*\d+\b/);
  expect(body).not.toContain("complete");
  expect(body).not.toContain("%");

  await noOverflow(page);
});

test("buy a furnishing, then stand it somewhere in two taps", async ({
  page,
}) => {
  await signIn(page);
  await grantCoinsToPlayer(USERNAME, 5_000n);
  await page.goto("/hollow/catalogue");

  await expect(
    page.getByRole("heading", { name: "Furnishings" }),
  ).toBeVisible();
  // Sorted by price and nothing else — no rarity badges anywhere.
  await expect(page.getByText("Ultra rare")).toBeHidden();

  const before = await coinBalance(USERNAME);
  const card = page
    .getByRole("listitem")
    .filter({ hasText: "Bell for Nobody" })
    .first();
  await card.getByRole("button", { name: /^Buy/ }).click();
  await expect(page.getByText(/in your satchel/i)).toBeVisible();
  expect(await coinBalance(USERNAME)).toBe(before - 420n);

  // The same object again, because owning two is the point.
  await card.getByRole("button", { name: /^Buy/ }).click();
  await expect(page.getByText(/2 in your keeping/i)).toBeVisible();

  await page.goto("/hollow");
  // Tap a place…
  await page.getByRole("link", { name: /The right verge/ }).click();
  // …then tap a thing.
  await page
    .getByRole("button", { name: /Bell for Nobody/ })
    .first()
    .click();
  await page.waitForURL(/\/hollow(\?|$)/);
  await expect(
    page.getByRole("link", { name: /The right verge.*Bell for Nobody/ }),
  ).toBeVisible();

  await noOverflow(page);
});

test("an air is bought once and belongs to every ground", async ({ page }) => {
  await signIn(page);
  await grantCoinsToPlayer(USERNAME, 80_000n);
  await page.goto("/hollow");

  const air = page
    .getByRole("listitem")
    .filter({ hasText: "First Thaw" })
    .first();
  // Anything at or above 1,000 coins asks before it spends.
  await air.getByRole("button", { name: /^Buy/ }).click();
  await page.getByRole("button", { name: /^Yes — 5,000/ }).click();
  await expect(page.getByText(/light has changed/i)).toBeVisible();

  // Applying it is free and instant, and it stays applied across a reload.
  await page.getByRole("button", { name: "First Thaw" }).first().click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "First Thaw" }).first(),
  ).toBeVisible();

  // A second ground costs what the ladder says, not what the picture is.
  const ground = page
    .getByRole("listitem")
    .filter({ hasText: "The Shallow Bank" })
    .first();
  const before = await coinBalance(USERNAME);
  await ground.getByRole("button", { name: /Take on/ }).click();
  await page.getByRole("button", { name: /^Yes — 6,000/ }).click();
  await expect(page.getByText(/nothing standing on it yet/i)).toBeVisible();
  expect(await coinBalance(USERNAME)).toBe(before - 6_000n);

  await expect(
    page.getByRole("heading", { name: "The Shallow Bank" }),
  ).toBeVisible();
  await noOverflow(page);
});

test("a visitor sees the pictures and nothing that ranks anybody", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/hollow");
  await page.getByLabel("Caption").first().fill("Mind the mud.");
  await page.getByRole("button", { name: "Save caption" }).first().click();
  await expect(page.getByText("Caption saved.")).toBeVisible();

  await page.goto(`/u/${USERNAME}/hollow`);
  await expect(page.getByText("Mind the mud.")).toBeVisible();

  await expect(
    // The heading uses a typographic apostrophe, so match loosely.
    page.getByRole("heading", { name: new RegExp(`${USERNAME}.s Hollow`) }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Lantern Clearing" }),
  ).toBeVisible();

  // No visit count, no likes, no rating, no ranking. The admiration
  // mechanism is that everything is buyable by anyone, forever.
  const body = (await page.locator("body").innerText()).toLowerCase();
  for (const forbidden of ["visits", "likes", "rank", "score", "featured"]) {
    expect(body).not.toContain(forbidden);
  }
  // And no controls: a visitor looks, they do not arrange.
  await expect(page.getByRole("button", { name: /Put .* away/ })).toBeHidden();

  await noOverflow(page);
});

test("arranging works from the keyboard alone", async ({ page }) => {
  await signIn(page);
  await page.goto("/hollow");
  const place = page.getByRole("link", { name: /The right verge/ });
  await place.focus();
  await expect(place).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(/place=/);

  const clear = page.getByRole("button", { name: /Put .* away/ });
  await clear.focus();
  await expect(clear).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL(/\/hollow(\?|$)/);
  await expect(
    page.getByRole("link", { name: /The right verge.*empty/ }),
  ).toBeVisible();
});
