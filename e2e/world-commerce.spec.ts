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

/**
 * How many copies the market says are for sale for a single-item query
 * (0 when the item is absent entirely).
 */
async function forSaleCount(page: Page, query: string): Promise<number> {
  await page.goto("/market");
  await page.getByLabel("Search items").fill(query);
  await page.getByRole("button", { name: "Search" }).click();
  await page.waitForURL(/\/market\?/);
  if ((await page.getByText("Nothing for sale").count()) > 0) {
    return 0;
  }
  const label = await page.getByText(/^\d+ for sale$/).first().textContent();
  return Number(/^(\d+)/.exec(label?.trim() ?? "")?.[1] ?? "0");
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

  // The shelf card carries no quantity field — browsing is browsing.
  await expect(page.getByLabel("Qty")).toHaveCount(0);

  // Stock is rarity-sorted descending; the last Buy button is an affordable
  // common (a fresh account holds 200 coins).
  const buyButtons = page.getByRole("button", { name: /^Buy / });
  await expect(buyButtons.first()).toBeVisible();
  await buyButtons.last().click();

  // Choosing to buy is its own moment, with the item's actual details.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("How many?")).toHaveValue("1");
  const singleTotal = await dialog
    .getByRole("button", { name: /^Buy for / })
    .textContent();

  // The total tracks the quantity (display only — the server reprices).
  await dialog.getByLabel("How many?").fill("2");
  await expect(dialog.getByRole("button", { name: /^Buy for / })).not.toHaveText(
    singleTotal!,
  );
  await dialog.getByLabel("How many?").fill("1");

  await dialog.getByRole("button", { name: /^Buy for / }).click();
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

  // A listing of more than one lets the buyer choose how many, the same
  // way an NPC shelf does — and the rest stays on the shelf.
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");
  const loafValue = await page
    .getByLabel("Item")
    .locator("option", { hasText: "Honey Oat Loaf" })
    .getAttribute("value");
  await page.getByLabel("Item").selectOption(loafValue as string);
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Price each").fill("10");
  await page.getByRole("button", { name: "List it" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });

  const partialContext = await browser.newContext();
  const partialPage = await partialContext.newPage();
  await signIn(partialPage, BUYER);
  await partialPage.goto(`/shops/${SELLER.toLowerCase()}`);
  await partialPage.waitForLoadState("networkidle");
  await partialPage
    .getByRole("button", { name: /^Buy Honey Oat Loaf/ })
    .click();
  const partialDialog = partialPage.getByRole("dialog");
  await expect(partialDialog).toBeVisible();
  await expect(partialDialog.getByText(/sold by/)).toBeVisible();
  await partialDialog.getByLabel("How many?").fill("1");
  await partialDialog.getByRole("button", { name: /^Buy for 10/ }).click();
  await partialPage.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(partialPage.getByText(/1 still on offer/)).toBeVisible();
  // Still listed, so the remaining one can be bought by someone else.
  await expect(
    partialPage.getByRole("heading", { name: "Honey Oat Loaf" }),
  ).toBeVisible();
  await partialContext.close();

  // Seller claims the proceeds exactly once. The till holds both sales:
  // the whole 50-coin listing and the single loaf from the partial one.
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Claim 60 coins")).toBeVisible();
  await page.getByRole("button", { name: "Claim 60 coins" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText(/Claimed 60 coins/)).toBeVisible();
});

test("market lists only what is for sale, and pages through it", async ({
  page,
}) => {
  await signIn(page, SELLER);

  // What the market counts is listings, not ownership. Asserted as a
  // delta rather than an absolute: this database carries listings across
  // e2e runs, so no single test can claim a given item is unlisted
  // everywhere. The absolute rule — an owned but unlisted item never
  // appears — is covered against a controlled fixture in
  // src/server/modules/commerce/search.test.ts.
  const before = await forSaleCount(page, "sunberry");

  // The seller already owns Sunberry Clusters; listing one is what adds it.
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");
  const sunberryValue = await page
    .getByLabel("Item")
    .locator("option", { hasText: "Sunberry Cluster" })
    .getAttribute("value");
  await page.getByLabel("Item").selectOption(sunberryValue as string);
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Price each").fill("40");
  await page.getByRole("button", { name: "List it" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });

  expect(await forSaleCount(page, "sunberry")).toBe(before + 1);
  await expect(
    page.getByRole("heading", { name: "Sunberry Cluster" }),
  ).toBeVisible();
  await expect(page.getByText(/^Showing \d+–\d+ of \d+$/)).toBeVisible();

  // The page-size choice survives the search rather than snapping back.
  // Paging arithmetic itself is covered against a controlled fixture in
  // src/server/modules/commerce/search.test.ts.
  await page.getByLabel("Per page").selectOption("10");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/perPage=10/);
  await expect(page.getByLabel("Per page")).toHaveValue("10");

  await page.getByRole("link", { name: "Sunberry Cluster" }).click();
  await page.waitForURL(/\/items\/sunberry-cluster/);
  await expect(
    page.getByRole("heading", { name: "Sunberry Cluster" }),
  ).toBeVisible();
  await expect(page.getByText("Estimated value")).toBeVisible();
});
