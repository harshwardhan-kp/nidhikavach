import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { appendLedger } from "@/lib/ledger";
import { compare, FIELDS, type FieldKey } from "@/lib/rules/fields";
import { AA_RAIL, bank, SidecarError, type TermDeposit } from "@/lib/sidecar";
import { recomputeInstrument } from "./recompute";

type Actor = { id: string; primaryRole: string };

/** Bank answer -> our field values (as the bank states them). */
export function bankValues(td: TermDeposit): Record<FieldKey, string> {
  const s = td.summary;
  return {
    instrumentNo: td.linkedAccRef,
    amount: String(s.principalAmount),
    issueDate: s.openingDate,
    // A deposit closed early ends on its closing date, whatever the original maturity was.
    maturityDate: s.status === "CLOSED" && s.closedOn ? s.closedOn : s.maturityDate,
    ifsc: s.ifsc,
    depositorName: td.profile.holders.holder[0]?.name ?? "",
    lienHolder: s.lien.inFavourOf ?? "No lien marked",
    autoRenew: s.autoRenewal ? "Yes" : "No",
  };
}

async function applyBank(instrumentId: string, values: Record<FieldKey, string>, source: string) {
  for (const f of FIELDS) {
    await db
      .update(schema.instrumentFields)
      .set({ bankValue: values[f.key], bankSource: source, updatedAt: new Date() })
      .where(and(eq(schema.instrumentFields.instrumentId, instrumentId), eq(schema.instrumentFields.field, f.key)));
  }
}

function verdict(declared: Map<string, string | null>, values: Record<FieldKey, string>, status: string) {
  const critical = FIELDS.filter((f) => f.critical && f.key !== "lienHolder");
  const mismatch = critical.some((f) => {
    const d = declared.get(f.key);
    return d && compare(f.key, d, values[f.key]) === "mismatch";
  });
  return mismatch || status === "CLOSED" ? "mismatch" : "bank_confirmed";
}

/**
 * Asks the issuing bank to confirm an instrument, over the simulated rails:
 * NeSL for e-FDR / e-BG, Account Aggregator (consent -> FI fetch) for banks
 * live on the AA network, otherwise the bank-letter path (maker + checker).
 */
export async function requestBankConfirmation(instrumentId: string, actor: Actor) {
  const [i] = await db.select().from(schema.instruments).where(eq(schema.instruments.id, instrumentId));
  if (!i?.ifsc || !i.instrumentNo) throw new Error("FDR number and IFSC are needed before the bank can be asked");
  const declaredRows = await db.select().from(schema.instrumentFields).where(eq(schema.instrumentFields.instrumentId, instrumentId));
  const declared = new Map(declaredRows.map((r) => [r.field, r.declaredValue]));
  const bankCode = i.ifsc.slice(0, 4);
  const method = i.type === "efdr" || i.type === "ebg" ? "nesl" : AA_RAIL.has(bankCode) ? "account_aggregator" : "bank_letter";

  const [v] = await db
    .insert(schema.verifications)
    .values({ instrumentId, method, status: "running", request: { ifsc: i.ifsc, instrumentNo: i.instrumentNo, method }, requestedBy: actor.id })
    .returning({ id: schema.verifications.id });
  await db.update(schema.instruments).set({ verificationStatus: "pending_bank", recordStatus: i.recordStatus === "submitted" ? "under_scrutiny" : i.recordStatus }).where(eq(schema.instruments.id, instrumentId));
  await appendLedger({ actor, action: "bank.confirmation_requested", entity: "instrument", entityId: instrumentId, payload: { verificationId: v.id, method, ifsc: i.ifsc } });

  if (method === "bank_letter") {
    await db.update(schema.verifications).set({ response: { note: `${bankCode} is not on the Account Aggregator network: a confirmation letter from the branch is needed.` } }).where(eq(schema.verifications.id, v.id));
    await recomputeInstrument(instrumentId, actor, "bank letter requested");
    return { method, outcome: "letter_needed" as const };
  }

  let td: TermDeposit | undefined;
  let consentId: string | null = null;
  let notFound: string | null = null;
  try {
    if (method === "nesl") {
      const r = await bank.nesl(i.ifsc, i.instrumentNo);
      td = r.instrument;
      if (!r.found) notFound = r.message ?? "Not registered with NeSL";
    } else {
      const c = await bank.consent(i.ifsc, i.instrumentNo);
      consentId = c.consentId;
      const r = await bank.fetch(c.consentId);
      td = r.fi;
      if (!r.found) notFound = r.fipMessage ?? "No such deposit at the branch";
    }
  } catch (e) {
    const detail = e instanceof SidecarError ? e.detail : String(e);
    await db.update(schema.verifications).set({ status: "failed", response: { error: detail }, completedAt: new Date() }).where(eq(schema.verifications.id, v.id));
    await db.update(schema.instruments).set({ verificationStatus: "unavailable" }).where(eq(schema.instruments.id, instrumentId));
    await appendLedger({ actor, action: "bank.unavailable", entity: "instrument", entityId: instrumentId, payload: { verificationId: v.id, detail } });
    await recomputeInstrument(instrumentId, actor, "bank unavailable");
    return { method, outcome: "unavailable" as const };
  }

  if (notFound || !td) {
    await db.update(schema.verifications).set({ status: "done", result: "mismatch", consentId, response: { found: false, message: notFound }, completedAt: new Date() }).where(eq(schema.verifications.id, v.id));
    await db.update(schema.instruments).set({ verificationStatus: "mismatch" }).where(eq(schema.instruments.id, instrumentId));
    await appendLedger({ actor, action: "bank.no_record", entity: "instrument", entityId: instrumentId, payload: { verificationId: v.id, method, message: notFound } });
    await recomputeInstrument(instrumentId, actor, "bank has no record", [
      { kind: "bank_no_record", field: "instrumentNo", severity: "critical", title: "Bank has no record of this FDR", detail: `${notFound}. Branch ${i.ifsc}, FDR ${i.instrumentNo}.` },
    ]);
    return { method, outcome: "no_record" as const };
  }

  const values = bankValues(td);
  await applyBank(instrumentId, values, method);
  const result = verdict(declared, values, td.summary.status);
  await db
    .update(schema.verifications)
    .set({
      status: "done",
      result,
      consentId,
      response: { found: true, principalAmount: td.summary.principalAmount, openingDate: td.summary.openingDate, maturityDate: td.summary.maturityDate, status: td.summary.status, closedOn: td.summary.closedOn, lienMarkedTo: td.summary.lien.inFavourOf },
      completedAt: new Date(),
    })
    .where(eq(schema.verifications.id, v.id));
  await db.update(schema.instruments).set({ verificationStatus: result }).where(eq(schema.instruments.id, instrumentId));
  await appendLedger({ actor, action: "bank.answered", entity: "instrument", entityId: instrumentId, payload: { verificationId: v.id, method, result, bankStatus: td.summary.status } });

  const extra = td.summary.status === "CLOSED"
    ? [{ kind: "field_mismatch", field: "maturityDate", severity: "critical" as const, title: "Bank reports the FDR closed before maturity", detail: `Closed on ${td.summary.closedOn}; declared to mature on ${i.maturityDate}.` }]
    : [];
  const r = await recomputeInstrument(instrumentId, actor, "bank answered", extra);
  return { method, outcome: result, trust: r?.trust.score ?? null };
}

/** Bank-letter path, step 1 (maker): record what the letter says. Applied only after a checker confirms. */
export async function recordBankLetter(instrumentId: string, actor: Actor, letter: Record<FieldKey, string>, documentId: string) {
  // Fill the open "letter needed" request if there is one, so the case shows a single letter step.
  const open = await db
    .select({ id: schema.verifications.id, response: schema.verifications.response })
    .from(schema.verifications)
    .where(and(eq(schema.verifications.instrumentId, instrumentId), eq(schema.verifications.method, "bank_letter"), eq(schema.verifications.status, "running")));
  const waiting = open.find((o) => !(o.response as { letter?: unknown } | null)?.letter);
  const [v] = waiting
    ? await db
        .update(schema.verifications)
        .set({ request: { documentId }, response: { letter }, requestedBy: actor.id, requestedAt: new Date() })
        .where(eq(schema.verifications.id, waiting.id))
        .returning({ id: schema.verifications.id })
    : await db
        .insert(schema.verifications)
        .values({ instrumentId, method: "bank_letter", status: "running", request: { documentId }, response: { letter }, requestedBy: actor.id })
        .returning({ id: schema.verifications.id });
  await db.update(schema.instruments).set({ verificationStatus: "pending_bank" }).where(eq(schema.instruments.id, instrumentId));
  await appendLedger({ actor, action: "bank.letter_recorded", entity: "instrument", entityId: instrumentId, payload: { verificationId: v.id, documentId } });
  await recomputeInstrument(instrumentId, actor, "bank letter recorded");
  return v.id;
}

/** Bank-letter path, step 2 (checker, a different person): confirm and apply. */
export async function confirmBankLetter(verificationId: string, actor: Actor) {
  const [v] = await db.select().from(schema.verifications).where(eq(schema.verifications.id, verificationId));
  if (!v || v.method !== "bank_letter" || v.status !== "running") throw new Error("Nothing to confirm");
  if (v.requestedBy === actor.id) throw new Error("The officer who recorded the letter cannot also confirm it");
  const letter = (v.response as { letter?: Record<FieldKey, string> } | null)?.letter;
  if (!letter) throw new Error("No letter has been recorded yet");
  const declaredRows = await db.select().from(schema.instrumentFields).where(eq(schema.instrumentFields.instrumentId, v.instrumentId));
  const result = verdict(new Map(declaredRows.map((r) => [r.field, r.declaredValue])), letter, "ACTIVE");
  await applyBank(v.instrumentId, letter, "bank_letter");
  await db.update(schema.verifications).set({ status: "done", result, confirmedBy: actor.id, completedAt: new Date() }).where(eq(schema.verifications.id, verificationId));
  await db.update(schema.instruments).set({ verificationStatus: result }).where(eq(schema.instruments.id, v.instrumentId));
  await appendLedger({ actor, action: "bank.letter_confirmed", entity: "instrument", entityId: v.instrumentId, payload: { verificationId, result } });
  return recomputeInstrument(v.instrumentId, actor, "bank letter confirmed");
}
