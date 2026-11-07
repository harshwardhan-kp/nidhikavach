import { expect, test } from "@playwright/test";
import { signIn } from "./helpers";

/** Scenario 3 · approaching maturity. The T-30 reminder reached the institution's inbox and email. */
test.describe("approaching maturity", () => {
  test.afterAll(async ({ browser }) => {
    // Put the demo clock back (this also withdraws the reminders that had not happened yet).
    const page = await browser.newPage();
    await signIn(page, "system admin");
    await page.goto("/app/admin");
    await page.getByRole("button", { name: "reset to real date" }).click();
    await expect(page.getByText(/offset \+0 days/)).toBeVisible({ timeout: 60_000 });
    await page.close();
  });

  test("the institution is reminded at T-30 by inbox and email", async ({ page }) => {
    await signIn(page, "institution");
    await page.goto("/app/inbox");
    await expect(page.getByRole("link", { name: "FDR-26-04187: FDR matures in 30 days (T-30)" })).toBeVisible();

    await page.goto("/app/outbox");
    await expect(page.getByText("FDR-26-04187: FDR matures in 30 days (T-30)").first()).toBeVisible();
    await expect(page.getByText(/to nodal\.gpnagpur@demo\.nidhikavach\.in/).first()).toBeVisible();
  });
});
