/** Captures the landing page's hero screenshot from the live portal (read-only pages). */
import { chromium } from "@playwright/test";

const base = process.env.SHOT_BASE_URL ?? "https://nidhikavach.vercel.app";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
await page.goto(`${base}/login`);
await page.getByRole("button", { name: /\[competent authority\]/ }).click();
await page.waitForURL(/\/app/);
// Let the AI briefing stream in before the shot.
await page.getByText("[for your decision]").waitFor({ timeout: 90_000 });
await page.screenshot({ path: process.argv[2], clip: { x: 0, y: 0, width: 1440, height: 900 } });
await browser.close();
process.exit(0);
