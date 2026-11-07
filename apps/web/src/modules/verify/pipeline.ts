import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { appendLedger } from "@/lib/ledger";
import { FIELDS } from "@/lib/rules/fields";
import { signedGetUrl, tamperScan, type TamperFinding } from "@/lib/sidecar";
import { analyzeLayout, fieldsFromDi } from "./di";
import { reconcile } from "./reconcile";
import { recomputeInstrument } from "./recompute";
import { tamperOpinion, visionRead, type TamperOpinion } from "./vision";

/** null = the system, e.g. the automatic read right after a submission. */
type Actor = { id: string; primaryRole: string } | null;

/**
 * Reads and inspects the latest scan of an instrument: Document Intelligence
 * and gpt-6.1-terra read it in parallel with the heuristic tamper scan; the
 * model then gives a second opinion on tampering. Results feed the
 * three-source table and the trust score.
 */
export async function readScan(instrumentId: string, actor: Actor) {
  try {
    return await readScanInner(instrumentId, actor);
  } catch (e) {
    // Never leave a scan stuck as "running".
    await db
      .update(schema.documents)
      .set({ extractionStatus: "failed", tamperStatus: "failed" })
      .where(and(eq(schema.documents.instrumentId, instrumentId), eq(schema.documents.extractionStatus, "running")));
    throw e;
  }
}

async function readScanInner(instrumentId: string, actor: Actor) {
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
  const ctx = { actorId: actor?.id ?? null, instrumentId, docSha: doc.sha256 };
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

  const current = await db.select().from(schema.instrumentFields).where(eq(schema.instrumentFields.instrumentId, instrumentId));
  const refs = Object.fromEntries(current.map((r) => [r.field, [r.declaredValue, r.bankValue]]));
  const fields = reconcile(di, llm, refs);
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
      // Stays "running" until the case is rescored below, so the page keeps refreshing until then.
      extractionStatus: readersOk ? "running" : "failed",
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
  if (readersOk) await db.update(schema.documents).set({ extractionStatus: "done" }).where(eq(schema.documents.id, doc.id));
  return { agreed, tamperScore, fields, result, readers: { di: diRes.status, llm: llmRes.status, tamper: tamperRes.status } };
}
