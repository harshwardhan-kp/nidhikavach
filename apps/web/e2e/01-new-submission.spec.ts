import { expect, test } from "@playwright/test";
import { drawReceipt, isoDate, signIn } from "./helpers";

/**
 * Scenario 1 · new submission. A bank books ₹5 lakh; the institution declares
 * ₹50 lakh with a matching-looking scan. Both readers read the scan, the bank
 * check over Account Aggregator catches the difference.
 */
test("new FDR: scan read by two readers, bank check catches an inflated amount", async ({ page }) => {
  test.setTimeout(420_000);
  const fdrNo = `9${Date.now().toString().slice(-10)}`;
  const today = new Date();
  const matures = new Date(today);
  matures.setFullYear(today.getFullYear() + 5);

  await test.step("the bank books ₹5 lakh (mock bank teller)", async () => {
    await signIn(page, "system admin");
    await page.goto("/app/admin/bank");
    await page.locator('input[name="accountNo"]').fill(fdrNo);
    await page.getByRole("button", { name: "[book deposit]" }).click();
    await expect(page.getByText(`Booked FDR ${fdrNo}`)).toBeVisible();
  });

  let caseUrl = "";
  await test.step("the institution submits it as ₹50 lakh with its scan", async () => {
    await signIn(page, "institution");
    await page.goto("/app/submit");
    await page.locator('input[name="programme"]').fill("Diploma in Civil Engineering");
    await page.locator('input[name="instrumentNo"]').fill(fdrNo);
    await page.locator('input[name="amount"]').fill("5000000");
    await page.locator('input[name="issueDate"]').fill(isoDate(today));
    await page.locator('input[name="maturityDate"]').fill(isoDate(matures));
    await page.locator('input[name="ifsc"]').fill("SBIN0000305");
    await page.locator('input[name="ifsc"]').blur();
    const dmy = (d: Date) => d.toLocaleDateString("en-GB");
    const scan = await drawReceipt(page, { fdrNo, amountFigures: "Rs. 50,00,000.00", amountWords: "Rupees Fifty Lakh Only", issued: dmy(today), matures: dmy(matures), depositor: "Deccan Plateau Polytechnic, Nagpur" });
    await page.locator('input[name="scan"]').setInputFiles({ name: "fdr-scan.jpg", mimeType: "image/jpeg", buffer: scan });
    await page.getByRole("button", { name: "[submit for verification]" }).click();
    await page.waitForURL(/\/app\/cases\/FDR-.*submitted=1/);
    caseUrl = page.url().replace(/\?.*/, "");
    await expect(page.getByText(/fields read the same by Azure Document Intelligence/)).toBeVisible({ timeout: 90_000 });
  });

  await test.step("the dealing officer asks the bank: it confirms only ₹5 lakh", async () => {
    await signIn(page, "dealing officer · maker");
    await page.goto(caseUrl);
    await page.getByRole("button", { name: /ask the bank to confirm/ }).click();
    await expect(page.getByText(/its record differs from the declaration/)).toBeVisible({ timeout: 60_000 });
    // The case page re-renders once the rescoring is in.
    await expect(page.getByText("Bank confirms a different amount").first()).toBeVisible({ timeout: 60_000 });
  });
});
