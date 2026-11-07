import { defineConfig, devices } from "@playwright/test";

/**
 * The six SIH26265 scenarios, run in order against one environment. They change
 * data (the local dev server and production share the VM database), so run
 * `npm run db:reseed` afterwards. Videos double as the demo recording.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3100",
    viewport: { width: 1440, height: 900 },
    video: "on",
    trace: "retain-on-failure",
    actionTimeout: 30_000,
  },
});
