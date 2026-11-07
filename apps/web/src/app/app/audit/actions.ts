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
