import { expect, test, type Page } from "@playwright/test";

/**
 * The Shrine (ADR-69), on a 360px viewport.
 *
 * What is checked here is the part that cannot be checked anywhere else:
 * that an unpublished page is invisible to strangers, that what a player
 * types is rendered as TEXT rather than markup, and that a visitor can
 * sign a guestbook the owner can then clear.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const KEEPER = `shr_${RUN_ID}`.slice(0, 20);
const VISITOR = `shv_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";

test.describe.configure({ mode: "serial" });

async function signUpWithPet(page: Page, username: string) {
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
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}

test("a new shrine is private, and says so", async ({ page }) => {
  await signUpWithPet(page, KEEPER);
  await page.goto("/profile/shrine");

  await expect(
    page.getByRole("heading", { name: "Your shrine" }),
  ).toBeVisible();
  // The preview is the real renderer, so it is on the page before anything
  // has been saved.
  // Scoped to the preview: "Under construction" is also a sticker button.
  await expect(
    page.locator(".shrine").getByText("This page is under construction"),
  ).toBeVisible();

  // Nobody else can see it, and it reads as absent rather than as hidden.
  await page.context().clearCookies();
  const response = await page.goto(`/u/${KEEPER}/shrine`);
  expect(response?.status()).toBe(404);
});

test("the keeper decorates it and opens it to visitors", async ({ page }) => {
  await signIn(page, KEEPER);
  await page.goto("/profile/shrine");

  await page.getByRole("button", { name: /^Terminal/ }).click();
  await page
    .getByLabel("Scrolling banner")
    .fill("~*~ welcome to my corner ~*~");
  await page.getByLabel("Make it blink").check();
  // Markup, on purpose: it must come back out as characters.
  await page
    .getByLabel("About this page")
    .fill("I keep <b>fish</b> and <script>alert(1)</script> opinions.");
  await page.getByRole("button", { name: /Under construction/ }).click();
  await page.getByRole("button", { name: /Cat approved/ }).click();
  await page.getByLabel("Falling things").selectOption("SNOW");
  await page.getByLabel("Theme tune").selectOption("MARKET_JIG");
  await page.getByLabel(/Open to visitors/).check();
  await page.getByLabel(/Join the Glimmerring/).check();
  await page.getByRole("button", { name: "Save my shrine" }).click();

  await expect(page.getByText("Saved.")).toBeVisible();

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a stranger sees the page, as text, with a counter", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`/u/${KEEPER}/shrine`);

  await expect(
    page.getByRole("heading", { name: `${KEEPER}'s shrine` }),
  ).toBeVisible();
  await expect(page.getByText("~*~ welcome to my corner ~*~")).toBeVisible();

  // The angle brackets are on the page as characters. If they had been
  // interpreted there would be a <b> element and no literal text.
  await expect(
    page.getByText("I keep <b>fish</b> and <script>alert(1)</script>"),
  ).toBeVisible();
  expect(await page.locator(".shrine b").count()).toBe(0);
  expect(await page.locator(".shrine script").count()).toBe(0);

  await expect(page.locator(".shrine-sticker").first()).toContainText(
    "Under construction",
  );
  await expect(page.getByText("You are visitor number")).toBeVisible();
  await expect(page.locator(".shrine-digit")).toHaveCount(6);
  // Still zero: a signed-out viewer the server cannot tell apart from the
  // next one is deliberately not counted, rather than counted as "someone".
  await expect(page.locator(".shrine-odometer")).toHaveText("000000");
});

test("a visitor is counted once, however many times they look", async ({
  page,
}) => {
  await signUpWithPet(page, VISITOR);
  await page.goto(`/u/${KEEPER}/shrine`);
  await expect(page.locator(".shrine-odometer")).toHaveText("000001");

  // The refresh that ruined every counter of this kind.
  await page.reload();
  await expect(page.locator(".shrine-odometer")).toHaveText("000001");
  await page.reload();
  await expect(page.locator(".shrine-odometer")).toHaveText("000001");

  // And the keeper looking at their own page is not a visitor to it.
  await signIn(page, KEEPER);
  await page.goto(`/u/${KEEPER}/shrine`);
  await expect(page.locator(".shrine-odometer")).toHaveText("000001");
});

test("a visitor signs the guestbook and the keeper can clear it", async ({
  page,
}) => {
  await signIn(page, VISITOR);
  await page.goto(`/u/${KEEPER}/shrine`);

  await page.getByLabel(`Leave a note for ${KEEPER}`).fill("great page!!!");
  await page.getByRole("button", { name: "Sign the guestbook" }).click();
  await expect(page.getByText("Signed. Thank you for visiting.")).toBeVisible();
  await page.reload();
  await expect(page.getByText("great page!!!")).toBeVisible();

  // The signer cannot take their own note back off somebody's page.
  await expect(page.getByRole("button", { name: "Remove this note" })).toHaveCount(
    0,
  );

  // The keeper can, without asking anybody.
  await signIn(page, KEEPER);
  await page.goto(`/u/${KEEPER}/shrine`);
  await expect(page.getByText("great page!!!")).toBeVisible();
  await page.getByRole("button", { name: "Remove this note" }).click();
  await expect(page.getByText("great page!!!")).toHaveCount(0);
});

test("the atmosphere and the tune are on the page, and neither starts itself", async ({
  page,
}) => {
  await page.context().clearCookies();
  await page.goto(`/u/${KEEPER}/shrine`);

  // The effects canvas is inside the shrine's own box, not pinned to the
  // window — the difference between snow on a page and a cursor trail
  // that follows you into the checkout.
  const canvas = page.locator(".shrine .shrine-effects");
  await expect(canvas).toHaveCount(1);
  const inside = await canvas.evaluate((element) => {
    const shrine = element.closest(".shrine") as HTMLElement;
    const box = element.getBoundingClientRect();
    const outer = shrine.getBoundingClientRect();
    return (
      getComputedStyle(element).position === "absolute" &&
      box.width <= outer.width + 1 &&
      box.height <= outer.height + 1
    );
  });
  expect(inside).toBe(true);
  // And it must not swallow the clicks of everything underneath it.
  expect(
    await canvas.evaluate((el) => getComputedStyle(el).pointerEvents),
  ).toBe("none");

  // The tune waits to be asked. Nothing plays on load, ever.
  await expect(page.getByRole("button", { name: /Play my theme/ })).toBeVisible();
  expect(await page.locator("audio").count()).toBe(0);
});

test("the webring strip walks to itself in a ring of one", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`/u/${KEEPER}/shrine`);

  const ring = page.getByRole("navigation", { name: "The Glimmerring" });
  await expect(ring).toBeVisible();
  await expect(ring.getByText(/is site \d+ of \d+/)).toBeVisible();

  // Next lands on a shrine — with one member that is this one, which is
  // what a ring of one means rather than a broken link.
  await ring.getByRole("link", { name: /Next/ }).click();
  await expect(page.locator(".shrine-heading")).toBeVisible();

  // And the ring's front door counts it without listing anybody.
  await page.goto("/ring");
  await expect(page.getByRole("heading", { name: "The Glimmerring" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Step into the ring/ })).toBeVisible();
});

test("the profile links to a published shrine", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto(`/u/${KEEPER}`);
  await page.getByRole("link", { name: "See their shrine" }).click();
  await expect(
    page.getByRole("heading", { name: `${KEEPER}'s shrine` }),
  ).toBeVisible();
});
