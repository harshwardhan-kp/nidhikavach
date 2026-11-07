import { expect, test } from "@playwright/test";
import { openCase, signIn } from "./helpers";

/** Scenario 2 · validity tracking. Moving the demo clock re-derives every FDR's lanes. */
test("validity: a 30-day clock jump moves FDRs into the maturity windows", async ({ page }) => {
  await signIn(page, "system admin");
  await page.goto("/app/admin");
  await page.getByRole("button", { name: "+30 days" }).click();
  await expect(page.getByText("demo clock +30d")).toBeVisible({ timeout: 60_000 });

  await page.goto("/app/maturity?tab=30");
  await expect(page.getByRole("link", { name: /within 7 days/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "FDR-26-04187" })).toBeVisible();

  await openCase(page, "FDR-26-04187");
  await expect(page.getByText("expiring").first()).toBeVisible();
  await expect(page.getByText(/^\d+d left$/).first()).toBeVisible();
});
