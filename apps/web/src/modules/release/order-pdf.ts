import "server-only";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import QRCode from "qrcode";
import { pdfSafe } from "@/lib/pdf-text";

export type OrderContent = {
  orderNo: string;
  date: string; // display date
  region: string;
  kind: "release" | "refund";
  institution: { name: string; aicteId: string; city: string | null };
  fdr: { caseNo: string; number: string; amount: string; bank: string; branch: string; ifsc: string; issued: string; matures: string };
  approvals: { step: string; name: string; designation: string; at: string; comment: string | null }[];
  signer: { name: string; designation: string; keyId: string; signature: string };
  verifyUrl: string;
};

const INK = rgb(0.11, 0.11, 0.11);
const MUTED = rgb(0.42, 0.42, 0.42);
const RED = rgb(0.906, 0.227, 0.227);

/** Wraps text to a width using the font's metrics. */
function wrap(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, width: number) {
  const lines: string[] = [];
  for (const para of pdfSafe(text).split("\n")) {
    let line = "";
    for (const word of para.split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** The release order as a one-page A4 PDF with a QR code to the public verify page. Plain ASCII: standard PDF fonts have no rupee sign. */
export async function buildOrderPdf(o: OrderContent) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Release order ${o.orderNo}`);
  pdf.setProducer("NidhiKavach prototype");
  const page = pdf.addPage([595.28, 841.89]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const L = 56;
  const W = 595.28 - 2 * L;
  let y = 790;
  const text = (t: string, opts: { size?: number; f?: typeof font; color?: ReturnType<typeof rgb>; x?: number } = {}) => {
    page.drawText(pdfSafe(t), { x: opts.x ?? L, y, size: opts.size ?? 10.5, font: opts.f ?? font, color: opts.color ?? INK });
  };
  const para = (t: string, size = 10.5, gap = 4) => {
    for (const line of wrap(t, font, size, W)) {
      text(line, { size });
      y -= size + gap;
    }
  };

  // Watermark: this is a prototype artefact.
  page.drawText("PROTOTYPE  SPECIMEN  NOT A VALID ORDER", { x: 80, y: 190, size: 25, font: bold, color: rgb(0.93, 0.85, 0.85), rotate: degrees(35), opacity: 0.6 });

  text("NIDHIKAVACH  /  SECURITY DEPOSIT REGISTRY", { size: 8.5, f: bold, color: RED });
  y -= 16;
  text(`${o.region}`, { size: 13, f: bold });
  y -= 15;
  text("Approval Bureau - Security Deposits (prototype issued for SIH 2026, problem SIH26265)", { size: 8.5, color: MUTED });
  y -= 22;
  page.drawLine({ start: { x: L, y }, end: { x: L + W, y }, thickness: 0.7, color: MUTED });
  y -= 20;
  text(`Order No. ${o.orderNo}`, { f: bold });
  text(`Date: ${o.date}`, { x: L + W - bold.widthOfTextAtSize(`Date: ${o.date}`, 10.5) });
  y -= 24;
  text("To", { size: 10 });
  y -= 13;
  text(`The Secretary / Nodal Officer, ${o.institution.name}`, { size: 10 });
  y -= 13;
  text(`AICTE permanent ID ${o.institution.aicteId}${o.institution.city ? `, ${o.institution.city}` : ""}`, { size: 10, color: MUTED });
  y -= 24;
  text(`Subject: ${o.kind === "release" ? "Release" : "Refund"} of Security Deposit held as FDR ${o.fdr.number} (${o.fdr.caseNo})`, { f: bold, size: 10.5 });
  y -= 22;
  para(
    o.kind === "release"
      ? `The ten-year hold on the Security Deposit has been completed and the conditions under clause 6.46 of the Approval Process Handbook 2024-27 have been verified. The competent authority has approved the release of the deposit below. The issuing bank is requested to remove the lien marked in favour of AICTE and release the deposit to the institution.`
      : `On the closure / merger certified by the affiliating university or board, and after verifying the conditions under clause 6.46 of the Approval Process Handbook 2024-27, the competent authority has approved the refund of the deposit below. The issuing bank is requested to remove the lien marked in favour of AICTE.`,
  );
  y -= 10;

  const rows: [string, string][] = [
    ["FDR number", o.fdr.number],
    ["Amount", o.fdr.amount],
    ["Bank / branch", `${o.fdr.bank}, ${o.fdr.branch}`],
    ["IFSC", o.fdr.ifsc],
    ["Issued / matures", `${o.fdr.issued} / ${o.fdr.matures}`],
    ["Registry case", o.fdr.caseNo],
  ];
  for (const [k, v] of rows) {
    text(k, { size: 9.5, color: MUTED });
    text(v, { size: 9.5, x: L + 130, f: mono });
    y -= 15;
  }
  y -= 12;
  text("Decision trail (maker / checker / authority, three different officers)", { size: 9.5, f: bold });
  y -= 15;
  for (const a of o.approvals) {
    text(`${a.step.padEnd(10)} ${a.name}`, { size: 9, f: mono });
    text(a.at, { size: 9, f: mono, x: L + W - mono.widthOfTextAtSize(a.at, 9) });
    y -= 11;
    text(a.designation, { size: 8.5, color: MUTED, x: L + 14 });
    y -= 11;
    if (a.comment) {
      const lines = wrap(`"${a.comment}"`, font, 8.5, W - 20);
      for (const [k, line] of lines.slice(0, 3).entries()) {
        text(k === 2 && lines.length > 3 ? `${line} ...` : line, { size: 8.5, color: MUTED, x: L + 14 });
        y -= 11;
      }
    }
    y -= 4;
  }

  // Signature block + QR.
  y -= 14;
  const qr = await QRCode.toBuffer(o.verifyUrl, { margin: 1, width: 220, errorCorrectionLevel: "M" });
  const img = await pdf.embedPng(qr);
  page.drawImage(img, { x: L + W - 104, y: y - 104, width: 104, height: 104 });
  text("Digitally signed (simulated eSign, Ed25519)", { size: 9.5, f: bold });
  y -= 14;
  text(`${o.signer.name}`, { size: 10 });
  y -= 13;
  text(`${o.signer.designation}`, { size: 9.5, color: MUTED });
  y -= 15;
  text(`Key ${o.signer.keyId}`, { size: 8, f: mono, color: MUTED });
  y -= 11;
  for (const line of o.signer.signature.match(/.{1,52}/g) ?? []) {
    text(line, { size: 7.5, f: mono, color: MUTED });
    y -= 9.5;
  }
  y = Math.min(y, 150);
  y -= 16;
  para(`Verify this order: scan the QR code or open ${o.verifyUrl}. The page checks the signature against the officer's published key and the SHA-256 of this file.`, 8.5, 3);
  return pdf.save();
}
