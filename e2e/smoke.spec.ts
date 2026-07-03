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
  // Wait for hydration (the shell's key listener) before pressing the shortcut.
  await expect(page.getByRole("heading", { level: 1, name: /playful demo/i })).toBeVisible();
  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByRole("textbox", { name: "Search terms" });
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
  // The term now pairs the r3f demo with the scene-material-lab companion, so
  // more than one canvas is expected — assert the first (the r3f sphere grid).
  await expect(page.locator("figure canvas").first()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("raw WebGL2 playground renders (depth buffer)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/depth-buffer");
  await expect(page.getByRole("heading", { level: 1, name: /depth buffer/i })).toBeVisible();
  await expect(page.locator("figure canvas")).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("double buffering simulator renders (display pipeline diagram)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/double-buffering");
  await expect(page.getByRole("heading", { level: 1, name: /double buffering/i })).toBeVisible();
  // The simulator pairs with the frame-time demo — two diagram canvases.
  await expect(page.locator("figure canvas")).toHaveCount(2, { timeout: 30_000 });
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

test("multi-playground term shows both demos (fresnel + ArcGIS water)", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/fresnel-effect");
  await expect(page.locator("figure")).toHaveCount(2, { timeout: 60_000 });
  await expect(page.locator("figure canvas").first()).toBeVisible({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("guided tour navigates between steps", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/tour/1");
  await expect(page.getByText(/step 1 of/i)).toBeVisible();
  await page.getByRole("link", { name: /next stop/i }).click();
  await expect(page).toHaveURL(/#\/tour\/2/);
  await expect(page.getByText(/step 2 of/i)).toBeVisible();
  expect(errors).toEqual([]);
});

test("progress toggle persists in localStorage", async ({ page }) => {
  await page.goto("#/term/rendering");
  const toggle = page.locator("calcite-switch");
  await toggle.click();
  await page.reload();
  await expect(page.locator("calcite-switch")).toHaveAttribute("checked", "");
});
