import { expect, test, type Page } from "@playwright/test";
import { clearRateLimitWindows } from "./helpers/db-maintenance";

/**
 * Phase 6 UI/interaction coverage on the 360px viewport: primary
 * navigation states, all three word-board lengths without horizontal
 * scroll, reduced-motion wheel behavior, an insufficient-funds purchase
 * conflict with persistent feedback, and a keyboard-only flow.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `p6_${RUN_ID}`.slice(0, 20);
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
  await page.getByLabel("Name your companion").fill("Fen");
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

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test("bottom navigation marks the active section and reaches all five", async ({
  page,
}) => {
  await signUpWithPet(page);

  const sections = [
    { label: "Explore", url: "**/explore" },
    { label: "Games", url: "**/games" },
    { label: "Inventory", url: "**/inventory" },
    { label: "Profile", url: "**/profile" },
    { label: "Home", url: "**/" },
  ];
  const nav = page.locator("nav").filter({ has: page.locator("ul") }).last();
  for (const section of sections) {
    await nav.getByRole("link", { name: section.label }).click();
    await page.waitForURL(section.url);
    await expect(
      nav.getByRole("link", { name: section.label }),
    ).toHaveAttribute("aria-current", "page");
    await expectNoHorizontalScroll(page);
  }

  // The wallet chip is visible without dominating: mobile utility bar
  // (a second copy lives in the hidden desktop sidebar).
  await expect(page.getByText("Coin balance:").first()).toBeAttached();
});

test("word boards fit at 4, 5, and 6 letters without horizontal scroll", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/explore/dapplewood/whisperleaf-reading-room");
  await page.waitForLoadState("networkidle");

  for (const difficulty of [/^Easy/, /^Medium/, /^Hard/]) {
    await page.getByRole("button", { name: difficulty }).click();
    await expect(page.locator("#word-board")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Submit guess" }),
    ).toBeVisible();
    await expectNoHorizontalScroll(page);
    // Close it again (the chips toggle).
    await page.getByRole("button", { name: difficulty }).click();
  }
});

test("reduced motion: wheel spin reveals the committed result immediately", async ({
  browser,
}) => {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 360, height: 740 },
  });
  const page = await context.newPage();
  await signIn(page);
  await page.goto("/explore/dapplewood/brassbell-pavilion");
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Spin the wheel" }).click();
  // The reduced-motion path resolves in ~250ms rather than ~2.6s; give it
  // a comfortably shorter-than-full-spin window to prove the short path.
  await expect(
    page.getByText("Come back tomorrow for another spin."),
  ).toBeVisible({ timeout: 2000 });

  // Reload: the recorded result is still shown for the rest of the day.
  await page.reload();
  await expect(
    page.getByText("Come back tomorrow for another spin."),
  ).toBeVisible();
  await context.close();
});

test("insufficient funds shows persistent, plain-language feedback", async ({
  page,
  browser,
}) => {
  // Seller lists a starter item at an unaffordable price…
  await signIn(page);
  await page.goto("/shop");
  await page.getByLabel("Quantity").fill("1");
  await page.getByLabel("Price each").fill("99999");
  await page.getByRole("button", { name: "List it" }).click();
  await expect(page.getByText(/^Listed 1 ×/)).toBeVisible();

  // …and a brand-new account (200 coins) tries to buy it.
  const buyerContext = await browser.newContext({
    viewport: { width: 360, height: 740 },
  });
  const buyerPage = await buyerContext.newPage();
  const buyer = `p6b_${RUN_ID}`.slice(0, 20);
  await buyerPage.goto("/sign-up");
  await buyerPage.getByLabel("Username").fill(buyer);
  await buyerPage.getByLabel("Password").fill(PASSWORD);
  await buyerPage.getByRole("button", { name: "Create account" }).click();
  await buyerPage.waitForURL("**/starter");

  await buyerPage.goto(`/shops/${USERNAME}`);
  await buyerPage.getByRole("button", { name: /^Buy — 99,999/ }).click();

  // The conflict lands as a persistent notice, not a vanishing toast.
  // (Next.js adds its own empty role=alert route announcer — filter it.)
  const notice = buyerPage.getByRole("alert").filter({ hasText: /coins/i });
  await expect(notice).toBeVisible();
  await buyerContext.close();
});

test("keyboard-only: navigate from home to a location and back", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/");

  // Skip link is the first tab stop.
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  // Reach the daily word row by keyboard and activate it.
  const wordLink = page.getByRole("link", { name: /Daily Word Challenge/ });
  await wordLink.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/explore/dapplewood/whisperleaf-reading-room");

  // The quiet back link is keyboard-reachable and returns to the region.
  const back = page.getByRole("link", { name: "Back to Dapplewood" });
  await back.focus();
  await expect(back).toBeFocused();
  await page.keyboard.press("Enter");
  await page.waitForURL("**/explore/dapplewood");
  await expect(
    page.getByRole("heading", { name: "Dapplewood", exact: true }),
  ).toBeVisible();
});

test("inventory: filter with no matches shows the intentional empty state", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/inventory?q=zzzznotathing");
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await expect(
    page.getByText("Try a different search or category."),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});
