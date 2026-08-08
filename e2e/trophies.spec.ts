import { expect, test, type Page } from "@playwright/test";
import {
  clearRateLimitWindows,
  plantScoredArcadeRun,
} from "./helpers/db-maintenance";

/**
 * The trophy case (ADR-65), on a 360px viewport.
 *
 * Three things only a browser can settle: that trophies appear on a
 * profile without anybody claiming them, that any trophy — earned or not,
 * yours or a stranger's — opens and says what it takes, and that a visitor
 * is never shown what somebody has NOT done.
 *
 * The last one is the reason this file exists. It is a privacy property,
 * and privacy properties fail quietly.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const OWNER = `tro_${RUN_ID}`.slice(0, 20);
const VISITOR = `vis_${RUN_ID}`.slice(0, 20);
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
  await page.getByLabel("Name your companion").fill("Pip");
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

test("a new player's case is empty, and says what there is to go for", async ({
  page,
}) => {
  await signUpWithPet(page, OWNER);
  await page.goto("/profile");

  await expect(
    page.getByRole("heading", { name: "Trophies", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/None yet/)).toBeVisible();

  // Everything unearned is listed, because the case answers "what else is
  // there" as well as "what have I done".
  await expect(
    page.getByRole("heading", { name: "Still out there" }),
  ).toBeVisible();
  const locked = page.getByRole("button", { name: /not yet earned/ });
  expect(await locked.count()).toBeGreaterThan(20);

  // And a locked trophy will tell you what it wants, rather than being a
  // riddle. This one takes a single good run, which is why it is the one
  // earned further down.
  await page
    .getByRole("button", { name: /The Long Flight, not yet earned/ })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Get a paper bird past forty walls"),
  ).toBeVisible();
  await expect(dialog.getByText("Not yet.")).toBeVisible();
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("earning one puts it in the case, with the day it was earned", async ({
  page,
}) => {
  // Nobody claims a trophy. The run is planted because a browser cannot
  // fly forty walls, but everything after it — noticing, awarding,
  // displaying — is the real path, and it happens because the player
  // looked at their own profile.
  await plantScoredArcadeRun(OWNER, "PAPER_BIRD", 44);
  await signIn(page, OWNER);
  await page.goto("/profile");

  const earned = page.getByRole("button", {
    name: /The Long Flight, earned/,
  });
  await expect(earned).toBeVisible();
  await earned.click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "The Long Flight" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Get a paper bird past forty walls"),
  ).toBeVisible();
  // A real date, not "Not yet."
  await expect(dialog.getByText("Not yet.")).toBeHidden();
  await expect(dialog.getByText(/\d{4}/)).toBeVisible();
});

test("a visitor sees what was earned and never what was not", async ({
  page,
}) => {
  await signUpWithPet(page, VISITOR);
  await page.goto(`/u/${OWNER}`);

  await expect(
    page.getByRole("heading", { name: "Trophies", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /The Long Flight, earned/ }),
  ).toBeVisible();

  // The whole point. Nothing on a stranger's profile says what they have
  // not done, and there is no "still out there" list to read it from.
  await expect(
    page.getByRole("heading", { name: "Still out there" }),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: /not yet earned/ }),
  ).toHaveCount(0);

  // Their trophy still opens, and still explains itself.
  await page.getByRole("button", { name: /The Long Flight, earned/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Get a paper bird past forty walls"),
  ).toBeVisible();
});

test("the case is reachable and dismissable from the keyboard", async ({
  page,
}) => {
  await signIn(page, OWNER);
  await page.goto("/profile");

  const earned = page.getByRole("button", { name: /The Long Flight, earned/ });
  await earned.focus();
  await page.keyboard.press("Enter");

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Escape closes a native dialog; the component has to keep its own state
  // in step with that, which is exactly what is easy to get wrong.
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // And it can be opened again afterwards — the state really did reset.
  await earned.click();
  await expect(dialog).toBeVisible();
});
