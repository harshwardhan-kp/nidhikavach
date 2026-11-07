import { expect, test } from "@playwright/test";
import { DOSSIER_PDF, openCase, signIn } from "./helpers";

/**
 * Scenario 6 · authorised release. Institution requests, three different
 * officers decide, the order is eSigned and verifiable by anyone.
 */
test("release: request → recommend → check → approve and eSign → public verify", async ({ page, context }) => {
  await signIn(page, "institution");
  await openCase(page, "FDR-16-03310");
  await page.getByRole("button", { name: "[request release / refund]" }).click();
  await page.locator('textarea[name="reason"]').fill("The ten-year hold on our Diploma Mechanical Engineering deposit is complete; please release it.");
  await page.locator('input[name="dossier"]').setInputFiles({ name: "release-dossier.pdf", mimeType: "application/pdf", buffer: DOSSIER_PDF });
  await page.getByRole("button", { name: "[send request]" }).click();
  await expect(page.getByText(/Request sent/)).toBeVisible({ timeout: 30_000 });

  await signIn(page, "dealing officer · maker");
  await openCase(page, "FDR-16-03310");
  await page.getByLabel(/PGRC, Vigilance/).check();
  await page.getByLabel(/No embezzlement complaint/).check();
  await page.getByRole("button", { name: "[recommend]" }).click();
  await expect(page.getByText("Recommended. The regional officer checks it next.")).toBeVisible();

  await signIn(page, "regional officer · checker");
  await openCase(page, "FDR-16-03310");
  await page.getByRole("button", { name: "[check and forward]" }).click();
  await expect(page.getByText("Checked. The competent authority decides next.")).toBeVisible();

  await signIn(page, "competent authority");
  await openCase(page, "FDR-16-03310");
  await page.getByRole("button", { name: /approve and eSign the order/ }).click();
  await expect(page.getByText(/Approved and signed\. Order AICTE\//)).toBeVisible({ timeout: 60_000 });

  const [verify] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name: "public verify page" }).click()]);
  await verify.waitForLoadState();
  await expect(verify.getByRole("heading", { name: "Genuine and unchanged" })).toBeVisible();
});
