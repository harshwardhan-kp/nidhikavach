import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import type { TrustResult } from "@/lib/rules/trust";
import type { CaseDetail } from "@/modules/cases/queries";

export const briefSchema = z.object({
  lines: z.array(z.object({ text: z.string(), cites: z.array(z.string()) })),
  blocking: z.string(),
});
export type Brief = z.infer<typeof briefSchema>;

/** The facts the model may use: everything is already on the record, each with a citable id. */
export function briefFacts(c: CaseDetail, today: string) {
  const i = c.i;
  const trust = i.trustBreakdown as TrustResult | null;
  return {
    today,
    case: { caseNo: i.caseNo, institution: c.inst.name, region: c.region.name, type: i.type, programme: i.programme, amountRupees: (i.amountPaise ?? 0) / 100, bank: i.bankName, ifsc: i.ifsc, issued: i.issueDate, matures: i.maturityDate, lien: i.lienHolder },
    lanes: { record: i.recordStatus, verification: i.verificationStatus, validity: i.validityStatus, renewal: i.renewalStatus, release: i.releaseStatus },
    trust: trust ? { score: trust.score, band: trust.band, penalties: trust.penalties.map((p) => p.reason) } : null,
    nextAction: i.nextAction ? { text: i.nextAction, owner: c.owner?.name ?? null, due: i.nextActionDue } : null,
    fieldsNotMatching: c.fields.filter((f) => f.match === "mismatch").map((f) => ({ field: f.field, declared: f.declaredValue, scan: f.scanValue, bank: f.bankValue })),
    discrepancies: c.discrepancies.map((d) => ({ id: `disc:${d.id.slice(0, 8)}`, title: d.title, severity: d.severity, status: d.status })),
    documents: c.documents.map((d) => ({ id: `doc:${d.kind}`, tamperScore: d.tamperScore })),
    renewalChain: c.chain.map((l) => ({ caseNo: l.case_no, matures: l.maturity_date, renewal: l.renewal_status, release: l.release_status })),
    ledger: [...c.ledger]
      .reverse()
      .slice(-30)
      .map(({ e, actor }) => ({ id: `#${e.seq}`, at: e.ts.toISOString().slice(0, 10), action: e.action, by: actor ?? e.actorRole, detail: JSON.stringify(e.payload).slice(0, 160) })),
  };
}

/** A4: a short, cited history of the case for an officer picking it up cold. */
export async function caseBrief(c: CaseDetail, today: string, actorId: string) {
  const { data, cached } = await structured({
    feature: "A4.brief",
    model: MODELS.quality,
    schemaName: "case_brief",
    schema: briefSchema,
    effort: "low",
    actorId,
    instrumentId: c.i.id,
    instructions: [
      "You brief an AICTE officer on one security-deposit case (an FDR lien-marked to AICTE).",
      "Write 4 or 5 short lines, oldest to newest: how the case started, what verification found, what happened since, where it stands now.",
      "Every line must cite the ids it relies on in `cites` (ledger ids like #123, doc:fdr_scan, disc:xxxx). Use only the facts given; never invent dates, amounts or people.",
      "`blocking` is one sentence: what is stopping the case from being closed or accepted right now, and who must act. If nothing blocks it, say so.",
      "Plain English, no hedging, amounts in Indian format (₹5,00,000).",
    ].join(" "),
    input: JSON.stringify(briefFacts(c, today)),
  });
  return { ...data, cached };
}
