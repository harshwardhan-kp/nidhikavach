import { expect, test } from "@playwright/test";
import { openCase, signIn } from "./helpers";

/** Scenario 4 · renewal. Verifying the renewed FDR closes the old link in the chain. */
test("renewal: accepting FDR-26-05402 closes FDR-23-11820 as renewed", async ({ page }) => {
  await signIn(page, "dealing officer · maker");
  await openCase(page, "FDR-26-05402");

  await page.getByRole("button", { name: /read scan/ }).click();
  await expect(page.getByText(/^Scan read by/)).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: /ask the bank to confirm/ }).click();
  await expect(page.getByText(/Bank confirmed the deposit via Account Aggregator/)).toBeVisible({ timeout: 60_000 });

  // Accept unlocks once the page has re-rendered with the bank's answer.
  const accept = page.getByRole("button", { name: "[accept record]" });
  await expect(accept).toBeEnabled({ timeout: 60_000 });
  await accept.click();
  await expect(page.getByText("FDR-23-11820 is now closed as renewed")).toBeVisible({ timeout: 60_000 });

  await openCase(page, "FDR-23-11820");
  await expect(page.getByText("renewed").first()).toBeVisible();
});
