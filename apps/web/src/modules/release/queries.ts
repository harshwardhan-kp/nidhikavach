import "server-only";
import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { instrumentScope } from "@/modules/cases/scope";

const { releaseRequests: R, instruments: I, institutions: Inst } = schema;

export const RELEASE_TABS = ["requested", "recommended", "checked", "approved", "closed"] as const;
export type ReleaseTab = (typeof RELEASE_TABS)[number];
export const RELEASE_TAB_META: Record<ReleaseTab, { label: string; who: string }> = {
  requested: { label: "to recommend", who: "maker" },
  recommended: { label: "to check", who: "checker" },
  checked: { label: "to decide", who: "authority" },
  approved: { label: "awaiting bank", who: "maker" },
  closed: { label: "released / rejected", who: "done" },
};

const cond = (t: ReleaseTab): SQL => (t === "closed" ? sql`${R.state} in ('released','refunded','rejected')` : eq(R.state, t));

export async function releaseCounts(user: SessionUser) {
  const rows = await Promise.all(
    RELEASE_TABS.map((t) =>
      db
        .select({ n: count() })
        .from(R)
        .innerJoin(I, eq(I.id, R.instrumentId))
        .innerJoin(Inst, eq(Inst.id, I.institutionId))
        .where(and(instrumentScope(user), cond(t)))
        .then(([r]) => [t, r.n] as const),
    ),
  );
  return Object.fromEntries(rows) as Record<ReleaseTab, number>;
}

export function releaseList(user: SessionUser, t: ReleaseTab) {
  return db
    .select({ r: R, caseNo: I.caseNo, institution: Inst.name, city: Inst.city, amountPaise: I.amountPaise, bank: I.bankName, issueDate: I.issueDate, nextAction: I.nextAction, nextActionDue: I.nextActionDue })
    .from(R)
    .innerJoin(I, eq(I.id, R.instrumentId))
    .innerJoin(Inst, eq(Inst.id, I.institutionId))
    .where(and(instrumentScope(user), cond(t)))
    .orderBy(t === "closed" ? desc(R.requestedAt) : asc(R.requestedAt))
    .limit(80);
}
