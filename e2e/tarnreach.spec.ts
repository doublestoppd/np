import { expect, test, type Page } from "@playwright/test";

/**
 * Tarnreach on a 360px viewport: the region is reachable, the water gives
 * up a fish with a size, the hut pours a free drink independently of the
 * kitchen's meal, and the stonesetter's table can actually be played.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `tr_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

async function signUpWithPet(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Mistfin", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Tarn");
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

test("the region is on the map and its places are reachable", async ({ page }) => {
  await signUpWithPet(page);

  await page.goto("/explore");
  await page.getByRole("link", { name: "Tarnreach" }).click();
  await page.waitForURL("**/explore/tarnreach");
  await expect(
    page.getByRole("heading", { name: "Tarnreach", exact: true }),
  ).toBeVisible();
  // The map says what each place offers, from its attachments.
  await expect(page.getByText("Fishing").first()).toBeVisible();
  await expect(page.getByText("Free drink").first()).toBeVisible();
  await expect(page.getByText("Matching").first()).toBeVisible();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("fishing: a cast either lands something with a size, or does not", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/explore/tarnreach/the-lower-tarn");
  await expect(
    page.getByRole("heading", { name: "The Shallows" }).first(),
  ).toBeVisible();

  // Cast until something is landed; the empty weight makes blanks common,
  // and an empty cast is a legitimate outcome rather than a failure.
  let landed = false;
  for (let i = 0; i < 6 && !landed; i++) {
    const cast = page.getByRole("button", { name: "Cast a line" });
    if ((await cast.count()) === 0) break;
    await cast.click();
    await page.waitForURL(/notice=/, { timeout: 15_000 });
    landed = (await page.getByText(/\d+cm/).count()) > 0;
  }

  if (landed) {
    // The size is the activity: it has to be on screen.
    await expect(page.getByText(/\d+cm/).first()).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Landed here today" }),
    ).toBeVisible();
  }
  // Either way the day is bounded and the page says where it stands.
  await expect(page.getByText(/casts left|fishing done for today/)).toBeVisible();
});

test("the hut pours a free drink, independently of the kitchen", async ({
  page,
}) => {
  await signIn(page);
  // Claim the meal first, in the other region. The claim row is scoped per
  // pool, so lunch must not use up the hot drink.
  await page.goto("/explore/dapplewood/hearth-and-ladle");
  await page.getByRole("button", { name: "Claim today's meal" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });

  await page.goto("/explore/tarnreach/the-warming-hut");
  const take = page.getByRole("button", { name: "Take something hot" });
  await expect(take).toBeVisible();
  await take.click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText(/Something hot:/)).toBeVisible();

  // Recorded, and offered only once.
  await page.reload();
  await expect(page.getByText("Had one today").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Take something hot" }),
  ).toHaveCount(0);
});

test("the stonesetter's table deals a face-down board and pays a clear", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/explore/tarnreach/the-stonesetters-hut");
  await expect(
    page.getByRole("heading", { name: "The Stonesetter's Table" }).first(),
  ).toBeVisible();

  await page.getByRole("button", { name: /^Gentle/ }).click();
  // Twelve stones, all face down: none of them announces what it is.
  const stones = page.getByRole("button", { name: /^Stone \d+, face down$/ });
  await expect(stones).toHaveCount(12);

  // Turning one shows exactly one face, and the turn counter moves.
  await stones.first().click();
  await expect(
    page.getByRole("button", { name: /^Stone \d+, showing/ }),
  ).toHaveCount(1);
  // Scoped to the visible status line: the board also announces the same
  // count through a live region now, so a bare /0 of 6 pairs/ matches two
  // elements. That region is the point of the change — a screen-reader
  // user turned a stone and was told nothing about what was under it —
  // so it gets its own assertion rather than being worked around.
  await expect(page.getByText(/0 of 6 pairs · \d+ turns left/)).toBeVisible();
  await expect(page.locator("p[role=status]")).toContainText(/Stone \d+ shows/);

  // Play it the way a person does: remember every face the server shows,
  // and turn a known pair when you have one. A naive sweep runs out of
  // turns, which is itself worth knowing — the budget is generous but not
  // infinite, so this proves the board is finishable rather than that the
  // buttons exist.
  const memory = new Map<number, string>();
  const stoneAt = (card: number) =>
    page.getByRole("button", { name: new RegExp(`^Stone ${card + 1},`) });

  /**
   * Turn a stone and WAIT for the server to answer.
   *
   * Clicking returns as soon as the form is submitted, so reading the
   * board straight afterwards sees the previous one — and acting on it
   * turns the same stone twice, which the server correctly voids. The
   * turn counter moves on every flip, so it is the signal to wait on.
   */
  // Scoped to the VISIBLE status line by its separators. A bare
  // /of \d+ pairs/ also matched the sr-only live region, which is first in
  // the DOM — so this waited on a string that changes for reasons other
  // than a server response, and returned before the board had moved. The
  // script then read a stale board and acted on it, which the server
  // correctly voids.
  const progress = () =>
    page.getByText(/\d+ of \d+ pairs · \d+ turns left/).first();
  async function flip(card: number) {
    const before = (await progress().textContent()) ?? "";
    await stoneAt(card).click();
    await expect(progress()).not.toHaveText(before, { timeout: 15_000 });
  }

  /** Faces the server has shown, plus what is matched and what is up. */
  async function readBoard() {
    // Read every label in ONE evaluation. Walking them with nth() raced
    // the re-render: the board is replaced on each server response, so a
    // handle taken before it lands is detached by the time it is read.
    const labels = await page
      .getByRole("button", { name: /^Stone \d+,/ })
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("aria-label") ?? ""),
      );
    const total = labels.length;
    const matched = new Set<number>();
    let faceUp: number | null = null;
    for (const label of labels) {
      // Three states, not two. A missed pair is held face up for a moment
      // before the stones turn back, and it is labelled ", no match" —
      // reading that as a stone mid-turn made the script answer a turn
      // that was already over, spending flips on nothing.
      const parsed =
        /^Stone (\d+), (face down|showing (.+?))(, matched|, no match)?$/.exec(
          label,
        );
      if (!parsed) continue;
      const card = Number(parsed[1]) - 1;
      if (parsed[2] === "face down") continue;
      // Learn the face either way — being shown a miss is how a player
      // learns two stones at once, and it is the whole point of the hold.
      memory.set(card, parsed[3] as string);
      if (parsed[4] === ", matched") {
        matched.add(card);
      } else if (parsed[4] !== ", no match") {
        // Showing, unmatched, not held: the stone mid-turn. Turning it
        // again is illegal and voids the run — which is correct of the
        // server, and exactly the mistake a careless script makes.
        faceUp = card;
      }
    }
    return { total, matched, faceUp };
  }

  for (let turn = 0; turn < 40; turn++) {
    const { total, matched, faceUp } = await readBoard();
    if (matched.size === total) break;
    const open = Array.from({ length: total }, (_, card) => card).filter(
      (card) => !matched.has(card) && card !== faceUp,
    );
    if (open.length === 0) break;

    // If a stone is already up, answer it: its partner if we know it,
    // otherwise anything unseen (which teaches us one more face).
    if (faceUp !== null) {
      const face = memory.get(faceUp);
      const partner = open.find((card) => memory.get(card) === face);
      const unseen = open.find((card) => !memory.has(card));
      await flip((partner ?? unseen ?? open[0]) as number);
      continue;
    }

    // A pair we already know: turn both and bank it.
    const first = open.find((a) =>
      open.some(
        (b) => b !== a && memory.get(a) !== undefined && memory.get(a) === memory.get(b),
      ),
    );
    if (first !== undefined) {
      await flip(first);
      continue;
    }
    // Nothing known: learn one.
    const unseen = open.find((card) => !memory.has(card));
    await flip((unseen ?? open[0]) as number);
  }

  await expect(page.getByText(/All 6 pairs, in \d+ turns/)).toBeVisible({
    timeout: 20_000,
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});
