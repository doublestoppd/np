import { expect, test, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import {
  caveDelveSeed,
  caveSectionDoors,
  clearRateLimitWindows,
  coinBalance,
} from "./helpers/db-maintenance";

/**
 * The Sunken Stair (ADR-59), on a 360px viewport.
 *
 * A blind walk would reach the second room about a quarter of the time
 * and prove nothing repeatable, so this reads the seed out of the
 * database and walks deliberately — which is also the only honest way to
 * assert that a CLEAN descent pays and a WRONG door ends it.
 *
 * The seed is read here and nowhere else. That it is available to a test
 * with database access and to nothing else is the whole security claim.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `stair_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

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
  await page.getByLabel("Name your companion").fill("Delve");
  await page.getByRole("button", { name: "Begin the adventure" }).click();
  await page.waitForURL("**/");
}

/** Mirrors modules/cave/layout.ts. If that changes, this must too. */
function correctDoor(seed: string, depth: number): 0 | 1 {
  const digest = createHash("sha256").update(`${seed}:${depth}`).digest();
  return ((digest[0] as number) & 1) as 0 | 1;
}

test("the stair walks, pays at every second room, and hands over the hoard", async ({
  page,
}) => {
  await signUpWithPet(page, USERNAME);
  await page.goto("/explore/tarnreach/the-sunken-stair");

  await expect(
    page.getByRole("heading", { name: "The Sunken Stair" }).first(),
  ).toBeVisible();

  // Looking at the cave must not spend the day's one go.
  await page.reload();
  await expect(page.getByRole("button", { name: "Go down" })).toBeVisible();

  const before = await coinBalance(USERNAME);
  await page.getByRole("button", { name: "Go down" }).click();
  await expect(page.getByText("1.")).toBeVisible();

  const seed = await caveDelveSeed(USERNAME);
  expect(seed).not.toBe("");
  // The one thing that would break this activity outright.
  expect(await page.content()).not.toContain(seed);

  const doors = await caveSectionDoors();
  for (let depth = 1; depth <= 10; depth += 1) {
    const pair = doors[depth - 1] as [string, string];
    const label = pair[correctDoor(seed, depth)] as string;
    await page.getByRole("button", { name: label, exact: true }).click();
    // The room's outcome is held before the next is offered, so waiting
    // on the step appearing is waiting on the server AND the reveal.
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible({
      timeout: 15_000,
    });
  }

  await expect(page.getByText("All the way down.")).toBeVisible({
    timeout: 15_000,
  });
  // 40 + 120 + 400 + 1200 + 6000 (modules/cave/config.ts).
  expect(await coinBalance(USERNAME)).toBe(before + 7_760n);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("a second descent is refused the same day", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");

  await page.goto("/explore/tarnreach/the-sunken-stair");
  await expect(page.getByRole("button", { name: "Go down" })).toHaveCount(0);
  await expect(page.getByText("Reached the bottom")).toBeVisible();

  // And the directory agrees rather than offering it again.
  await page.goto("/activities");
  await expect(
    page.getByRole("link", { name: /The Sunken Stair/ }),
  ).toContainText("Been down today");
});
