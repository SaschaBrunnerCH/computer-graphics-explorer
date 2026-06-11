import { test, expect, type Page } from "@playwright/test";

/**
 * Smoke tests: home, search, and one term page per renderer type
 * (ArcGIS scene, react-three-fiber, raw WebGL2). WebGL output is not
 * pixel-tested — "canvas exists and no page errors" is the bar.
 */

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

test("home page renders the glossary shell", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("");
  await expect(page.getByRole("heading", { level: 1, name: /playful demo/i })).toBeVisible();
  // Sidebar lists all seven categories.
  await expect(page.locator("calcite-accordion-item")).toHaveCount(7);
  expect(errors).toEqual([]);
});

test("search palette opens with Ctrl+K and finds terms", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("");
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByLabel("Search terms", { exact: true });
  await expect(input).toBeVisible();
  await input.fill("fresnel");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/term\/fresnel-effect/);
  await expect(page.getByRole("heading", { level: 1, name: /fresnel/i })).toBeVisible();
  expect(errors).toEqual([]);
});

test("react-three-fiber playground renders (shading models)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/shading-models");
  await expect(page.getByRole("heading", { level: 1, name: /shading/i })).toBeVisible();
  await expect(page.locator("figure canvas")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("raw WebGL2 playground renders (depth buffer)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/depth-buffer");
  await expect(page.getByRole("heading", { level: 1, name: /depth buffer/i })).toBeVisible();
  await expect(page.locator("figure canvas")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("ArcGIS scene playground renders (shadow mapping)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/shadow-mapping");
  await expect(page.getByRole("heading", { level: 1, name: /shadow/i })).toBeVisible();
  // ArcGIS scenes take a while under software rendering in CI.
  await expect(page.locator("figure arcgis-scene canvas").first()).toBeVisible({
    timeout: 60_000,
  });
  expect(errors).toEqual([]);
});

test("progress toggle persists in localStorage", async ({ page }) => {
  await page.goto("#/term/rendering");
  const toggle = page.locator("calcite-switch");
  await toggle.click();
  await page.reload();
  await expect(page.locator("calcite-switch")).toHaveAttribute("checked", "");
});
