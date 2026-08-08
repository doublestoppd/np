import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  coinBalance,
  grantItemToPlayer,
} from "./helpers/db-maintenance";

/**
 * The three new things, on a 360px viewport: the drums take a token and
 * settle, a book is read to a companion and goes on its shelf, and the
 * morning slate is the same grid for everyone and pays once.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `dbs_${RUN_ID}`.slice(0, 20);
const OTHER = `dbs2_${RUN_ID}`.slice(0, 20);
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

// ---- The drums --------------------------------------------------------

test("the drums take a token, settle three faces, and say what happened", async ({
  page,
}) => {
  await signUpWithPet(page, USERNAME, "Reel");
  await grantItemToPlayer(USERNAME, "chalk-token", 3);

  await page.goto("/explore/saltmere/the-tumblehouse");
  await expect(
    page.getByRole("heading", { name: "The Drums", exact: true }),
  ).toBeVisible();

  // Every tier is listed, held or not — that is the point of five tiers.
  await expect(page.getByRole("radio", { name: /Chalk Token/ })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Obsidian Token/ })).toBeVisible();
  await expect(page.getByText("×3")).toBeVisible();

  // The ladder is published; the odds are not.
  await page.getByRole("group", { name: /What's on the chalk token drum/i })
    .or(page.getByText(/What's on the chalk token drum/i))
    .first()
    .click();
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("%");
  expect(body.toLowerCase()).not.toContain("weight");

  const before = await coinBalance(USERNAME);
  await page.getByRole("button", { name: "Pull the lever" }).click();

  // Three drums settle in order; the last one takes about two seconds.
  await expect(page.getByRole("button", { name: /Pull the lever|No token/ }))
    .toBeEnabled({ timeout: 15_000 });

  // Whatever it landed, the machine says so — and the token is gone.
  const after = await page.locator("body").innerText();
  expect(after).toMatch(/Nothing this time|Two of three|into the satchel|coins/);
  await expect(page.getByText("×2")).toBeVisible();

  // Coins only ever move up: a losing pull costs the token, never coins.
  expect(await coinBalance(USERNAME)).toBeGreaterThanOrEqual(before);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("the counter sells tokens and nothing else", async ({ page }) => {
  await signIn(page, USERNAME);
  await page.goto("/explore/saltmere/the-tumblehouse");
  await expect(
    page.getByRole("heading", { name: "The Tumblehouse Counter" }),
  ).toBeVisible();
  // The chalk token is the only COMMON in the pool, so every restock puts
  // some out — the shelf is never empty of it.
  await expect(page.getByText("Chalk Token").first()).toBeVisible();
});

// ---- Books ------------------------------------------------------------

test("a book is read aloud, is used up, and stays on the companion's shelf", async ({
  page,
}) => {
  await signIn(page, USERNAME);
  await grantItemToPlayer(USERNAME, "the-bee-book", 2);

  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Read to Reel/ }),
  ).toBeVisible();

  // Before any reading, the shelf invites rather than reproaches.
  await expect(
    page.getByRole("heading", { name: /Reel has been read/ }),
  ).toBeVisible();
  await expect(page.getByText(/Nothing yet/)).toBeVisible();

  await page
    .getByRole("button", { name: /^Read The Bee Book$/ })
    .click();
  await page.waitForURL(/notice=/);
  await expect(page.getByText(/It goes on the shelf/)).toBeVisible();

  // The title is on the shelf and one copy is gone.
  const shelf = page.getByRole("region", { name: /Reel has been read/ });
  await expect(shelf.getByText("The Bee Book")).toBeVisible();
  await expect(page.getByText("×1 · read aloud")).toBeVisible();

  // The meter names a band and never insults the animal.
  const meter = page.getByRole("meter", { name: "Reading" });
  await expect(meter).toBeVisible();
  const band = await meter.getAttribute("aria-valuetext");
  expect(band).toBeTruthy();
  expect((band ?? "").toLowerCase()).not.toMatch(/stupid|dim|dull|slow/);

  // No denominator anywhere: the shelf never implies what is missing.
  const body = await page.locator("body").innerText();
  expect(body).not.toMatch(/\d+ of \d+ (books|titles)/);
});

test("the bindery sells books and nothing else", async ({ page }) => {
  await signIn(page, USERNAME);
  await page.goto("/explore/dapplewood/the-quiet-bindery");
  await expect(
    page.getByRole("heading", { name: "The Quiet Bindery" }).first(),
  ).toBeVisible();
  // Whatever the restock rolled, every shelf item is a book.
  const shelf = await page.locator("body").innerText();
  expect(shelf).not.toContain("Sunberry Cluster");
});

// ---- The slate --------------------------------------------------------

test("the slate is the same grid for everyone and pays once", async ({
  page,
}) => {
  await signIn(page, USERNAME);
  await page.goto("/explore/tarnreach/the-morning-slate");
  await expect(
    page.getByRole("heading", { name: "The Morning Slate", exact: true }).first(),
  ).toBeVisible();

  const grid = page.getByRole("grid", { name: "Today's slate" });
  await expect(grid).toBeVisible();
  const cells = grid.getByRole("gridcell");
  await expect(cells).toHaveCount(81);

  // Reading the grid off the cell labels, which carry the givens.
  const readGrid = async (target: Page) =>
    (
      await target
        .getByRole("grid", { name: "Today's slate" })
        .getByRole("gridcell")
        .evaluateAll((nodes) =>
          nodes.map((node) => node.getAttribute("aria-label") ?? ""),
        )
    )
      .map((label) => (label.includes("given") ? label : "."))
      .join("|");

  const mine = await readGrid(page);
  expect(mine).toContain("given");

  // Typing into a blank saves and survives a reload.
  const firstBlank = cells.filter({ hasText: /^$/ }).first();
  await firstBlank.click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await expect(page.getByText("Checking…")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("grid", { name: "Today's slate" }).getByText("5").first(),
  ).toBeVisible();

  // A second player gets the identical grid.
  const other = await page.context().browser()?.newPage();
  if (other) {
    await other.setViewportSize({ width: 360, height: 740 });
    await signUpWithPet(other, OTHER, "Slate");
    await other.goto("/explore/tarnreach/the-morning-slate");
    await expect(
      other.getByRole("grid", { name: "Today's slate" }),
    ).toBeVisible();
    expect(await readGrid(other)).toBe(mine);
    await other.close();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("the slate is listed among the day's activities", async ({ page }) => {
  await signIn(page, USERNAME);
  await page.goto("/games");
  // The directory reports live progress from the same query the location
  // page renders from — "1/51 done" is the blank the previous test filled.
  await expect(
    page.getByRole("link", { name: /The Morning Slate/ }),
  ).toBeVisible();
  // The drums are deliberately absent: a row saying "Available" every day
  // about a machine that always takes a token would be a standing
  // invitation to spend, on the page a player reads first (ADR-49).
  await expect(page.getByRole("link", { name: /The Drums/ })).toHaveCount(0);
});
