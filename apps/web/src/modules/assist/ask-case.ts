import "server-only";
import { MODELS } from "@/lib/ai/models";
import { runWithTools, type ToolDef } from "@/lib/ai/client";
import type { TrustResult } from "@/lib/rules/trust";
import type { CaseDetail } from "@/modules/cases/queries";
import { checklist, currentRequest } from "@/modules/release/service";
import { retrieve } from "./rules";

const NONE = { type: "object", properties: {}, additionalProperties: false, required: [] };

/** Read-only tools, each bound to this one case. The model can see nothing else. */
function toolsFor(c: CaseDetail, today: string): ToolDef[] {
  const i = c.i;
  return [
    {
      name: "get_case",
      description: "Basics of this case: institution, FDR details, the five status lanes, trust score with its reasons, next action and owner.",
      parameters: NONE,
      run: async () => {
        const t = i.trustBreakdown as TrustResult | null;
        return {
          today,
          caseNo: i.caseNo,
          institution: c.inst.name,
          region: c.region.name,
          type: i.type,
          programme: i.programme,
          amountRupees: (i.amountPaise ?? 0) / 100,
          bank: i.bankName,
          branch: i.branch,
          ifsc: i.ifsc,
          fdrNo: i.instrumentNo,
          issued: i.issueDate,
          matures: i.maturityDate,
          lien: i.lienHolder,
          autoRenew: i.autoRenew,
          lanes: { record: i.recordStatus, verification: i.verificationStatus, validity: i.validityStatus, renewal: i.renewalStatus, release: i.releaseStatus },
          trust: t ? { score: t.score, band: t.band, capped: t.capped, penalties: t.penalties, weakFields: t.lines.filter((l) => l.points < l.max) } : null,
          nextAction: i.nextAction,
          nextActionDue: i.nextActionDue,
          owner: c.owner?.name ?? null,
          renewalChain: c.chain.map((l) => ({ caseNo: l.case_no, issued: l.issue_date, matures: l.maturity_date, renewal: l.renewal_status, release: l.release_status })),
        };
      },
    },
    {
      name: "get_fields",
      description: "The three-source check: for each field, what the institution declared, what the scan reads (with confidence and reader disagreement notes) and what the bank confirmed, and whether they match.",
      parameters: NONE,
      run: async () => c.fields.map((f) => ({ field: f.field, declared: f.declaredValue, scan: f.scanValue, scanConfidence: f.scanConfidence, bank: f.bankValue, bankSource: f.bankSource, match: f.match, note: f.note })),
    },
    {
      name: "get_discrepancies",
      description: "Every discrepancy on this case with severity, status, due date and its message thread.",
      parameters: NONE,
      run: async () =>
        c.discrepancies.map((d) => ({
          title: d.title,
          detail: d.detail,
          severity: d.severity,
          status: d.status,
          raised: d.raisedAt,
          due: d.dueAt,
          resolution: d.resolution,
          thread: c.observations.filter(({ o }) => o.discrepancyId === d.id).map(({ o, author }) => ({ by: author, at: o.createdAt, text: o.body })),
        })),
    },
    {
      name: "get_documents",
      description: "Documents on file: kind, upload time, SHA-256, tamper score and the scan readers' summary.",
      parameters: NONE,
      run: async () =>
        c.documents.map((d) => {
          const ex = d.extraction as { llm?: { notes?: string; wordsMatchFigures?: boolean; amountInWords?: string } } | null;
          const tf = d.tamperFindings as { heuristic?: { detail: string; weight: number }[]; opinion?: { verdict: string; summary: string } | null } | null;
          return { kind: d.kind, uploaded: d.uploadedAt, sha256: d.sha256, tamperScore: d.tamperScore, tamperFindings: tf?.heuristic?.filter((h) => h.weight > 0).map((h) => h.detail) ?? [], tamperOpinion: tf?.opinion ?? null, readerNotes: ex?.llm ?? null, synthetic: d.synthetic };
        }),
    },
    {
      name: "get_verifications",
      description: "Bank confirmations requested for this case: method (Account Aggregator, NeSL, bank letter), result and what the bank said.",
      parameters: NONE,
      run: async () => c.verifications.map(({ v, requestedBy }) => ({ method: v.method, status: v.status, result: v.result, requestedBy, requestedAt: v.requestedAt, completedAt: v.completedAt, response: v.response })),
    },
    {
      name: "get_ledger",
      description: "The audit-ledger entries for this case, newest first (who did what, when).",
      parameters: NONE,
      run: async () => c.ledger.map(({ e, actor }) => ({ seq: e.seq, at: e.ts, action: e.action, by: actor ?? e.actorRole, payload: e.payload })),
    },
    {
      name: "get_release",
      description: "The release / refund request on this case, if any, and the clause 6.46 checklist evaluated now.",
      parameters: NONE,
      run: async () => {
        const req = await currentRequest(i.id);
        return { request: req ? { kind: req.kind, state: req.state, reason: req.reason, orderNo: req.orderNo, requestedAt: req.requestedAt } : null, checklist: await checklist(i, req) };
      },
    },
    {
      name: "search_handbook",
      description: "Search our clause-referenced notes on the AICTE Approval Process Handbook 2024-27 security-deposit rules.",
      parameters: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false, required: ["query"] },
      run: async (a) => (await retrieve(String(a.query ?? ""), 5)).map(({ id, clause, title, body }) => ({ id, clause, title, body })),
    },
  ];
}

/** A5: answers questions about one case by calling read-only tools; cites what it used. */
export async function askCase(c: CaseDetail, today: string, messages: { role: "user" | "assistant"; content: string }[], actorId: string) {
  return runWithTools({
    feature: "A5.ask",
    model: MODELS.quality,
    actorId,
    instrumentId: c.i.id,
    messages,
    tools: toolsFor(c, today),
    instructions: [
      `You help an AICTE officer understand security-deposit case ${c.i.caseNo}. Call the tools to look things up; never guess facts that a tool could tell you.`,
      "Answer in at most 5 short sentences or bullets. Quote dates, amounts (Indian format) and ledger entry numbers (#seq) when they support the answer. Name handbook clauses when you rely on them.",
      "You can only read. If asked to change something, say which button or officer does it. AI advises; officers decide.",
    ].join(" "),
  });
}
