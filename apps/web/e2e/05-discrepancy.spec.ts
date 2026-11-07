import { expect, test } from "@playwright/test";
import { openCase, signIn } from "./helpers";

/**
 * Scenario 5 · discrepancy. The forged-amount FDR: the tamper scan flags the
 * pasted amount, the officer writes to the institution, resolves, and a second
 * officer closes it.
 */
test("discrepancy: tamper flag, letter to the institution, maker resolves, checker closes", async ({ page }) => {
  await signIn(page, "dealing officer · maker");
  await openCase(page, "FDR-26-03952");

  await page.getByRole("button", { name: /read scan/ }).click();
  await expect(page.getByText(/^Scan read by/)).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/One region was not compressed with the rest of the page/)).toBeVisible();

  await page.getByRole("button", { name: /draft it/ }).click();
  await expect(page.getByLabel("Subject")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "[send to outbox]" }).click();
  await expect(page.getByText(/^Sent to nodal\./)).toBeVisible({ timeout: 30_000 });

  const amount = page.locator("li", { hasText: "Bank confirms a different amount" }).first();
  await amount.getByRole("button", { name: "[mark resolved]" }).click();
  await amount.getByPlaceholder(/How it was resolved/).fill("Institution confirms the deposit is ₹2,50,000; a corrected declaration will follow.");
  await amount.getByRole("button", { name: "[mark resolved]" }).last().click();
  await expect(page.getByText("Marked resolved: a checker must close it")).toBeVisible();

  await signIn(page, "regional officer · checker");
  await openCase(page, "FDR-26-03952");
  await page.locator("li", { hasText: "Bank confirms a different amount" }).first().getByRole("button", { name: "[close as checker]" }).click();
  await expect(page.getByText("Discrepancy closed")).toBeVisible();
});
