import { expect, type Page } from "@playwright/test";

export type Role = "institution" | "dealing officer · maker" | "regional officer · checker" | "competent authority" | "auditor" | "system admin";

/** Signs in with the one-click demo account for a role (fresh cookies each time). */
export async function signIn(page: Page, role: Role) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(`\\[${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\]`) }).click();
  await page.waitForURL(/\/app/);
}

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/** A plain FDR receipt drawn in the browser, returned as JPEG bytes for setInputFiles. */
export async function drawReceipt(page: Page, f: { fdrNo: string; amountFigures: string; amountWords: string; issued: string; matures: string; depositor: string }) {
  const b64 = await page.evaluate(async (x) => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 800;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fbfaf6";
    g.fillRect(0, 0, 1200, 800);
    g.fillStyle = "#1c3f7a";
    g.font = "bold 34px serif";
    g.fillText("STATE BANK OF INDIA   Akluj Branch · IFSC SBIN0000305", 40, 70);
    g.fillStyle = "#111";
    g.font = "bold 30px serif";
    g.fillText("FIXED DEPOSIT RECEIPT", 380, 140);
    g.font = "24px serif";
    const rows = [
      ["Receipt No.", x.fdrNo],
      ["Depositor", x.depositor],
      ["PRINCIPAL AMOUNT", x.amountFigures],
      ["Amount in words", x.amountWords],
      ["Date of Deposit", x.issued],
      ["Due Date of Maturity", x.matures],
      ["Auto Renewal", "No"],
      ["LIEN MARKED IN FAVOUR OF:", "Member Secretary, AICTE, New Delhi"],
    ];
    rows.forEach(([k, v], i) => {
      g.fillText(k, 60, 220 + i * 60);
      g.fillText(v, 480, 220 + i * 60);
    });
    g.fillText("Authorised Signatory", 880, 760);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  }, f);
  return Buffer.from(b64, "base64");
}

/** A tiny valid PDF standing in for a release dossier. */
export const DOSSIER_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
);

export async function openCase(page: Page, caseNo: string) {
  await page.goto(`/app/cases/${caseNo}`);
  await expect(page.getByRole("heading", { name: caseNo })).toBeVisible();
}
