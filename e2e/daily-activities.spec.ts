import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 4 daily-activity flows on a 360px viewport: the home status
 * panel, the word challenge (on-screen keyboard entry + evaluation), the
 * prize wheel (one committed spin, recorded on reload), the community
 * meal (claim once, recorded on reload), and the daily history page.
 *
 * The word answer is server-secret, so the word test submits a valid
 * dictionary guess and asserts evaluation/attempt behavior — solving is
 * covered by the integration suites.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `da_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

async function signUpWithPet(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Thornbud", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Nib");
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

test("home page shows the Today's Activities panel with live statuses", async ({
  page,
}) => {
  await signUpWithPet(page);
  await expect(
    page.getByRole("heading", { name: "Today's activities" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Daily Word Challenge/ }),
  ).toBeVisible();
  // Names come from content now, not from a literal in the page: the
  // wheel is called what the seeded wheel is called.
  await expect(
    page.getByRole("link", { name: /The Brassbell Wheel/ }),
  ).toContainText("Available");
  // The request board reached no dashboard at all before the directory.
  await expect(
    page.getByRole("link", { name: /Community Requests/ }),
  ).toContainText("Available");
  await expect(
    page.getByRole("link", { name: /Daily Community Meal/ }),
  ).toContainText("Available");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("word challenge: on-screen keyboard guess gets an evaluation", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/");
  await page.getByRole("link", { name: /Daily Word Challenge/ }).click();
  await page.waitForURL("**/explore/dapplewood/whisperleaf-reading-room");
  await expect(
    page.getByRole("heading", { name: "Whisperleaf Reading Room" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  // Open the Easy board (4 letters) and type MOSS on the on-screen keys.
  await page.getByRole("button", { name: /^Easy/ }).click();
  for (const letter of ["M", "O", "S", "S"]) {
    await page
      .getByRole("button", { name: letter, exact: true })
      .first()
      .click();
  }
  await page.getByRole("button", { name: "Submit guess" }).click();

  // The server evaluated the guess: one row is now labeled with results.
  await expect(
    page.locator('[aria-label*="correct position"], [aria-label*="not in the word"], [aria-label*="different position"]').first(),
  ).toBeVisible();

  // MOSS is occasionally the day's actual answer; both outcomes are valid.
  const solved = await page
    .getByText(/Solved!/)
    .first()
    .isVisible()
    .catch(() => false);
  if (!solved) {
    // In-progress boards keep the answer hidden and count attempts.
    await expect(page.getByText(/guess(es)? left/i)).toBeVisible();
    await expect(page.getByText(/The word was/)).toBeHidden();
  }

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("prize wheel: one spin, result recorded and stable on reload", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/explore/dapplewood/brassbell-pavilion");
  await expect(
    page.getByRole("heading", { name: "Brassbell Pavilion" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Spin the wheel" }).click();
  // The committed result reveals after the (short, test-friendly) spin.
  await expect(
    page.getByText("Come back tomorrow for another spin."),
  ).toBeVisible({ timeout: 15_000 });

  // Reload: the recorded outcome is shown; no second spin is offered.
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByText("Come back tomorrow for another spin."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Spin the wheel" }),
  ).toBeHidden();
});

test("community meal: claim once, recorded on revisit", async ({ page }) => {
  await signIn(page);
  await page.goto("/explore/dapplewood/hearth-and-ladle");
  await expect(
    page.getByRole("heading", { name: "Hearth and Ladle" }),
  ).toBeVisible();
  await page.waitForLoadState("networkidle");

  await page.getByRole("button", { name: "Claim today's meal" }).click();
  await expect(page.getByText(/Enjoy! You received/)).toBeVisible();
  await expect(page.getByText(/see it in your satchel/)).toBeVisible();

  // Revisit: the claim is recorded, the button is gone.
  await page.goto("/explore/dapplewood/hearth-and-ladle");
  await expect(page.getByText(/see it in your satchel/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Claim today's meal" }),
  ).toBeHidden();
});

test("home statuses update and daily history lists the day's records", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/");
  await expect(page.getByText("Spun today")).toBeVisible();
  await expect(page.getByText("Claimed today")).toBeVisible();

  await page.goto("/history/daily");
  await expect(
    page.getByRole("heading", { name: "Daily activities" }),
  ).toBeVisible();
  await expect(page.getByText("Meal claimed").first()).toBeVisible();
  // The wheel spin appears with its prize label row.
  await expect(page.getByText("Prize wheel").first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("playing with a toy lifts a companion's spirits without spending it", async ({
  page,
}) => {
  // The loop that did not exist: happiness decayed with no way to raise
  // it, and the starter toy had no affordance anywhere.
  await signIn(page);
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: /^Play with / }),
  ).toBeVisible();
  const play = page.getByRole("button", { name: /^Play with Bounce Burr$/ });
  await expect(play).toBeVisible();
  await play.click();

  await expect(page.getByText(/played with the Bounce Burr/)).toBeVisible();

  // The toy is still in the satchel: a plaything is a possession, not a
  // second kind of food.
  await page.goto("/inventory");
  await expect(page.getByText("Bounce Burr").first()).toBeVisible();

  // And it is resting rather than gone, so the variety rule is visible.
  await page.goto("/");
  await expect(page.getByText(/resting for now/)).toBeVisible();
});

test("the lantern hunt: read the note, look somewhere, learn something", async ({
  page,
}) => {
  // The hunt is deduction, so the browser test cannot know the answer —
  // it asserts the machinery a player actually touches: the riddle is
  // posted, every location is searchable, a look is spent and remembered,
  // and a miss still teaches which half of the world to try next.
  await signIn(page);

  // The note is at the beacon, and the beacon has no button on it: the
  // looking happens out in the world.
  await page.goto("/explore/saltmere/the-quiet-beacon");
  await expect(
    page.getByRole("heading", { name: "The Wandering Lantern" }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Pinned to the door/)).toBeVisible();

  // A location in the other region is searchable, like every location is.
  await page.goto("/explore/dapplewood/the-listening-stump");
  const look = page.getByRole("button", { name: "Look for the lantern here" });
  await expect(look).toBeVisible();
  await look.click();

  // Whatever happened, the game said something specific about it.
  await expect(
    page.getByText(/(There it is|Not at |Not here)/).first(),
  ).toBeVisible();

  // The look was spent and is remembered: the same place refuses a second
  // look rather than quietly charging for it.
  await page.reload();
  await expect(page.getByText(/already looked here today/)).toBeVisible();

  // ...and the beacon now lists where we have been.
  await page.goto("/explore/saltmere/the-quiet-beacon");
  await expect(
    page.getByRole("heading", { name: "Where you've looked today" }),
  ).toBeVisible();
  await expect(page.getByText("The Listening Stump").first()).toBeVisible();

  // It is on the day's activity list like everything else you can do.
  await page.goto("/games");
  await expect(
    page.getByRole("link", { name: /The Wandering Lantern/ }),
  ).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
