import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { appendLedger } from "@/lib/ledger";
import { compare, FIELDS, type FieldKey } from "@/lib/rules/fields";
import { signedGetUrl, tamperScan, type TamperFinding } from "@/lib/sidecar";
import { analyzeLayout, fieldsFromDi, type Reading } from "./di";
import { recomputeInstrument } from "./recompute";
import { tamperOpinion, visionRead, type TamperOpinion, type VisionRead } from "./vision";

type Actor = { id: string; primaryRole: string };

export type Reconciled = { value: string | null; confidence: number; source: "di+llm" | "di" | "llm" | null; agree: boolean | null; di: string | null; llm: string | null };

/** A1: two independent readers; agreement raises confidence, disagreement flags the field. */
export function reconcile(di: Partial<Record<FieldKey, Reading>>, llm: VisionRead | null): Record<FieldKey, Reconciled> {
  const out = {} as Record<FieldKey, Reconciled>;
  for (const f of FIELDS) {
    const a = di[f.key];
    const b = llm?.fields[f.key];
    const av = a?.value?.trim() || null;
    const bv = b?.value?.trim() || null;
    if (av && bv) {
      const c = compare(f.key, av, bv);
      if (c !== "mismatch") {
        out[f.key] = { value: av, confidence: Math.min(0.99, Math.max(a!.confidence, b!.confidence) + 0.05), source: "di+llm", agree: true, di: av, llm: bv };
      } else {
        const pick = (b!.confidence ?? 0) > (a!.confidence ?? 0) ? bv : av;
        out[f.key] = { value: pick, confidence: 0.4, source: pick === av ? "di" : "llm", agree: false, di: av, llm: bv };
      }
    } else if (av || bv) {
      out[f.key] = { value: av ?? bv, confidence: Math.round((av ? a!.confidence : b!.confidence) * 0.8 * 100) / 100, source: av ? "di" : "llm", agree: null, di: av, llm: bv };
    } else {
      out[f.key] = { value: null, confidence: 0, source: null, agree: null, di: null, llm: null };
    }
  }
  return out;
}

/**
 * Reads and inspects the latest scan of an instrument: Document Intelligence
 * and gpt-6.1-terra read it in parallel with the heuristic tamper scan; the
 * model then gives a second opinion on tampering. Results feed the
 * three-source table and the trust score.
 */
export async function readScan(instrumentId: string, actor: Actor) {
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.instrumentId, instrumentId), inArray(schema.documents.kind, ["fdr_scan", "renewal_scan"])))
    .orderBy(desc(schema.documents.uploadedAt))
    .limit(1);
  if (!doc) throw new Error("No scan uploaded for this instrument");

  // Synthetic seed scans are rendered on first use.
  if (doc.synthetic && doc.specimen && !doc.sha256) {
    const { renderSpecimen } = await import("@/lib/sidecar");
    const meta = await renderSpecimen(doc.fileKey, doc.specimen);
    await db.update(schema.documents).set({ sha256: meta.sha256, sizeBytes: meta.size }).where(eq(schema.documents.id, doc.id));
    doc.sha256 = meta.sha256;
  }

  await db.update(schema.documents).set({ extractionStatus: "running", tamperStatus: "running" }).where(eq(schema.documents.id, doc.id));
  const url = signedGetUrl(doc.fileKey, doc.filename, 600);
  const ctx = { actorId: actor.id, instrumentId, docSha: doc.sha256 };
  const t0 = Date.now();

  // Three lanes in parallel: Doc-AI, the model's reading, and (heuristic scan -> model's tamper opinion).
  const tamperChain = tamperScan(doc.fileKey).then(async (h) => {
    const opinion = await tamperOpinion(url, doc.mime, h.findings, ctx).then((r) => r.data).catch(() => null);
    return { h, opinion };
  });
  const [diRes, llmRes, tamperRes] = await Promise.allSettled([analyzeLayout(url), visionRead(url, doc.mime, ctx), tamperChain]);
  const di = diRes.status === "fulfilled" ? fieldsFromDi(diRes.value) : {};
  const llm = llmRes.status === "fulfilled" ? llmRes.value.data : null;
  const heuristic = tamperRes.status === "fulfilled" ? tamperRes.value.h : { score: 0, findings: [] as TamperFinding[], heatmapKey: null, mime: doc.mime };
  const opinion: TamperOpinion | null = tamperRes.status === "fulfilled" ? tamperRes.value.opinion : null;

  const fields = reconcile(di, llm);
  const readersOk = diRes.status === "fulfilled" || llmRes.status === "fulfilled";
  // Combined tamper score: the measured signal leads; the model can raise or temper it a little.
  const tamperScore = Math.round(opinion ? Math.max(heuristic.score * 0.7 + opinion.score * 0.3, opinion.verdict === "likely_altered" ? 50 : 0) : heuristic.score);

  for (const f of FIELDS) {
    const r = fields[f.key];
    await db
      .update(schema.instrumentFields)
      .set({ scanValue: r.value, scanConfidence: r.value ? r.confidence : null, scanSource: r.source, note: r.agree === false ? `Readers disagree: Doc-AI "${r.di}" vs model "${r.llm}"` : null, updatedAt: new Date() })
      .where(and(eq(schema.instrumentFields.instrumentId, instrumentId), eq(schema.instrumentFields.field, f.key)));
  }

  await db
    .update(schema.documents)
    .set({
      extractionStatus: readersOk ? "done" : "failed",
      extraction: {
        fields,
        di: diRes.status === "fulfilled" ? { keyValuePairs: diRes.value.keyValuePairs?.length ?? 0, pages: diRes.value.pages?.length ?? 0 } : { error: String((diRes as PromiseRejectedResult).reason).slice(0, 200) },
        llm: llm ? { amountInWords: llm.amountInWords, wordsMatchFigures: llm.wordsMatchFigures, bankName: llm.bankName, stampPresent: llm.stampPresent, signaturePresent: llm.signaturePresent, notes: llm.notes, isFixedDepositReceipt: llm.isFixedDepositReceipt } : { error: llmRes.status === "rejected" ? String(llmRes.reason).slice(0, 200) : null },
        ms: Date.now() - t0,
      },
      tamperStatus: tamperRes.status === "fulfilled" ? "done" : "failed",
      tamperScore,
      tamperFindings: { heuristic: heuristic.findings, heatmapKey: heuristic.heatmapKey, opinion },
    })
    .where(eq(schema.documents.id, doc.id));

  const agreed = FIELDS.filter((f) => fields[f.key].agree).length;
  await appendLedger({
    actor,
    action: "doc_ai.read",
    entity: "instrument",
    entityId: instrumentId,
    payload: { documentId: doc.id, sha256: doc.sha256, readers: { di: diRes.status, llm: llmRes.status }, fieldsAgreed: agreed, ms: Date.now() - t0 },
  });
  await appendLedger({ actor, action: "tamper.scanned", entity: "instrument", entityId: instrumentId, payload: { documentId: doc.id, heuristic: heuristic.score, ai: opinion?.score ?? null, combined: tamperScore } });

  // A scan the model says is not an FDR, or whose words disagree with its figures, is worth a human look.
  const extra = [];
  if (llm && llm.wordsMatchFigures === false) {
    extra.push({ kind: "amount_words", field: "amount", severity: "high" as const, title: "Amount in words does not match the figures", detail: `The scan says "${llm.amountInWords}" in words.` });
  }
  if (llm && !llm.isFixedDepositReceipt) {
    extra.push({ kind: "not_an_fdr", field: null, severity: "high" as const, title: "Uploaded document does not look like an FDR", detail: llm.notes });
  }

  // Reading the scan starts scrutiny.
  await db.update(schema.instruments).set({ recordStatus: "under_scrutiny" }).where(and(eq(schema.instruments.id, instrumentId), eq(schema.instruments.recordStatus, "submitted")));
  const result = await recomputeInstrument(instrumentId, actor, "scan read", extra);
  return { agreed, tamperScore, fields, result, readers: { di: diRes.status, llm: llmRes.status, tamper: tamperRes.status } };
}
