import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  clearTodaysScores,
  plantScoredArcadeRun,
} from "./helpers/db-maintenance";

/**
 * The daily scoreboards (ADR-67), on a 360px viewport.
 *
 * These publish one player's score to another, which is a thing the game
 * did not do before — so what is checked here is that the board appears
 * where it was asked for (at the foot of the game's own card), that the
 * names go somewhere, and that it stays a board of three rather than
 * growing into a ladder.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const ME = `brd_${RUN_ID}`.slice(0, 20);
const RIVAL = `riv_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const WHERE = "/explore/tarnreach/windward-steps";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
  // The boards are world-wide and the suite shares a database, so the
  // rest of it has already posted scores today. Start from a clean board.
  await clearTodaysScores("PAPER_BIRD");
  await clearTodaysScores("SNAKE");
});

async function signUpWithPet(page: Page, username: string) {
  // Same reason as `signIn`: a live session redirects away from /sign-up,
  // and these specs make several accounts inside one browser context in
  // order to have somebody to share a board with.
  await page.context().clearCookies();
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Mistfin", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Pip");
  await page.getByRole("button", { name: "Begin the adventure" }).click();
  await page.waitForURL("**/");
}

async function signIn(page: Page, username: string) {
  // Signing somebody up leaves that session live, and /sign-in redirects
  // away when one is. These specs deliberately create a rival and then
  // look at the board as somebody else, so the previous session has to go.
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}

test("an untouched board says so rather than showing nothing", async ({
  page,
}) => {
  await signUpWithPet(page, ME);
  await page.goto(WHERE);

  const board = page.getByRole("region", { name: "Today's best" });
  await expect(board).toBeVisible();
  await expect(
    board.getByText(/Nobody has posted a score today/),
  ).toBeVisible();
});

test("it lists the top three, names linked, best first", async ({ page }) => {
  await signUpWithPet(page, RIVAL);
  // Four scores from two players, so both the ordering and the
  // one-row-per-player rule are visible at once.
  await plantScoredArcadeRun(RIVAL, "PAPER_BIRD", 31);
  await plantScoredArcadeRun(RIVAL, "PAPER_BIRD", 12);
  await plantScoredArcadeRun(ME, "PAPER_BIRD", 20);

  await signIn(page, ME);
  await page.goto(WHERE);

  const board = page.getByRole("region", { name: "Today's best" });
  const rows = board.getByRole("listitem");
  await expect(rows).toHaveCount(2);

  // Best first, and the rival's two runs are one row at their better one.
  await expect(rows.nth(0)).toContainText(RIVAL);
  await expect(rows.nth(0)).toContainText("31 walls");
  await expect(rows.nth(1)).toContainText(ME);
  await expect(rows.nth(1)).toContainText("20 walls");

  // The player's own row is marked, so nobody has to scan for their name.
  await expect(rows.nth(1)).toContainText("that's you");

  // Every name goes somewhere. A board of names nobody can look up is a
  // wall of strangers.
  await expect(board.getByRole("link", { name: RIVAL })).toHaveAttribute(
    "href",
    `/u/${RIVAL}`,
  );

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("it stops at three, and shows no position for anybody else", async ({
  page,
}) => {
  // The limit that keeps this a board rather than a ladder. Two more
  // players above the viewer means the viewer drops off entirely — and is
  // told nothing about where they stand.
  const extras = [`x1_${RUN_ID}`.slice(0, 20), `x2_${RUN_ID}`.slice(0, 20)];
  for (const name of extras) {
    await signUpWithPet(page, name);
    await plantScoredArcadeRun(name, "PAPER_BIRD", 90);
  }

  await signIn(page, ME);
  await page.goto(WHERE);

  const board = page.getByRole("region", { name: "Today's best" });
  await expect(board.getByRole("listitem")).toHaveCount(3);
  // No fourth place, and no "you are 4th" anywhere on the page.
  await expect(board).not.toContainText("that's you");
  await expect(page.getByText(/4th|fourth place|your position/i)).toHaveCount(
    0,
  );
});

test("each game keeps its own board, at its own card", async ({ page }) => {
  await plantScoredArcadeRun(ME, "SNAKE", 17);
  await signIn(page, ME);

  // The bird's board does not know about the snake's score.
  await page.goto(WHERE);
  await expect(
    page.getByRole("region", { name: "Today's best" }),
  ).not.toContainText("17");

  await page.goto("/explore/saltmere/marram-bank");
  const snake = page.getByRole("region", { name: "Today's best" });
  await expect(snake).toContainText("17 apples");
  await expect(snake).toContainText(ME);
});
