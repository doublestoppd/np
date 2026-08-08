import { expect, test, type Page } from "@playwright/test";
import {
  arcadeRuns,
  clearRateLimitWindows,
  coinBalance,
  plantScoredArcadeRun,
  spendArcadeClaims,
} from "./helpers/db-maintenance";

/**
 * Whichever control starts a run right now.
 *
 * Two labels, because an untaken run changes the offer: with coins still
 * on the table the primary action is taking them and going again is the
 * secondary "Go again instead" (ADR-64).
 */
const START_A_RUN = /Have a go|Go again instead|^Again$/;

/**
 * The three canvas games (ADR-62), on a 360px viewport.
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
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
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

test("the long grass: swipe, tap and the arrow keys all steer it", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/explore/saltmere/marram-bank");

  await expect(
    page.getByRole("heading", { name: "Marram Bank" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The Long Grass" }).first(),
  ).toBeVisible();

  // Each of the three input paths gets its own run, and the assertion for
  // all three is the same: the run FINISHES quickly. That is the proof,
  // not a nicety — the snake does not move until something steers it, so
  // an input path that never reached the simulation leaves the run sitting
  // in its waiting state until the twenty-minute tick budget runs out.
  // A path that works kills the snake against the fence in about a second.
  const drive = async (
    expected: number,
    input: (box: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => Promise<void>,
  ) => {
    // Reloaded between runs rather than pressing "Again". The stage is
    // remounted when a new run id arrives, so the "Again" path has a beat
    // where the outgoing canvas is still on screen — aiming a pointer at
    // it lands the input on a loop that is about to be thrown away. A
    // fresh load mounts the stage exactly once, which makes this test
    // about the input paths rather than about that timing. The "Again"
    // path has its own test below, on the keyboard, where it belongs.
    await page.goto("/explore/saltmere/marram-bank");
    await page.getByRole("button", { name: START_A_RUN }).first().click();
    const stage = page.getByRole("button", { name: /^Turn\./ });
    await expect(stage).toBeVisible();
    const box = await stage.boundingBox();
    if (!box) throw new Error("the stage has no box to aim at");
    await input(box);
    // Waiting on the database, not on a button: whichever control is on
    // screen at a given moment is a race, but the scored run is not.
    //
    // Counting FINISHED runs specifically. Counting every row satisfies
    // this the instant the run is OPENED, which let the next reload land
    // mid-run — and a run still open when the next one starts is voided,
    // exactly as it should be. The count that means "the server has
    // replayed the trace and scored it" is this one.
    await expect
      .poll(
        async () =>
          (await arcadeRuns(USERNAME, "SNAKE")).filter(
            (run) => run.status === "FINISHED",
          ).length,
        { timeout: 30_000 },
      )
      .toBe(expected);
  };

  // A swipe: a drag longer than the tap threshold, read on the larger axis.
  await drive(1, async (box) => {
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.7, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.3, y, { steps: 5 });
    await page.mouse.up();
  });

  // A tap that goes nowhere, which falls back to the quarter it landed in.
  await drive(2, async (box) => {
    await page.mouse.move(box.x + box.width * 0.12, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
  });

  // And the keyboard, the path a canvas most easily loses.
  await drive(3, async () => {
    await page.getByRole("button", { name: /^Turn\./ }).focus();
    await page.keyboard.press("ArrowRight");
  });

  const runs = await arcadeRuns(USERNAME, "SNAKE");
  expect(runs).toHaveLength(3);
  for (const run of runs) {
    expect(run.status, "every run must finish and be scored").toBe("FINISHED");
    // Derived by the server replaying the trace it was sent. A run that
    // took input cannot be zero ticks, and cannot have run to the budget.
    expect(
      run.ticks,
      "an input that reached the simulation moved it",
    ).toBeGreaterThan(0);
    expect(run.ticks).toBeLessThan(60_000);
  }

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
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

  // FINISHED runs specifically, here and in `play` below. Counting every
  // row is satisfied the instant a run is OPENED, which let the "Again"
  // click land while the first run was still going — and a run still open
  // when the next one starts is voided, exactly as it should be. That made
  // this test's own final assertion fail intermittently, on a defect in
  // the test rather than in the game.
  const finished = async () =>
    (await arcadeRuns(USERNAME, "TREE_CLIMB")).filter(
      (run) => run.status === "FINISHED",
    ).length;
  const before = await finished();

  const play = async (expected: number) => {
    // The end-of-run controls are the tell that the previous run's stage
    // is still the one on screen. It is remounted when the new run id
    // arrives, and focusing the outgoing canvas sends every key press to
    // a loop that is about to be discarded — which looks exactly like the
    // dropped-input bug this test exists to catch, from a defect in the
    // test rather than in the game. On the first run there is nothing to
    // wait for and these pass straight through.
    await expect(page.getByRole("button", { name: /^Take/ })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Go again instead" }),
    ).toHaveCount(0);

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
    await expect.poll(finished, { timeout: 40_000 }).toBe(expected);
  };

  await page.getByRole("button", { name: START_A_RUN }).first().click();
  await play(before + 1);
  // The second run is the one that used to sit at zero ticks for ever.
  await page.getByRole("button", { name: "Again" }).click();
  await play(before + 2);

  const runs = await arcadeRuns(USERNAME, "TREE_CLIMB");
  expect(runs.every((run) => run.status === "FINISHED")).toBe(true);
  for (const run of runs) {
    expect(
      run.ticks,
      "a run that took input cannot be zero ticks",
    ).toBeGreaterThan(0);
  }
});

test("a run's coins are the player's to take, or to gamble on a better one", async ({
  page,
}) => {
  // The decision the three-a-day limit is actually about (ADR-64). A run
  // that ends is scored and recorded, and then the player chooses: bank
  // it, or go again and give it up hoping to beat it.
  //
  // The run is planted rather than played. A browser cannot reliably
  // reach a paying score in a twitch game in a few seconds, and making
  // the game easier for the test would prove something no player meets.
  // Everything after the run exists — the offer, the button, the payout,
  // the wallet — is the real path.
  await signIn(page);

  const opening = await coinBalance(USERNAME);
  await plantScoredArcadeRun(USERNAME, "SNAKE", 24);
  await page.goto("/explore/saltmere/marram-bank");

  // The offer survived a page load, so deciding is not a race against
  // closing the tab. Scoped to the notice: the score also appears in the
  // "Your best" line, and the assertion that matters is that the OFFER
  // names the run it is offering.
  const offer = page.getByRole("status").filter({ hasText: /haven't taken/ });
  await expect(offer).toBeVisible();
  await expect(offer.getByText("24 apples")).toBeVisible();

  const take = page.getByRole("button", { name: /^Take/ });
  await expect(take).toBeVisible();
  await take.click();

  const afterTaking = await coinBalance(USERNAME);
  expect(afterTaking).toBeGreaterThan(opening);
  // One of the three, spent by choice — and the offer is retired, so it
  // cannot be taken twice. Read off the claims stat rather than the page:
  // the success notice says "2 of 3" as well, and the stat is the one
  // that has to still be right on the next page load.
  const claimsLeft = page.getByRole("definition").filter({ hasText: "of 3" });
  await expect(claimsLeft).toHaveText("2 of 3");
  await expect(take).toBeHidden();

  // Now the other half of the choice: a second run, left on the table.
  await plantScoredArcadeRun(USERNAME, "SNAKE", 30);
  await page.goto("/explore/saltmere/marram-bank");
  await expect(offer.getByText("30 apples")).toBeVisible();

  const banked = await coinBalance(USERNAME);
  await page.getByRole("button", { name: "Go again instead" }).click();
  await expect(page.getByRole("button", { name: /^Turn\./ })).toBeVisible();

  // Going again gave it up: no coins, and no claim spent on it either.
  expect(await coinBalance(USERNAME)).toBe(banked);
  await page.goto("/explore/saltmere/marram-bank");
  await expect(offer).toBeHidden();
  await expect(claimsLeft).toHaveText("2 of 3");
});

test("three claims a day, and playing carries on unlimited", async ({
  page,
}) => {
  await spendArcadeClaims(USERNAME, "PAPER_BIRD");
  await signIn(page);
  await page.goto("/explore/tarnreach/windward-steps");

  await expect(page.getByText("0 of 3")).toBeVisible();
  await expect(page.getByText(/three claims are spent/)).toBeVisible();
  // The rule is about PAYING, never about playing.
  await expect(page.getByRole("button", { name: "Have a go" })).toBeVisible();
});

test("all three games are on the Activities tab", async ({ page }) => {
  await signIn(page);
  await page.goto("/activities");
  await expect(page.getByText("The Paper Bird").first()).toBeVisible();
  await expect(page.getByText("The Long Way Up").first()).toBeVisible();
  await expect(page.getByText("The Long Grass").first()).toBeVisible();
});
