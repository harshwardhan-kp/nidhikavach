import "server-only";
import { desc, sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type LedgerEntry = {
  actor: { id: string; primaryRole: string } | null;
  action: string; // e.g. "instrument.submitted", "release.approved"
  entity: string; // e.g. "instrument"
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

type Executor = Pick<typeof db, "execute">;

/** Appends one entry to the hash-chained ledger (inside the caller's transaction if given). */
export async function appendLedger(entry: LedgerEntry, tx: Executor = db) {
  const rows = await tx.execute<{ seq: string; hash: string }>(sql`
    select * from ledger_append(
      ${entry.actor?.id ?? null}::uuid,
      ${entry.actor?.primaryRole ?? "system"},
      ${entry.action},
      ${entry.entity},
      ${entry.entityId ?? null},
      ${JSON.stringify(entry.payload ?? {})}::jsonb
    )`);
  const row = rows[0];
  return { seq: Number(row.seq), hash: row.hash };
}

export async function verifyLedger() {
  const rows = await db.execute<{ checked: string; first_bad_seq: string | null; reason: string | null }>(
    sql`select * from ledger_verify()`,
  );
  const r = rows[0];
  return {
    checked: Number(r.checked),
    ok: r.first_bad_seq === null,
    firstBadSeq: r.first_bad_seq === null ? null : Number(r.first_bad_seq),
    reason: r.reason,
  };
}

export async function ledgerHead() {
  const [row] = await db
    .select({ seq: schema.auditLedger.seq, hash: schema.auditLedger.hash, ts: schema.auditLedger.ts })
    .from(schema.auditLedger)
    .orderBy(desc(schema.auditLedger.seq))
    .limit(1);
  return row ?? null;
}
