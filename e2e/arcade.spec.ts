import { expect, test, type Page } from "@playwright/test";
import {
  arcadeRuns,
  clearRateLimitWindows,
  spendArcadeClaims,
} from "./helpers/db-maintenance";

/**
 * The two canvas games (ADR-62), on a 360px viewport.
 *
 * A browser test cannot play these well — driving a twitch game through
 * Playwright at real-time speed produces a bad run, not a good one — and
 * that is fine, because how well it plays is not what needs proving here.
 * What needs proving is the loop: the stage appears, real input reaches the
 * simulation, the run ends, a trace goes to the server, and the SERVER's
 * verdict comes back and is what the player is shown.
 *
 * Whether a good run pays the right coins is settled deterministically in
 * modules/games/arcade/arcade.test.ts, where a run can be flown properly.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `arc_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const PET = "Pip";

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
  await page.getByLabel("Name your companion").fill(PET);
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

test("the paper bird: a run opens, plays, ends, and the server scores it", async ({
  page,
}) => {
  await signUpWithPet(page);
  await page.goto("/explore/tarnreach/windward-steps");

  // The location and the game are named differently, so the page does not
  // open with the same heading twice (ADR-59's amendment).
  await expect(
    page.getByRole("heading", { name: "Windward Steps" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Paper Bird" }).first(),
  ).toBeVisible();
  await expect(page.getByText("3 of 3")).toBeVisible();

  // Looking at it must not open a run — the wall-clock check is measured
  // from the moment one opens.
  expect(await arcadeRuns(USERNAME, "PAPER_BIRD")).toHaveLength(0);

  await page.getByRole("button", { name: "Have a go" }).click();
  const stage = page.getByRole("button", { name: /^Fly\./ });
  await expect(stage).toBeVisible();

  // Real input, badly timed on purpose. A short flight is a real flight.
  await stage.focus();
  for (let beat = 0; beat < 6; beat += 1) {
    await page.keyboard.press("Space");
    await page.waitForTimeout(250);
  }

  // The run ends on its own, and the result that appears is the server's.
  await expect(page.getByRole("button", { name: "Again" })).toBeVisible({
    timeout: 30_000,
  });

  const runs = await arcadeRuns(USERNAME, "PAPER_BIRD");
  expect(runs).toHaveLength(1);
  expect(runs[0]?.status).toBe("FINISHED");
  // The server derived these by replaying the trace it was sent.
  expect(runs[0]?.ticks).toBeGreaterThan(0);
  expect(runs[0]?.score).toBeGreaterThanOrEqual(0);

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the long way up: steering reaches the simulation", async ({ page }) => {
  await signIn(page);
  await page.goto("/explore/dapplewood/the-hundred-steps");

  await expect(
    page.getByRole("heading", { name: "The Hundred Steps" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Long Way Up" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Have a go" }).click();
  const stage = page.getByRole("button", { name: /^Climb\./ });
  await expect(stage).toBeVisible();

  // The keyboard path, which is the one a canvas most easily loses.
  await stage.focus();
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(900);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(900);
  await page.keyboard.up("ArrowLeft");

  await expect(page.getByRole("button", { name: "Again" })).toBeVisible({
    timeout: 30_000,
  });

  const runs = await arcadeRuns(USERNAME, "TREE_CLIMB");
  expect(runs).toHaveLength(1);
  expect(runs[0]?.status).toBe("FINISHED");
  // Steering started the climb, so it ran for real ticks rather than
  // sitting in its waiting state until the tick budget ran out.
  expect(runs[0]?.ticks).toBeGreaterThan(0);
  expect(runs[0]?.ticks).toBeLessThan(60_000);
});

test("a second run takes input straight away, on the keyboard too", async ({
  page,
}) => {
  // Two bugs met here, and both were invisible on a first run.
  //
  // The stage stays mounted between runs, so "Again" leaves a gap where
  // the canvas is on screen and the loop is not running yet — every input
  // during it used to be dropped in silence. And the stage remembered
  // which way you were leaning across runs, so the first press of a
  // direction you were already holding was deduped away.
  //
  // Together they produced a second run that took twenty-four key presses
  // and simulated zero ticks. It is asserted on the keyboard because that
  // is the path a browser can drive precisely, and the one most likely to
  // rot.
  await signIn(page);
  await page.goto("/explore/dapplewood/the-hundred-steps");

  const before = (await arcadeRuns(USERNAME, "TREE_CLIMB")).length;

  const play = async (expected: number) => {
    const stage = page.getByRole("button", { name: /^Climb\./ });
    await stage.waitFor();
    await stage.focus();
    for (let i = 0; i < 10; i += 1) {
      const key = i % 2 ? "ArrowLeft" : "ArrowRight";
      await page.keyboard.down(key);
      await page.waitForTimeout(140);
      await page.keyboard.up(key);
      await page.waitForTimeout(200);
    }
    // Waiting on the DATABASE rather than on a button. A run can end
    // part-way through the driving above, so which control is on screen
    // at any moment is a race; whether the run was scored is not.
    await expect
      .poll(async () => (await arcadeRuns(USERNAME, "TREE_CLIMB")).length, {
        timeout: 40_000,
      })
      .toBe(expected);
  };

  await page.getByRole("button", { name: /Have a go|Again/ }).first().click();
  await play(before + 1);
  // The second run is the one that used to sit at zero ticks for ever.
  await page.getByRole("button", { name: "Again" }).click();
  await play(before + 2);

  const runs = await arcadeRuns(USERNAME, "TREE_CLIMB");
  for (const run of runs) {
    expect(run.status, "every run must finish and be scored").toBe("FINISHED");
    expect(run.ticks, "a run that took input cannot be zero ticks").toBeGreaterThan(0);
  }
});

test("three claims a day, and playing carries on unlimited", async ({ page }) => {
  await spendArcadeClaims(USERNAME, "PAPER_BIRD");
  await signIn(page);
  await page.goto("/explore/tarnreach/windward-steps");

  await expect(page.getByText("0 of 3")).toBeVisible();
  await expect(page.getByText(/three claims are spent/)).toBeVisible();
  // The rule is about PAYING, never about playing.
  await expect(page.getByRole("button", { name: "Have a go" })).toBeVisible();
});

test("both games are on the Activities tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/activities");
  await expect(page.getByText("The Paper Bird").first()).toBeVisible();
  await expect(page.getByText("The Long Way Up").first()).toBeVisible();
});
