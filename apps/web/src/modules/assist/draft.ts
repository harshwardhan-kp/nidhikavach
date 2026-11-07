import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import { formatDate, formatPaise } from "@/lib/utils";
import type { CaseDetail } from "@/modules/cases/queries";

export const DRAFT_KINDS = ["discrepancy_letter", "bank_request", "escalation_note"] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];
export const DRAFT_LABEL: Record<DraftKind, string> = {
  discrepancy_letter: "letter to the institution",
  bank_request: "verification request to the bank",
  escalation_note: "escalation note",
};

export const draftSchema = z.object({ subject: z.string(), body: z.string() });

const BRIEF: Record<DraftKind, string> = {
  discrepancy_letter:
    "A formal letter from the AICTE regional office to the institution's nodal officer listing each open discrepancy on this security-deposit FDR and what the institution must submit or clarify, with a 15-day deadline from today.",
  bank_request:
    "A formal request from the AICTE regional office to the issuing bank branch asking it to confirm, on letterhead, the FDR's number, principal, issue and maturity dates, depositor, and that a lien is marked in favour of the Member Secretary, AICTE, New Delhi; and to state if the deposit was closed early.",
  escalation_note:
    "A short internal note from the dealing officer to the regional officer and competent authority explaining why this case is escalated (overdue renewal, unresolved discrepancy or bank mismatch), what was already done, and the decision needed.",
};

/** A6: a draft the officer edits before anything is sent. */
export async function draftLetter(c: CaseDetail, kind: DraftKind, lang: "en" | "hi", sender: { name: string; designation: string }, today: string) {
  const i = c.i;
  const facts = {
    today: formatDate(today),
    sender,
    institution: { name: c.inst.name, aicteId: c.inst.aicteId, city: c.inst.city },
    region: `${c.region.name} Regional Office, AICTE`,
    fdr: { caseNo: i.caseNo, number: i.instrumentNo, amount: formatPaise(i.amountPaise), bank: i.bankName, branch: i.branch, ifsc: i.ifsc, issued: formatDate(i.issueDate), matures: formatDate(i.maturityDate), lien: i.lienHolder },
    status: { record: i.recordStatus, verification: i.verificationStatus, validity: i.validityStatus, renewal: i.renewalStatus },
    openDiscrepancies: c.discrepancies.filter((d) => !["closed", "dismissed"].includes(d.status)).map((d) => ({ title: d.title, detail: d.detail, severity: d.severity })),
    mismatches: c.fields.filter((f) => f.match === "mismatch").map((f) => ({ field: f.field, declared: f.declaredValue, bank: f.bankValue, scan: f.scanValue })),
  };
  const { data, callId } = await structured({
    feature: "A6.draft",
    model: MODELS.quality,
    schemaName: "draft",
    schema: draftSchema,
    effort: "low",
    actorId: null,
    instrumentId: i.id,
    instructions: [
      BRIEF[kind],
      lang === "hi" ? "Write it in formal Hindi (Devanagari), as used in Government of India correspondence; keep case numbers, IFSC and amounts as given." : "Write it in formal Indian government English.",
      "Use only the facts given; do not invent reference numbers, names or dates beyond them. Sign off with the sender's name and designation. Plain text, no markdown.",
    ].join(" "),
    input: JSON.stringify(facts),
  });
  return { ...data, callId };
}

/** A6 for the release file: the officer's remarks at their step, built from the checklist. */
export async function releaseRemarks(c: CaseDetail, step: "recommend" | "check" | "approve", checklist: { label: string; clause: string; met: boolean | null }[], actorId: string) {
  const { data } = await structured({
    feature: "A6.draft",
    model: MODELS.fast,
    schemaName: "release_remarks",
    schema: z.object({ remarks: z.string() }),
    effort: "low",
    actorId,
    instrumentId: c.i.id,
    instructions: [
      `Write the ${step === "recommend" ? "dealing officer's recommendation" : step === "check" ? "regional officer's check note" : "competent authority's decision remarks"} for releasing an AICTE security-deposit FDR.`,
      "2 to 3 sentences, formal Indian government English, citing the handbook clauses given. State which conditions are verified; if any is not met, say so plainly instead of recommending. Use only the facts given.",
    ].join(" "),
    input: JSON.stringify({ caseNo: c.i.caseNo, institution: c.inst.name, amount: formatPaise(c.i.amountPaise), issued: c.i.issueDate, matures: c.i.maturityDate, verification: c.i.verificationStatus, checklist }),
  });
  return data.remarks;
}
