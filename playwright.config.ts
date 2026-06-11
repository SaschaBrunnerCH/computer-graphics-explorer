import { defineConfig } from "@playwright/test";

// WebGL in headless browsers is flaky: force SwiftShader software rendering
// and treat "canvas exists + no page errors" as success (no pixel testing).
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:5173/computer-graphics-explorer/",
    headless: true,
    launchOptions: {
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: {
    command: "npm run dev -- --no-open --port 5173",
    url: "http://localhost:5173/computer-graphics-explorer/",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
