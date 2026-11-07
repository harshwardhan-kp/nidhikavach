import "server-only";
import { and, asc, count, desc, eq, inArray, isNotNull, notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { today } from "@/lib/clock";
import { evaluateRelease, type ReleaseKind } from "@/lib/rules/release";

export type Attested = { cell_clearances?: boolean; no_dues_or_penalty?: boolean };
export type StoredConditions = { attested?: Attested; documentIds?: string[] };

/** The live (or most recent) release request on an instrument. */
export async function currentRequest(instrumentId: string) {
  const [r] = await db.select().from(schema.releaseRequests).where(eq(schema.releaseRequests.instrumentId, instrumentId)).orderBy(desc(schema.releaseRequests.requestedAt)).limit(1);
  return r ?? null;
}

export async function approvalsOf(requestId: string) {
  return db
    .select({ a: schema.approvals, name: schema.users.name, designation: schema.users.designation })
    .from(schema.approvals)
    .innerJoin(schema.users, eq(schema.users.id, schema.approvals.actorId))
    .where(eq(schema.approvals.releaseRequestId, requestId))
    .orderBy(asc(schema.approvals.createdAt));
}

/** Evaluates the checklist for a request from the current record. */
export async function checklist(i: typeof schema.instruments.$inferSelect, req: typeof schema.releaseRequests.$inferSelect | null, kind?: ReleaseKind) {
  const stored = (req?.conditions ?? {}) as StoredConditions;
  const [[disc], docs] = await Promise.all([
    db
      .select({ n: count() })
      .from(schema.discrepancies)
      .where(and(eq(schema.discrepancies.instrumentId, i.id), notInArray(schema.discrepancies.status, ["closed", "dismissed"]))),
    stored.documentIds?.length
      ? db.select({ id: schema.documents.id }).from(schema.documents).where(and(inArray(schema.documents.id, stored.documentIds), isNotNull(schema.documents.sha256)))
      : Promise.resolve([]),
  ]);
  return evaluateRelease({
    kind: kind ?? ((req?.kind === "refund" ? "refund" : "release") as ReleaseKind),
    issueDate: i.issueDate,
    today: await today(),
    verificationStatus: i.verificationStatus,
    openDiscrepancies: disc.n,
    documentsAttached: docs.length,
    attested: stored.attested,
  });
}
