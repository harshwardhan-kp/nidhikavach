import "server-only";
import { and, asc, count, eq, type SQL, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { instrumentScope } from "@/modules/cases/scope";

const { instruments: I, institutions: Inst, users: U } = schema;

export const QUEUE_TABS = ["read", "bank", "letters", "mismatch", "close"] as const;
export type QueueTab = (typeof QUEUE_TABS)[number];

export const TAB_META: Record<QueueTab, { label: string; who: string; hint: string }> = {
  read: { label: "scans to read", who: "maker", hint: "Submitted FDRs whose scan has not been read by Doc-AI and the model yet." },
  bank: { label: "awaiting bank", who: "maker", hint: "Under scrutiny, not yet confirmed by the issuing bank." },
  letters: { label: "letters to confirm", who: "checker", hint: "Bank letters recorded by a dealing officer; a different officer must confirm each." },
  mismatch: { label: "mismatches", who: "maker", hint: "The bank disagrees with the declaration, or a serious discrepancy is open." },
  close: { label: "discrepancies to close", who: "checker", hint: "Resolved by a dealing officer; a checker must close them." },
};

const inScrutiny = sql`${I.recordStatus} in ('submitted','under_scrutiny')`;
const letterWaiting = sql`exists (select 1 from verifications v where v.instrument_id = ${I.id} and v.method = 'bank_letter' and v.status = 'running' and v.response ? 'letter')`;

const CONDITION: Record<QueueTab, SQL> = {
  read: sql`${inScrutiny} and exists (select 1 from documents d where d.instrument_id = ${I.id} and d.kind in ('fdr_scan','renewal_scan') and (d.extraction_status <> 'done' or d.extraction -> 'fields' is null))`,
  bank: sql`${inScrutiny} and ${I.verificationStatus} in ('unverified','pending_bank','unavailable') and not ${letterWaiting}`,
  letters: letterWaiting,
  mismatch: sql`${I.recordStatus} <> 'rejected' and ${I.renewalStatus} not in ('renewed','replaced') and ${I.releaseStatus} not in ('released','refunded') and (${I.verificationStatus} = 'mismatch' or exists (select 1 from discrepancies x where x.instrument_id = ${I.id} and x.status in ('open','awaiting_institution') and x.severity in ('critical','high')))`,
  close: sql`exists (select 1 from discrepancies x where x.instrument_id = ${I.id} and x.status = 'resolved_pending_check')`,
};

function where(user: SessionUser, tab: QueueTab) {
  return and(instrumentScope(user), CONDITION[tab]);
}

export async function queueCounts(user: SessionUser) {
  const counts = await Promise.all(
    QUEUE_TABS.map((t) =>
      db
        .select({ n: count() })
        .from(I)
        .innerJoin(Inst, eq(Inst.id, I.institutionId))
        .where(where(user, t))
        .then(([r]) => [t, r.n] as const),
    ),
  );
  return Object.fromEntries(counts) as Record<QueueTab, number>;
}

export async function queueRows(user: SessionUser, tab: QueueTab, limit = 60) {
  return db
    .select({
      caseNo: I.caseNo,
      institution: Inst.name,
      city: Inst.city,
      bank: I.bankName,
      ifsc: I.ifsc,
      amountPaise: I.amountPaise,
      trustScore: I.trustScore,
      riskBand: I.riskBand,
      record: I.recordStatus,
      verification: I.verificationStatus,
      submittedAt: I.submittedAt,
      nextAction: I.nextAction,
      nextActionDue: I.nextActionDue,
      owner: U.name,
    })
    .from(I)
    .innerJoin(Inst, eq(Inst.id, I.institutionId))
    .leftJoin(U, eq(U.id, I.ownerUserId))
    .where(where(user, tab))
    .orderBy(sql`${I.nextActionDue} asc nulls last`, asc(I.submittedAt), asc(I.caseNo))
    .limit(limit);
}
