import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
const manifest = JSON.parse(readFileSync("/tmp/claude-1000/-home-sasc9948-dev-github-SaschaBrunnerCH-computer-graphics-explorer/8a8c3ca2-0fb3-4ac6-a1cb-f08b2006f951/scratchpad/audit-manifest.json", "utf8"));
const BASE = "https://saschabrunnerch.github.io/computer-graphics-explorer";
const NOISE = [/THREE\.Clock/, /Failed to load resource.*net::/, /favicon/];
const browser = await chromium.launch({ headless: true, args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const results = [];
for (const { key, term, title } of manifest) {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const logs = [];
  page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") logs.push(`[${m.type()}] ${m.text()}`); });
  page.on("pageerror", (e) => logs.push(`[pageerror] ${e.message}`));
  const entry = { key, term, ok: false, caption: "", errors: [] };
  try {
    await page.goto(`${BASE}/#/term/${term}`, { waitUntil: "domcontentloaded", timeout: 40000 });
    const esc = title.slice(0, 40).replace(/"/g, '\\"');
    const fig = page.locator(`figure:has-text("${esc}")`).first();
    await fig.scrollIntoViewIfNeeded({ timeout: 30000 });
    await fig.locator("canvas").first().waitFor({ timeout: 60000 }).catch(() => { entry.errors.push("[audit] no canvas"); });
    await page.waitForTimeout(18000);
    entry.caption = ((await fig.locator("figcaption").textContent()) || "").slice(0, 260);
    await fig.screenshot({ path: `audit-out/${key}.png` });
    entry.ok = true;
  } catch (err) {
    entry.errors.push(`[audit] ${String(err).slice(0, 180)}`);
  }
  entry.errors.push(...logs.filter((l) => !NOISE.some((n) => n.test(l))).map((l) => l.slice(0, 260)));
  results.push(entry);
  console.log(`${entry.ok ? "SHOT" : "FAIL"} ${key} ${entry.errors.length ? "| " + entry.errors[0].slice(0, 100) : ""}`);
  await page.close();
}
writeFileSync("audit-out/results.json", JSON.stringify(results, null, 1));
console.log("SWEEP DONE:", results.length);
await browser.close();
