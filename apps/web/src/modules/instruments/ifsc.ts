import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";

export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;

export type Branch = { ifsc: string; bank: string; branch: string; city: string | null; state: string | null; address: string | null };

/** Looks up a branch: local cache first, then Razorpay's public IFSC API (cached on success). */
export async function findBranch(raw: string): Promise<Branch | null> {
  const ifsc = raw.trim().toUpperCase();
  if (!IFSC_RE.test(ifsc)) return null;
  const [hit] = await db.select().from(schema.ifscBranches).where(eq(schema.ifscBranches.ifsc, ifsc)).limit(1);
  if (hit) return hit;
  try {
    const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`, { headers: { "user-agent": "nidhikavach/0.1" }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const j = await res.json();
    const row = { ifsc, bank: j.BANK, bankCode: j.BANKCODE ?? ifsc.slice(0, 4), branch: j.BRANCH, city: j.CITY, district: j.DISTRICT, state: j.STATE, address: j.ADDRESS };
    await db.insert(schema.ifscBranches).values(row).onConflictDoNothing();
    return row;
  } catch {
    return null;
  }
}
