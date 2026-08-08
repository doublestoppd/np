import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  giveAilment,
  grantItemToPlayer,
  heldQuantity,
  petCare,
  setPetCoat,
  settleAilments,
} from "./helpers/db-maintenance";

/**
 * Pet care: coat, bond, ailments (ADR-60), on a 360px viewport.
 *
 * The three properties worth a browser test are the ones a unit test
 * cannot see, because they are about what a player is told and what
 * survives in their satchel:
 *
 *  - A brush is KEPT. The whole grooming economy rests on this, and a
 *    regression would look exactly like a working feature until somebody
 *    noticed their brush was gone.
 *  - The wrong bottle is REFUSED, not swallowed. The refusal has to reach
 *    the player as words, and the item has to still be there afterwards.
 *  - A healthy companion has NO panel at all. A permanent "healthy!" card
 *    would turn an ordinary companion into a checklist, which is the thing
 *    docs/design-philosophy.md rules out.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `care_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const PET = "Bramble";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
});

async function signUpWithPet(page: Page, username: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Mistfin", { exact: true }).click();
  await page.getByLabel("Name your companion").fill(PET);
  await page.getByRole("button", { name: "Begin the adventure" }).click();
  await page.waitForURL("**/");
}

/** Each test gets its own browser context, so the session does not carry. */
async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}

test("a well companion shows a coat and a bond, and nothing else", async ({
  page,
}) => {
  await signUpWithPet(page, USERNAME);
  // A brand-new companion has a real chance of being ill on the day this
  // runs, so the well case has to be arranged rather than assumed.
  await settleAilments(USERNAME);
  await page.reload();

  await expect(page.getByText("Coat", { exact: true })).toBeVisible();
  // The bond is words, never a number — a percentage would invite grinding
  // it, which is the opposite of what it records.
  await expect(page.getByText("Newly met", { exact: true })).toBeVisible();
  await expect(page.getByText(/\bBond\b.*\d/)).toHaveCount(0);

  await expect(page.getByRole("heading", { name: `${PET} has` })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: `Brush ${PET}` }),
  ).toBeVisible();
});

test("brushing lifts the coat, warms the bond, and keeps the brush", async ({
  page,
}) => {
  await grantItemToPlayer(USERNAME, "bristle-brush", 1);
  await setPetCoat(USERNAME, 40);
  await signIn(page);

  const before = await petCare(USERNAME);
  await page.getByRole("button", { name: `Brush with Bristle Brush` }).click();
  await expect(page.getByText(/leans into it|immaculate/)).toBeVisible();

  const after = await petCare(USERNAME);
  expect(after.coat).toBeGreaterThan(before.coat);
  expect(after.bond).toBeGreaterThan(before.bond);
  // The point of the whole grooming economy: the tool is not a consumable.
  expect(await heldQuantity(USERNAME, "bristle-brush")).toBe(1);
});

test("the same brush twice running offers nothing, and says why", async ({
  page,
}) => {
  await signIn(page);
  await expect(page.getByText("just been used — try another")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Brush with Bristle Brush" }),
  ).toHaveCount(0);
  expect(await heldQuantity(USERNAME, "bristle-brush")).toBe(1);
});

test("an ailment explains itself, refuses the wrong bottle, and passes", async ({
  page,
}) => {
  const ailmentName = await giveAilment(USERNAME, "stonecough");
  await grantItemToPlayer(USERNAME, "hedgerow-syrup", 1);
  await grantItemToPlayer(USERNAME, "cool-clay-salve", 1);
  await signIn(page);

  await expect(
    page.getByRole("heading", { name: `${PET} has ${ailmentName}` }),
  ).toBeVisible();
  // Reassurance is part of the feature, not decoration: the first thing a
  // player wants to know is whether they broke something.
  await expect(page.getByText(/passes on its own/)).toBeVisible();

  await page.getByRole("button", { name: "Give Cool Clay Salve" }).click();
  await expect(page.getByText(/Nothing was used/)).toBeVisible();
  expect(await heldQuantity(USERNAME, "cool-clay-salve")).toBe(1);
  await expect(
    page.getByRole("heading", { name: `${PET} has ${ailmentName}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Give Hedgerow Syrup" }).click();
  await expect(page.getByText(/settles it/)).toBeVisible();
  expect(await heldQuantity(USERNAME, "hedgerow-syrup")).toBe(0);
  await expect(
    page.getByRole("heading", { name: `${PET} has ${ailmentName}` }),
  ).toHaveCount(0);

  // A cured day does not become a second illness on a reload.
  await page.reload();
  await expect(
    page.getByRole("heading", { name: `${PET} has` }),
  ).toHaveCount(0);
});

test("the physic shed sells both halves of the kit at 360px", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/explore/dapplewood/beechrow-physic-garden");
  await expect(
    page.getByRole("heading", { name: "The Physic Shed" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/kept, not used up/).first()).toBeVisible();
  await expect(page.getByText(/Settles one ailment/).first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
