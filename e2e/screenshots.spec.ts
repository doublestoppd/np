import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { clearRateLimitWindows } from "./helpers/db-maintenance";

/**
 * Visual-regression capture: representative surfaces at the four review
 * widths (narrow mobile, common mobile, tablet, desktop), written to
 * e2e/screenshots/ as build artifacts. Uses deterministic seeded content
 * and a throwaway account; nonessential animation is disabled via
 * reduced-motion emulation (the app honors prefers-reduced-motion).
 */

const RUN_ID = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
const USERNAME = `ss_${RUN_ID}`.slice(0, 20);
const PASSWORD = "correct-horse-battery";
const OUT_DIR = "e2e/screenshots";

const WIDTHS = [
  { name: "narrow", width: 320, height: 740 },
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

const SURFACES = [
  { name: "home", path: "/" },
  { name: "location", path: "/explore/dapplewood/mosslight-clearing" },
  { name: "word-game", path: "/explore/dapplewood/whisperleaf-reading-room" },
  { name: "wheel", path: "/explore/dapplewood/brassbell-pavilion" },
  { name: "shop-grid", path: "/explore/dapplewood/the-mossy-market" },
  { name: "market", path: "/market" },
  { name: "inventory", path: "/inventory" },
  { name: "profile", path: "/profile" },
  { name: "hollow", path: "/hollow" },
  { name: "furnishings", path: "/hollow/catalogue" },
] as const;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await clearRateLimitWindows();
});

async function signUpWithPet(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Username").fill(USERNAME);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText("Cindertail", { exact: true }).click();
  await page.getByLabel("Name your companion").fill("Ember");
  await page.getByRole("button", { name: "Begin the adventure" }).click();
  await page.waitForURL("**/");
}

test("capture representative surfaces at all review widths", async ({
  browser,
}) => {
  test.setTimeout(300_000);
  mkdirSync(OUT_DIR, { recursive: true });

  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await signUpWithPet(page);

  for (const surface of SURFACES) {
    for (const size of WIDTHS) {
      await page.setViewportSize({
        width: size.width,
        height: size.height,
      });
      await page.goto(surface.path);
      await page.waitForLoadState("networkidle");
      // Open the Easy board so the tile grid is part of the word capture.
      if (surface.name === "word-game") {
        const easy = page.getByRole("button", { name: /^Easy/ });
        if (await easy.isVisible().catch(() => false)) {
          await easy.click();
        }
      }
      // No layout may overflow horizontally at any captured width.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      );
      expect(overflow, `${surface.name} overflows at ${size.name}`).toBe(false);
      await page.screenshot({
        path: `${OUT_DIR}/${surface.name}-${size.name}-${size.width}.png`,
        fullPage: true,
      });
    }
  }
  await context.close();
});
