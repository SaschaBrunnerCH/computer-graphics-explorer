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

test("terms expose curated, direct further-reading links", async ({ page }) => {
  const errors = collectPageErrors(page);
  await page.goto("#/term/path-tracing");
  await expect(page.getByRole("heading", { level: 1, name: /path tracing/i })).toBeVisible();

  const furtherReading = page.locator('section[aria-label="Further reading"]');
  await expect(furtherReading).toBeVisible();
  await expect(furtherReading.getByRole("link")).toHaveCount(4);
  await expect(
    furtherReading.getByRole("link", { name: /PBRT: §13\.2 Path Tracing/i }),
  ).toHaveAttribute(
    "href",
    "https://www.pbr-book.org/4ed/Light_Transport_I_Surface_Reflection/Path_Tracing",
  );
  expect(errors).toEqual([]);
});

test("terms without an honest source match omit further reading", async ({ page }) => {
  const errors = collectPageErrors(page);
  for (const term of [
    { id: "i3s-3d-tiles", heading: /i3s/i },
    { id: "tone-mapping", heading: /tone mapping/i },
    { id: "hdr", heading: /high dynamic range/i },
  ]) {
    await page.goto(`#/term/${term.id}`);
    await expect(page.getByRole("heading", { level: 1, name: term.heading })).toBeVisible();
    await expect(page.locator('section[aria-label="Further reading"]')).toHaveCount(0);
  }
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
  const demo = page.locator("figure").filter({ hasText: "The depth buffer, live and breakable" });
  const canvas = demo.locator("canvas");
  await expect(canvas).toBeVisible({ timeout: 30_000 });
  // A co-planar pair is a depth tie. The lesson must not present a hard-coded
  // near-plane/offset threshold as a universal z-fighting fix.
  const caption = demo.locator("figcaption");
  await expect(caption).toContainText(/exactly co-planar/i);
  await expect(caption).not.toContainText("Fix it:");
  await expect(caption).not.toContainText("No more flicker");

  // Drive the real Calcite slider: two 0.05-cm keyboard steps reach 0.10 cm
  // (1 mm). The
  // old threshold claimed this was always fixed; the corrected lesson must
  // preserve the precision caveat.
  const liftHost = demo
    .locator("calcite-label")
    .filter({ hasText: /Lift stripe \(cm\)/ })
    .locator("calcite-slider");
  await expect(liftHost).toHaveAttribute("min", "0");
  await expect(liftHost).toHaveAttribute("max", "1");
  await expect(liftHost).toHaveAttribute("step", "0.05");
  const liftThumb = liftHost.locator('[role="slider"]');
  await liftThumb.focus();
  await liftThumb.press("ArrowRight");
  await liftThumb.press("ArrowRight");
  await expect(liftHost).toHaveJSProperty("value", 0.1);
  await expect(caption).toContainText(/not a reliable fix/i);
  await expect(caption).not.toContainText(/No more flicker|can now tell the two surfaces apart/i);

  // Far can move close enough to visibly clip the distant scene. Its smaller
  // precision contribution is explained separately from the dominant Near control.
  const farHost = demo
    .locator("calcite-label")
    .filter({ hasText: /Far plane \(m\)/ })
    .locator("calcite-slider");
  const frustum = demo.getByTestId("depth-buffer-frustum");
  await expect(farHost).toHaveAttribute("min", "10");
  await expect(farHost).toHaveAttribute("max", "100");
  await farHost.locator('[role="slider"]').focus();
  await farHost.locator('[role="slider"]').press("Home");
  await expect(frustum).toHaveAttribute("data-far", "10");
  await expect(frustum).toContainText(/lower Far to 10 m to clip the distance/i);

  // The ArcGIS companion imports the same shared scale, so the two lessons
  // cannot drift back to different units or offset ranges.
  const elevationHost = page
    .locator("calcite-label")
    .filter({ hasText: /Elevation offset \(cm\)/ })
    .locator("calcite-slider");
  await expect(elevationHost).toHaveAttribute("min", "0");
  await expect(elevationHost).toHaveAttribute("max", "1");
  await expect(elevationHost).toHaveAttribute("step", "0.05");

  // Navigation is live too: keyboard and pointer drag use the same camera
  // state and stop the automatic sway without changing camera distance.
  const camera = demo.getByTestId("depth-buffer-camera");
  await expect(camera).toHaveAttribute("data-mode", "sway");
  await expect(demo.getByText(/Near plane is the closest visible distance/i)).toBeVisible();
  await canvas.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(camera).toHaveAttribute("data-mode", "manual");
  const yawBeforeDrag = await camera.getAttribute("data-yaw");
  const pitchBeforeDrag = Number(await camera.getAttribute("data-pitch"));
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Depth-buffer canvas did not have a bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 15);
  await page.mouse.up();
  await expect.poll(() => camera.getAttribute("data-yaw")).not.toBe(yawBeforeDrag);
  await expect
    .poll(async () => Number(await camera.getAttribute("data-pitch")))
    .toBeGreaterThan(pitchBeforeDrag);
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

test("Architectural path tracing resets and reconverges when daylight changes", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const errors = collectPageErrors(page);
  await page.goto("#/term/path-tracing");
  await expect(page.getByRole("heading", { level: 1, name: /path tracing/i })).toBeVisible();

  // This term contains a diagram companion too, so scope the WebGL assertion to
  // the ArcGIS custom element rather than accepting the first figure canvas.
  const scene = page.locator("figure arcgis-scene").first();
  await expect(scene.locator("canvas")).toBeVisible({
    timeout: 60_000,
  });
  await scene.scrollIntoViewIfNeeded();

  const daylightExpand = scene.locator("arcgis-expand");
  const daylight = page.getByTestId("path-trace-daylight");
  await expect(daylightExpand).toHaveJSProperty("expanded", false);
  await expect(daylight).toBeHidden();

  const expandButton = daylightExpand.locator('calcite-action[title="Change date and time"]');
  await expect(expandButton).toBeVisible();
  await expandButton.click();
  await expect(daylightExpand).toHaveJSProperty("expanded", true);
  await expect(daylight).toBeVisible({ timeout: 60_000 });
  expect(await daylight.evaluate((element) => Reflect.get(element, "hidePlayButtons"))).toBe(true);

  const status = page.getByTestId("path-trace-status");
  await expect(status).toBeVisible();
  await expect
    .poll(async () => Number(await status.getAttribute("data-samples")), {
      message: "the initial path-tracing estimate should begin accumulating",
      timeout: 60_000,
    })
    .toBeGreaterThan(1);

  // Record every data-samples mutation so a fast reset cannot hide between two
  // Playwright polling turns. Then drive the real Daylight slider by keyboard;
  // this must update SunLighting.date, reset to 1 SPP, and begin accumulating.
  await status.evaluate((element) => {
    const transitions = [Number(element.getAttribute("data-samples"))];
    element.setAttribute("data-test-sample-transitions", JSON.stringify(transitions));
    const observer = new MutationObserver(() => {
      transitions.push(Number(element.getAttribute("data-samples")));
      element.setAttribute("data-test-sample-transitions", JSON.stringify(transitions));
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-samples"] });
  });

  const readLightingDate = async (): Promise<string> =>
    scene.evaluate((element) => {
      const environment = Reflect.get(element, "environment");
      const lighting = Reflect.get(environment, "lighting");
      return Reflect.get(lighting, "date").toISOString();
    });
  const dateBefore = await readLightingDate();
  const timeSlider = daylight.locator('[role="slider"]');
  await expect(daylight.locator("arcgis-time-of-day-slider")).toBeVisible();
  await timeSlider.focus();
  await page.keyboard.press("ArrowRight");

  await expect.poll(readLightingDate, { timeout: 30_000 }).not.toBe(dateBefore);
  await expect
    .poll(
      async () => {
        const raw = await status.getAttribute("data-test-sample-transitions");
        const transitions = JSON.parse(raw ?? "[]") as number[];
        const resetIndex = transitions.indexOf(1);
        return resetIndex >= 0 && transitions.slice(resetIndex + 1).some((sample) => sample > 1);
      },
      {
        message: "the daylight-driven sun change should reset and then reconverge",
        timeout: 60_000,
      },
    )
    .toBe(true);
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
