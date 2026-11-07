import "server-only";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { pdfSafe } from "@/lib/pdf-text";
import { type Column, formatCell } from "./reports";

const MAX_ROWS = 1500;

/** A landscape A4 table: title, scope line, repeated header, page numbers. */
export async function reportPdf(title: string, subtitle: string, columns: Column[], rows: Record<string, unknown>[]) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("NidhiKavach prototype");
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89;
  const H = 595.28;
  const L = 32;
  const usable = W - 2 * L;
  const size = 7;
  // Width by content: sample the rows, cap wide text columns.
  const want = columns.map((c) => {
    const sample = rows.slice(0, 200).map((r) => font.widthOfTextAtSize(pdfSafe(formatCell(r[c.key], c.kind)), size));
    return Math.min(Math.max(bold.widthOfTextAtSize(c.label, size), ...sample, 20) + 8, c.key === "institution" || c.key === "title" ? 170 : 110);
  });
  const scale = usable / want.reduce((a, b) => a + b, 0);
  const widths = want.map((w) => w * scale);
  const clip = (t: string, w: number, f = font) => {
    let s = pdfSafe(t);
    while (s.length > 1 && f.widthOfTextAtSize(s, size) > w - 4) s = s.slice(0, -2);
    return s === pdfSafe(t) ? s : `${s.slice(0, -1)}.`;
  };

  const list = rows.slice(0, MAX_ROWS);
  let page = pdf.addPage([W, H]);
  let y = H - 36;
  let pageNo = 1;
  const header = () => {
    page.drawText(pdfSafe(title), { x: L, y, size: 13, font: bold });
    page.drawText(pdfSafe(subtitle), { x: L, y: y - 14, size: 8, font, color: rgb(0.42, 0.42, 0.42) });
    y -= 34;
    let x = L;
    columns.forEach((c, k) => {
      page.drawText(clip(c.kind === "money" ? `${c.label} (Rs)` : c.label, widths[k], bold), { x: x + 2, y, size, font: bold });
      x += widths[k];
    });
    y -= 4;
    page.drawLine({ start: { x: L, y }, end: { x: W - L, y }, thickness: 0.5, color: rgb(0.6, 0.6, 0.6) });
    y -= 10;
  };
  const footer = () => page.drawText(`NidhiKavach prototype · synthetic data · page ${pageNo}`, { x: L, y: 18, size: 7, font, color: rgb(0.5, 0.5, 0.5) });
  header();
  for (const [n, r] of list.entries()) {
    if (y < 34) {
      footer();
      page = pdf.addPage([W, H]);
      pageNo += 1;
      y = H - 36;
      header();
    }
    if (n % 2 === 0) page.drawRectangle({ x: L, y: y - 2.5, width: usable, height: 10, color: rgb(0.965, 0.965, 0.96) });
    let x = L;
    columns.forEach((c, k) => {
      const t = clip(formatCell(r[c.key], c.kind), widths[k]);
      const tx = c.kind === "money" || c.kind === "num" ? x + widths[k] - 4 - font.widthOfTextAtSize(t, size) : x + 2;
      page.drawText(t, { x: tx, y, size, font });
      x += widths[k];
    });
    y -= 10;
  }
  if (rows.length > MAX_ROWS) page.drawText(`… ${rows.length - MAX_ROWS} more rows in the CSV export`, { x: L, y: y - 4, size: 7.5, font: bold });
  footer();
  return pdf.save();
}
