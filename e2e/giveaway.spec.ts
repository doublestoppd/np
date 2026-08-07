import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  ageAccountForTrading,
  clearGiveawayShelf,
  clearRateLimitWindows,
  grantItemToPlayer,
} from "./helpers/db-maintenance";

/**
 * The Leaving Shelf at 360px: one player puts something down, another
 * picks it up, and neither of them is shown a timer.
 *
 * The countdown assertion is the point of this file. Everything else here
 * is ordinary movement that the integration suite covers properly; the
 * thing a browser test can check and a unit test cannot is that no surface
 * on the rendered shelf has quietly grown a clock.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const DONOR = `gv_d_${RUN_ID}`.slice(0, 20);
const TAKER = `gv_t_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const MARKET = "/explore/dapplewood/the-mossy-market";
/** Stackable, tradeable, and in every starter satchel. */
const SPARE = "Sunberry Cluster";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
  // One shared plank with a capacity: unlike every other fixture here it
  // cannot be made unique per run.
  await clearGiveawayShelf();
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

/** The shelf itself, not the paid shelves it stands beside. */
function shelfOn(page: Page): Locator {
  return page.getByRole("region", { name: "The Leaving Shelf" });
}

/**
 * Nothing on the shelf may read as a clock. A ticking number over free
 * goods is the scramble CLAUDE.md rules out, and it would be a scramble
 * over items anybody can also buy from the counter three feet away
 * (docs/architecture-decisions.md ADR-43).
 */
async function noCountdown(page: Page) {
  const text = (await shelfOn(page).innerText()).toLowerCase();
  for (const forbidden of [
    "expire",
    "remaining",
    "time left",
    "hurry",
    "last chance",
    "countdown",
  ]) {
    expect(text).not.toContain(forbidden);
  }
  // No m:ss or h:mm clock, and no "in 12 minutes".
  expect(text).not.toMatch(/\b\d{1,2}:\d{2}\b/);
  expect(text).not.toMatch(/\b\d+\s*(seconds?|minutes?|hours?)\b/);
}

async function noOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
}

test("a spare goes on the shelf, and somebody else takes it home", async ({
  page,
  browser,
}) => {
  await signUpWithPet(page, DONOR, "Moss");
  // The shelf is player-to-player transfer, so it carries the market's
  // 24-hour gate. A browser test cannot wait a day; the account is aged
  // rather than the rule relaxed.
  await ageAccountForTrading(DONOR);
  await grantItemToPlayer(DONOR, "sunberry-cluster", 6);

  await page.goto(MARKET);
  const shelf = shelfOn(page);
  await expect(
    shelf.getByRole("heading", { name: "The Leaving Shelf" }),
  ).toBeVisible();

  const spareValue = await shelf
    .getByLabel("What to leave")
    .locator("option", { hasText: SPARE })
    .getAttribute("value");
  await shelf.getByLabel("What to leave").selectOption(spareValue as string);
  await shelf.getByLabel("How many").selectOption("2");
  await shelf.getByRole("button", { name: "Leave it on the shelf" }).click();

  // Giving is final, and the confirmation says so before the tap that
  // does it — there is no cancel and nothing comes back at expiry.
  await expect(page.getByText(/stops being yours/i)).toBeVisible();
  await page.getByRole("button", { name: "Leave it", exact: true }).click();
  await page.waitForURL(/notice=/);
  await expect(page.getByText(/glad of it/i)).toBeVisible();

  // The donor sees their own lot, and cannot take it back.
  const own = shelfOn(page)
    .getByRole("listitem")
    .filter({ hasText: SPARE })
    .filter({ hasText: DONOR });
  await expect(own.getByText("Yours")).toBeVisible();
  await expect(own.getByRole("button", { name: /^Take one/ })).toBeHidden();

  await noCountdown(page);
  await noOverflow(page);

  // Somebody else walks past.
  const takerContext = await browser.newContext();
  const takerPage = await takerContext.newPage();
  await signUpWithPet(takerPage, TAKER, "Fern");
  await ageAccountForTrading(TAKER);
  await takerPage.goto(MARKET);

  const lot = shelfOn(takerPage)
    .getByRole("listitem")
    .filter({ hasText: SPARE })
    .filter({ hasText: DONOR });
  await expect(lot.getByText("2 left")).toBeVisible();
  await lot.getByRole("button", { name: /^Take one/ }).click();
  await takerPage.waitForURL(/notice=/);
  // The notice names both the thing and the person, which is the whole
  // social half of the feature. Anchored, because the lot's own meta line
  // says "left by <donor>" too.
  await expect(
    takerPage.getByText(new RegExp(`^${SPARE}, left by ${DONOR}\\.$`)),
  ).toBeVisible();

  // It is genuinely in their satchel, and it genuinely cost nothing.
  await takerPage.goto("/inventory");
  await expect(takerPage.getByText(SPARE).first()).toBeVisible();

  // And one per lot: the button is gone, not merely refused.
  await takerPage.goto(MARKET);
  await expect(
    shelfOn(takerPage)
      .getByRole("listitem")
      .filter({ hasText: SPARE })
      .filter({ hasText: DONOR })
      .getByText("You took one"),
  ).toBeVisible();

  await noCountdown(takerPage);
  await noOverflow(takerPage);
  await takerContext.close();
});

test("the shelf keeps no scoreboard and ranks nobody", async ({ page }) => {
  await signIn(page, DONOR);
  await page.goto(MARKET);

  const text = (await shelfOn(page).innerText()).toLowerCase();
  // No generosity leaderboard, no donor totals, no thanks counter. Giving
  // is not a metric here, because the moment it is one people farm it.
  for (const forbidden of ["donated", "generosity", "top giver", "thanks"]) {
    expect(text).not.toContain(forbidden);
  }
  // And no collection checklist, the same rule the rest of the game keeps.
  expect(text).not.toMatch(/\b\d+\s*(of|\/)\s*\d+\b/);
  expect(text).not.toContain("%");
});
