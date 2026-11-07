"use server";

import { requirePermission } from "@/lib/auth/session";
import { appendLedger, verifyLedger } from "@/lib/ledger";

export type VerifyState = { ok: boolean; checked: number; firstBadSeq: number | null; reason: string | null; at: string } | undefined;

export async function verifyChain(): Promise<VerifyState> {
  const user = await requirePermission("ledger.verify");
  const result = await verifyLedger();
  await appendLedger({ actor: user, action: "ledger.verified", entity: "ledger", payload: { ok: result.ok, checked: result.checked } });
  return { ...result, at: new Date().toISOString() };
}

export type TamperDemo =
  | { seq: number; action: string; field: string; before: string; after: string; storedHash: string; recomputed: string; later: number; dbRefused: string | null }
  | undefined;

/**
 * Pitch demo: try to change one past entry. The database refuses the write
 * (append-only trigger); and even an editor with raw disk access would be
 * caught, because the recomputed hash no longer matches and every later
 * entry's prev_hash points at the original.
 */
export async function simulateTamper(): Promise<TamperDemo> {
  const user = await requirePermission("ledger.verify");
  const { db } = await import("@/db");
  const { sql } = await import("drizzle-orm");
  const [e] = await db.execute<{ seq: string; action: string; payload: Record<string, unknown>; hash: string; prev_hash: string; ts: Date; actor_id: string | null; actor_role: string; entity: string; entity_id: string | null }>(
    sql`select * from audit_ledger where payload ? 'amountPaise' or action like 'bank.%' order by seq desc limit 1`,
  );
  if (!e) return undefined;
  const field = "amountPaise" in e.payload ? "amountPaise" : "verificationId" in e.payload ? "verificationId" : Object.keys(e.payload)[0] ?? "note";
  const before = String(e.payload[field] ?? "");
  const after = field === "amountPaise" ? String(Number(before) * 10) : `${before}-edited`;
  const forged = { ...e.payload, [field]: field === "amountPaise" ? Number(after) : after };
  const [{ h }] = await db.execute<{ h: string }>(
    sql`select ledger_entry_hash(${e.prev_hash}, ${e.ts}::timestamptz, ${e.actor_id}::uuid, ${e.actor_role}, ${e.action}, ${e.entity}, ${e.entity_id}, ${JSON.stringify(forged)}::jsonb) as h`,
  );
  let dbRefused: string | null = null;
  try {
    await db.execute(sql`update audit_ledger set payload = ${JSON.stringify(forged)}::jsonb where seq = ${e.seq}`);
  } catch (err) {
    dbRefused = (err as { cause?: { message?: string }; message?: string }).cause?.message ?? (err instanceof Error ? err.message : "refused");
  }
  const [{ later }] = await db.execute<{ later: number }>(sql`select count(*)::int as later from audit_ledger where seq > ${e.seq}`);
  await appendLedger({ actor: user, action: "ledger.tamper_demo", entity: "ledger", payload: { seq: Number(e.seq), refused: !!dbRefused } });
  return { seq: Number(e.seq), action: e.action, field, before, after, storedHash: e.hash, recomputed: h, later, dbRefused };
}
