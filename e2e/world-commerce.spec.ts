import { expect, test, type Page } from "@playwright/test";
import { clearRateLimitWindows } from "./helpers/db-maintenance";

/**
 * Phase 2 critical flows on a 360px viewport: world-map navigation with
 * Back to Map, an NPC shop purchase, player-shop listing/purchase between
 * two accounts, proceeds claim, and market search.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const SELLER = `wc_s_${RUN_ID}`.slice(0, 20);
const BUYER = `wc_b_${RUN_ID}`.slice(0, 20);
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
  await page.getByText("Thornbud", { exact: true }).click();
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

test("world map → region map → location → Back to Map", async ({ page }) => {
  await signUpWithPet(page, SELLER, "Moss");

  await page.goto("/explore");
  await expect(
    page.getByRole("heading", { name: "World Map" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Dapplewood" }).click();
  await page.waitForURL("**/explore/dapplewood");
  await expect(
    page.getByRole("heading", { name: "Dapplewood", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Mosslight Clearing/ }),
  ).toBeVisible();
  // Unpublished locations stay invisible.
  await expect(page.getByText("The Listening Stump")).toBeHidden();

  await page.getByRole("link", { name: "Mosslight Clearing" }).click();
  await page.waitForURL("**/explore/dapplewood/mosslight-clearing");
  await expect(
    page.getByRole("heading", { name: "Mosslight Clearing" }),
  ).toBeVisible();

  // The quiet back link resolves directly to the containing region.
  await page.getByRole("link", { name: "Back to Dapplewood" }).click();
  await page.waitForURL("**/explore/dapplewood");

  // No horizontal overflow at 360px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("NPC shop: stocked shelves and an atomic purchase", async ({ page }) => {
  await signIn(page, SELLER);
  await page.goto("/explore/dapplewood/the-mossy-market");
  await expect(
    page.getByRole("heading", { name: "The Mossy Market" }).first(),
  ).toBeVisible();
  // Shopkeeper flavor copy is static presentation content.
  await expect(page.getByText(/hedgehog of few words/)).toBeVisible();

  await page.waitForLoadState("networkidle");
  // Stock is rarity-sorted descending; the last Buy button is an affordable
  // common (a fresh account holds 200 coins).
  const buyButtons = page.getByRole("button", { name: /^Buy / });
  await expect(buyButtons.first()).toBeVisible();
  await buyButtons.last().click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText(/^Bought 1 ×/)).toBeVisible();
});

test("player shop: list, second account buys, seller claims proceeds", async ({
  page,
  browser,
}) => {
  await signIn(page, SELLER);
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");

  // List one starter Sunberry Cluster for 50 coins.
  const sunberryValue = await page
    .getByLabel("Item")
    .locator("option", { hasText: "Sunberry Cluster" })
    .getAttribute("value");
  await page.getByLabel("Item").selectOption(sunberryValue as string);
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Price each").fill("50");
  await page.getByRole("button", { name: "List it" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText(/^Listed 1 ×/)).toBeVisible();

  // The buyer visits the public storefront and purchases.
  const buyerContext = await browser.newContext();
  const buyerPage = await buyerContext.newPage();
  await signUpWithPet(buyerPage, BUYER, "Fern");
  await buyerPage.goto(`/shops/${SELLER.toLowerCase()}`);
  // Seller identity is visible and links to the owner's profile.
  await expect(
    buyerPage.getByRole("link", { name: SELLER, exact: true }),
  ).toBeVisible();
  await buyerPage.waitForLoadState("networkidle");
  await buyerPage.getByRole("button", { name: /^Buy — 50/ }).click();
  await buyerPage.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(buyerPage.getByText(/^Bought 1 ×/)).toBeVisible();
  await buyerContext.close();

  // Seller claims the proceeds exactly once.
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Claim 50 coins")).toBeVisible();
  await page.getByRole("button", { name: "Claim 50 coins" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText(/Claimed 50 coins/)).toBeVisible();
});

test("market search finds items and links to detail pages", async ({ page }) => {
  await signIn(page, SELLER);
  await page.goto("/market");
  await page.getByLabel("Search items").fill("sunberry");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(
    page.getByRole("heading", { name: "Sunberry Cluster" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Sunberry Cluster" }).click();
  await page.waitForURL("**/items/sunberry-cluster");
  await expect(
    page.getByRole("heading", { name: "Sunberry Cluster" }),
  ).toBeVisible();
  await expect(page.getByText("Estimated value")).toBeVisible();
});
