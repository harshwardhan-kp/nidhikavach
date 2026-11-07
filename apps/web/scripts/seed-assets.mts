/**
 * Uploads generated files the seed refers to (run after db:seed --full):
 * the shared synthetic release dossier.
 */
import { eq, sql } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { db, schema } from "@/db";
import { SEED_DOSSIER_KEY } from "@/db/seed/generate";
import { fileMeta, uploadBytes } from "@/lib/sidecar";

const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
const sections = [
  ["1. Request letter", "The Trust requests release of the Security Deposit held as FDR in the joint name of the Trust and AICTE, the ten-year hold having been completed."],
  ["2. Affidavit 6 (for the release of Security Deposit)", "No cognizable action, inquiry or adverse action is pending; all LoA conditions are fulfilled; the institution runs at its approved permanent site; no fee-refund case or embezzlement complaint is pending; the FDR was not mortgaged."],
  ["3. Copy of the FDR", "Copy of the fixed deposit receipt to be released."],
  ["4. Latest LoA / EoA", "Copy of the latest Letter of Approval / Extension of Approval."],
];
for (const [title, body] of sections) {
  const page = pdf.addPage([595.28, 841.89]);
  page.drawText("SPECIMEN · SYNTHETIC RELEASE DOSSIER (NidhiKavach prototype)", { x: 56, y: 790, size: 9, font: bold, color: rgb(0.9, 0.23, 0.23) });
  page.drawText(title, { x: 56, y: 750, size: 16, font: bold });
  page.drawText(body, { x: 56, y: 720, size: 10.5, font, maxWidth: 480, lineHeight: 15 });
}
const bytes = await pdf.save();
// Stored files are write-once on the sidecar: reuse the dossier if an earlier seed uploaded it.
const existing = await fileMeta(SEED_DOSSIER_KEY);
const meta = existing.exists ? existing : await uploadBytes(SEED_DOSSIER_KEY, bytes, "application/pdf", "release-dossier.pdf");
const res = await db.update(schema.documents).set({ sha256: meta.sha256!, sizeBytes: meta.size! }).where(eq(schema.documents.fileKey, SEED_DOSSIER_KEY)).returning({ id: schema.documents.id });
console.log({ dossier: meta.sha256?.slice(0, 12), documents: res.length, releases: (await db.execute(sql`select state, count(*) from release_requests group by 1`)).map((r) => `${r.state}:${r.count}`) });
process.exit(0);
