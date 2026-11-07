import "server-only";
import { and, desc, eq, inArray, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/clock";
import { appendLedger } from "@/lib/ledger";
import { FIELD_LABEL, FIELDS, type FieldKey, isAicteLien, matchField } from "@/lib/rules/fields";
import { addDays, renewalLane, validityLane } from "@/lib/rules/lanes";
import { nextAction } from "@/lib/rules/next-action";
import { computeTrust, type FieldInput } from "@/lib/rules/trust";

type Actor = { id: string; primaryRole: string } | null;

const CRITICAL = new Set<FieldKey>(FIELDS.filter((f) => f.critical).map((f) => f.key));

type AutoDiscrepancy = { kind: string; field: string | null; severity: "low" | "medium" | "high" | "critical"; title: string; detail: string };

/** The officer who should own a step for an instrument in a given region. */
async function ownerFor(role: string, regionId: number, institutionId: string) {
  if (role === "institution") {
    const [u] = await db.select({ id: schema.users.id }).from(schema.users).where(and(eq(schema.users.institutionId, institutionId), eq(schema.users.active, true))).limit(1);
    return u?.id ?? null;
  }
  const rows = await db
    .select({ id: schema.users.id, regionId: schema.users.regionId })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .where(and(eq(schema.userRoles.role, role as never), eq(schema.users.active, true)));
  return (rows.find((r) => r.regionId === regionId) ?? rows.find((r) => r.regionId === null))?.id ?? null;
}

/**
 * Re-derives everything that follows from the facts on an instrument:
 * field matches, trust score, validity/renewal lanes, auto-raised
 * discrepancies, next action and owner. Safe to call repeatedly.
 */
export async function recomputeInstrument(instrumentId: string, actor: Actor, reason: string, extra: AutoDiscrepancy[] = []) {
  const todayIso = await today();
  const [row] = await db
    .select({ i: schema.instruments, regionId: schema.institutions.regionId })
    .from(schema.instruments)
    .innerJoin(schema.institutions, eq(schema.institutions.id, schema.instruments.institutionId))
    .where(eq(schema.instruments.id, instrumentId));
  if (!row) return null;
  const i = row.i;

  const fields = await db.select().from(schema.instrumentFields).where(eq(schema.instrumentFields.instrumentId, instrumentId));
  const [doc] = await db
    .select({ tamperScore: schema.documents.tamperScore })
    .from(schema.documents)
    .where(and(eq(schema.documents.instrumentId, instrumentId), inArray(schema.documents.kind, ["fdr_scan", "renewal_scan"])))
    .orderBy(desc(schema.documents.uploadedAt))
    .limit(1);

  // 1. field matches + trust
  const inputs: Partial<Record<FieldKey, FieldInput>> = {};
  for (const f of fields) {
    const key = f.field as FieldKey;
    inputs[key] = { declared: f.declaredValue, scan: f.scanValue, bank: f.bankValue, scanConfidence: f.scanConfidence };
    const m = matchField(key, inputs[key]!);
    if (m !== f.match) {
      await db.update(schema.instrumentFields).set({ match: m, updatedAt: new Date() }).where(and(eq(schema.instrumentFields.instrumentId, instrumentId), eq(schema.instrumentFields.field, key)));
    }
  }
  const trust = computeTrust(inputs, { tamperScore: doc?.tamperScore ?? null });

  // 2. auto-raised discrepancies (one open per kind + field)
  const candidates: AutoDiscrepancy[] = [...extra];
  for (const f of fields) {
    const key = f.field as FieldKey;
    if (!CRITICAL.has(key)) continue;
    const m = matchField(key, inputs[key]!);
    if (m !== "mismatch") continue;
    if (f.bankValue) {
      candidates.push({ kind: "field_mismatch", field: key, severity: "critical", title: `Bank confirms a different ${FIELD_LABEL[key].toLowerCase()}`, detail: `Declared "${f.declaredValue ?? "—"}"; scan "${f.scanValue ?? "—"}"; bank "${f.bankValue}".` });
    } else if (f.scanValue && (f.scanConfidence ?? 1) >= 0.6) {
      candidates.push({ kind: "scan_mismatch", field: key, severity: "high", title: `Scan does not match the declared ${FIELD_LABEL[key].toLowerCase()}`, detail: `Declared "${f.declaredValue ?? "—"}"; the scan reads "${f.scanValue}".` });
    }
  }
  const lienValues = fields.filter((f) => f.field === "lienHolder").flatMap((f) => [f.scanValue, f.bankValue]).filter((v): v is string => !!v);
  if (lienValues.some((v) => !isAicteLien(v))) {
    candidates.push({ kind: "lien_missing", field: "lienHolder", severity: "high", title: "Lien is not marked in favour of AICTE", detail: `Recorded lien: "${lienValues.find((v) => !isAicteLien(v))}".` });
  }
  if ((doc?.tamperScore ?? 0) >= 50) {
    candidates.push({ kind: "tamper_flag", field: null, severity: "high", title: "Tamper scan flagged the document", detail: `Tamper score ${doc!.tamperScore}/100. See the highlighted region on the scan.` });
  }

  const open = await db
    .select({ kind: schema.discrepancies.kind, field: schema.discrepancies.field, status: schema.discrepancies.status })
    .from(schema.discrepancies)
    .where(and(eq(schema.discrepancies.instrumentId, instrumentId), notInArray(schema.discrepancies.status, ["closed", "dismissed"])));
  const has = new Set(open.map((o) => `${o.kind}|${o.field ?? ""}`));
  const raised: string[] = [];
  for (const c of candidates) {
    const k = `${c.kind}|${c.field ?? ""}`;
    if (has.has(k)) continue;
    has.add(k);
    const [d] = await db
      .insert(schema.discrepancies)
      .values({ instrumentId, kind: c.kind, field: c.field, severity: c.severity, title: c.title, detail: c.detail, autoRaised: true, raisedAt: new Date(), dueAt: new Date(Date.now() + 15 * 86_400_000) })
      .returning({ id: schema.discrepancies.id });
    raised.push(c.title);
    await appendLedger({ actor, action: "discrepancy.auto_raised", entity: "instrument", entityId: instrumentId, payload: { discrepancyId: d.id, kind: c.kind, field: c.field, severity: c.severity } });
  }
  const openCount = open.length + raised.length;

  // 3. lanes, next action, owner
  const lienKnown = lienValues.length ? lienValues.every(isAicteLien) : i.lienHolder ? isAicteLien(i.lienHolder) : null;
  const validity = ["renewed", "replaced"].includes(i.renewalStatus) ? i.validityStatus : validityLane({ maturityDate: i.maturityDate, today: todayIso, lienIsAicte: lienKnown });
  const renewal = renewalLane({ current: i.renewalStatus, release: i.releaseStatus, maturityDate: i.maturityDate, today: todayIso });
  const letters = await db
    .select({ response: schema.verifications.response })
    .from(schema.verifications)
    .where(and(eq(schema.verifications.instrumentId, instrumentId), eq(schema.verifications.method, "bank_letter"), eq(schema.verifications.status, "running")));
  const na = nextAction({
    recordStatus: i.recordStatus,
    verificationStatus: i.verificationStatus,
    validityStatus: validity,
    renewalStatus: renewal,
    releaseStatus: i.releaseStatus,
    maturityDate: i.maturityDate,
    openDiscrepancies: openCount,
    discrepanciesAwaitingCheck: open.filter((o) => o.status === "resolved_pending_check").length,
    letterAwaitingCheck: letters.some((l) => !!(l.response as { letter?: unknown } | null)?.letter),
    today: todayIso,
  });
  const owner = na ? await ownerFor(na.role, row.regionId, i.institutionId) : null;

  await db
    .update(schema.instruments)
    .set({
      trustScore: trust.score,
      riskBand: trust.band,
      trustBreakdown: trust,
      validityStatus: validity,
      renewalStatus: renewal,
      nextAction: na?.text ?? null,
      nextActionDue: na?.due ?? null,
      ownerUserId: owner,
      updatedAt: new Date(),
      rowVersion: i.rowVersion + 1,
    })
    .where(eq(schema.instruments.id, instrumentId));

  if (trust.score !== i.trustScore || trust.band !== i.riskBand) {
    await appendLedger({ actor, action: "instrument.rescored", entity: "instrument", entityId: instrumentId, payload: { reason, from: i.trustScore, to: trust.score, band: trust.band } });
  }

  // Tell the people who need to know about new problems.
  if (raised.length) {
    const recipients = [...new Set([owner, await ownerFor("maker", row.regionId, i.institutionId), await ownerFor("institution", row.regionId, i.institutionId)].filter((x): x is string => !!x))];
    await db.insert(schema.notifications).values(
      recipients.map((userId) => ({
        channel: "inbox" as const,
        userId,
        instrumentId,
        subject: `${i.caseNo}: ${raised.length} discrepanc${raised.length > 1 ? "ies" : "y"} raised`,
        body: raised.join(" · "),
        link: `/app/cases/${i.caseNo}`,
      })),
    );
  }

  return { trust, raised, nextAction: na, dueSoon: na?.due && na.due <= addDays(todayIso, 3) };
}
