import { expect, test } from "@playwright/test";

/**
 * The critical player journey, end to end on a 360px viewport:
 * sign-up → starter selection → pet home → inventory → profile editing
 * (bio + showcase) → public profile.
 *
 * Creates a uniquely named account each run; only adds data.
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
// E2E_USER lets a debugging session reuse an existing account.
const USERNAME = (process.env.E2E_USER ?? `e2e_${RUN_ID}`).slice(0, 20);
const PASSWORD = "correct-horse-battery";
const PET_NAME = "Puddle";

test.describe.configure({ mode: "serial" });

test("sign-up and starter selection", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();

  // New accounts land on starter selection.
  await expect(
    page.getByRole("heading", { name: "Choose your companion" }),
  ).toBeVisible();
  // The radio input is visually hidden; players tap the species card.
  await page.getByText("Thornbud", { exact: true }).click();
  await expect(page.getByRole("radio", { name: /Thornbud/ })).toBeChecked();
  await page.getByLabel("Name your companion").fill(PET_NAME);
  await page.getByRole("button", { name: "Begin the adventure" }).click();

  // Pet home shows the new companion and its condition — in words.
  await expect(
    page.getByRole("heading", { name: PET_NAME, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("meter", { name: "Appetite" })).toBeVisible();
  await expect(page.getByRole("meter", { name: "Health" })).toBeVisible();
  // A starter pet begins comfortable, not measured.
  await expect(page.getByText("Well fed")).toBeVisible();
  const petPanel = page.getByRole("region", { name: PET_NAME, exact: true });
  await expect(petPanel).not.toContainText(/\d+\s*\/\s*100/);
  await expect(petPanel).not.toContainText(/\b(Hunger|Happiness|Energy)\b/);

  // No horizontal overflow at 360px.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  expect(overflow).toBe(false);
});

test("feeding reports a state, and a full companion refuses more food", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Food is described by how filling it is, never by a restore value.
  await expect(page.getByText("A light snack").first()).toBeVisible();

  // A starter pet begins at "Well fed"; one Sunberry Cluster tops it up.
  await page.getByRole("button", { name: /^Feed Sunberry Cluster/ }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText(/Yum! Sunberry Cluster eaten\. Stuffed\./)).toBeVisible();

  // A second one would overflow, so it is refused and nothing is spent.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /^Feed Sunberry Cluster/ }).click();
  await page.waitForURL(/error=/, { timeout: 15_000 });
  await expect(
    page.getByText(/full and doesn't want any more food/),
  ).toBeVisible();
  await expect(page.getByText(/Nothing was used/)).toBeVisible();
});

test("inventory shows the starter pack and supports filtering", async ({
  page,
}) => {
  await signIn(page);
  await page.goto("/inventory");
  await expect(
    page.getByRole("heading", { name: "Sunberry Cluster" }),
  ).toBeVisible();

  await page.getByLabel("Search").fill("honey");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("heading", { name: "Honey Oat Loaf" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sunberry Cluster" }),
  ).toBeHidden();
});

test("profile editing: bio and showcase", async ({ page }) => {
  await signIn(page);
  await page.goto("/profile/edit");
  // Let hydration and nav-link prefetches settle; clicking a server-action
  // submit while prefetches are in flight can wedge the router's pending
  // state in headless runs.
  await page.waitForLoadState("networkidle");

  await page.getByLabel("Title").fill("Keeper of Snacks");
  await page.getByLabel("Bio").fill("Mostly here for the berries.");
  await page.getByRole("button", { name: "Save details" }).click();
  await page.waitForURL(/notice=/, { timeout: 15_000 });
  await expect(page.getByText("Profile saved.")).toBeVisible();

  // Put the starter toy on display. The remove control only exists for
  // showcased entries, so its appearance proves the entry landed.
  await page.waitForLoadState("networkidle");
  // The accessible name now contains the visible label (WCAG 2.5.3), so
  // it reads "Add Bounce Burr to display" rather than replacing "Add".
  await page.getByRole("button", { name: /Add Bounce Burr to display/ }).click();
  await expect(
    page.getByRole("button", { name: "Remove Bounce Burr from display" }),
  ).toBeVisible();
});

test("public profile is visible without authentication", async ({
  browser,
}) => {
  // A fresh context has no session cookie.
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`/u/${USERNAME}`);

  await expect(page.getByRole("heading", { name: USERNAME })).toBeVisible();
  await expect(page.getByText("Keeper of Snacks")).toBeVisible();
  await expect(page.getByText("Mostly here for the berries.")).toBeVisible();
  await expect(page.getByText(PET_NAME)).toBeVisible();
  await expect(page.getByText("Bounce Burr")).toBeVisible();
  // Wealth is private (docs/profile-and-showcases.md). A visitor learns
  // nothing about this player's balance.
  await expect(page.getByText(/coins/i)).toHaveCount(0);
  await context.close();
});

test("unknown public profiles show the not-found state", async ({ page }) => {
  await page.goto("/u/definitely_not_a_user_9q");
  await expect(page.getByText("Nothing here")).toBeVisible();
});

async function signIn(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}
