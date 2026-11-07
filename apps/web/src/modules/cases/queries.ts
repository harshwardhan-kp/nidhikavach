import "server-only";
import { and, asc, count, desc, eq, ilike, inArray, notInArray, or, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { LANE_VALUES } from "./labels";
import { instrumentScope } from "./scope";

const { instruments: I, institutions: Inst, regions: R, users: U } = schema;

export const PAGE_SIZE = 40;

const lane = <T extends readonly string[]>(values: T) => z.enum(values as unknown as [string, ...string[]]).optional().catch(undefined);

export const caseFilterSchema = z.object({
  q: z.string().trim().max(80).optional().catch(undefined),
  view: z.enum(["action", "open", "all", "mine"]).optional().catch(undefined),
  risk: z.enum(["red", "amber", "green", "unscored"]).optional().catch(undefined),
  record: lane(LANE_VALUES.record),
  verification: lane(LANE_VALUES.verification),
  validity: lane(LANE_VALUES.validity),
  renewal: lane(LANE_VALUES.renewal),
  release: lane(LANE_VALUES.release),
  region: z.coerce.number().int().positive().optional().catch(undefined),
  sort: z.enum(["risk", "maturity", "amount", "recent"]).optional().catch(undefined),
  /** Matures within this many days from today (demo clock). */
  within: z.coerce.number().int().min(1).max(3650).optional().catch(undefined),
  /** Matured at least this many days ago. */
  maturedAgo: z.coerce.number().int().min(0).max(3650).optional().catch(undefined),
  /** Amount at least this many lakh rupees. */
  minLakh: z.coerce.number().min(0).max(100000).optional().catch(undefined),
  /** Plain-language question that produced these filters (A3), shown back to the user. */
  ask: z.string().trim().max(200).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).optional().catch(undefined),
});
export type CaseFilters = z.infer<typeof caseFilterSchema>;

/** Closed links in a chain: renewed/replaced or paid back. Hidden unless asked for. */
const closed = or(inArray(I.renewalStatus, ["renewed", "replaced"]), inArray(I.releaseStatus, ["released", "refunded"]))!;

const riskOrder = sql`case ${I.riskBand} when 'red' then 0 when 'amber' then 1 when 'unscored' then 2 else 3 end`;

function conditions(user: SessionUser, f: CaseFilters, today?: string): SQL[] {
  const c: SQL[] = [];
  const scope = instrumentScope(user);
  if (scope) c.push(scope);
  const view = f.view ?? "open";
  if (view !== "all") c.push(sql`not (${closed})`);
  if (view === "action") c.push(sql`${I.nextAction} is not null`);
  if (view === "mine") c.push(eq(I.ownerUserId, user.id));
  if (f.q) {
    const like = `%${f.q.replace(/[%_]/g, "")}%`;
    c.push(or(ilike(I.caseNo, like), ilike(I.instrumentNo, like), ilike(Inst.name, like), ilike(Inst.aicteId, like))!);
  }
  if (f.risk) c.push(eq(I.riskBand, f.risk));
  if (f.record) c.push(eq(I.recordStatus, f.record as never));
  if (f.verification) c.push(eq(I.verificationStatus, f.verification as never));
  if (f.validity) c.push(eq(I.validityStatus, f.validity as never));
  if (f.renewal) c.push(eq(I.renewalStatus, f.renewal as never));
  if (f.release) c.push(eq(I.releaseStatus, f.release as never));
  if (f.region) c.push(eq(Inst.regionId, f.region));
  const t = today ?? new Date().toISOString().slice(0, 10);
  if (f.within) c.push(sql`${I.maturityDate} between ${t}::date and ${t}::date + ${f.within}::int`);
  if (f.maturedAgo != null) c.push(sql`${I.maturityDate} <= ${t}::date - ${f.maturedAgo}::int`);
  if (f.minLakh) c.push(sql`${I.amountPaise} >= ${Math.round(f.minLakh * 1e7)}`);
  return c;
}

export async function listCases(user: SessionUser, f: CaseFilters, today?: string) {
  const where = and(...conditions(user, f, today));
  const page = f.page ?? 1;
  const order =
    f.sort === "maturity"
      ? [sql`${I.maturityDate} asc nulls last`]
      : f.sort === "amount"
        ? [desc(I.amountPaise)]
        : f.sort === "recent"
          ? [sql`${I.submittedAt} desc nulls last`]
          : [riskOrder, sql`${I.trustScore} asc nulls first`, sql`${I.nextActionDue} asc nulls last`];

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: I.id,
        caseNo: I.caseNo,
        type: I.type,
        programme: I.programme,
        institution: Inst.name,
        city: Inst.city,
        region: R.code,
        bank: I.bankName,
        ifsc: I.ifsc,
        amountPaise: I.amountPaise,
        maturityDate: I.maturityDate,
        trustScore: I.trustScore,
        riskBand: I.riskBand,
        record: I.recordStatus,
        verification: I.verificationStatus,
        validity: I.validityStatus,
        renewal: I.renewalStatus,
        release: I.releaseStatus,
        nextAction: I.nextAction,
        nextActionDue: I.nextActionDue,
        owner: U.name,
      })
      .from(I)
      .innerJoin(Inst, eq(Inst.id, I.institutionId))
      .innerJoin(R, eq(R.id, Inst.regionId))
      .leftJoin(U, eq(U.id, I.ownerUserId))
      .where(where)
      .orderBy(...order, asc(I.caseNo))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE),
    db.select({ total: count() }).from(I).innerJoin(Inst, eq(Inst.id, I.institutionId)).where(where),
  ]);
  return { rows, total, page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

export type CaseRow = Awaited<ReturnType<typeof listCases>>["rows"][number];

/** Headline numbers for the overview, within the user's scope. */
export async function overviewStats(user: SessionUser, today: string) {
  const scope = instrumentScope(user);
  const live = and(scope, sql`not (${closed})`);
  const in90 = sql`(${I.maturityDate} between ${today}::date and ${today}::date + 90)`;
  const [[s]] = await Promise.all([
    db
      .select({
        active: count(),
        amount: sql<number>`coalesce(sum(${I.amountPaise}), 0)::bigint`.mapWith(Number),
        expiring: sql<number>`count(*) filter (where ${in90})`.mapWith(Number),
        renewalDue: sql<number>`count(*) filter (where ${I.renewalStatus} in ('due','overdue'))`.mapWith(Number),
        overdue: sql<number>`count(*) filter (where ${I.renewalStatus} = 'overdue')`.mapWith(Number),
        pendingVerification: sql<number>`count(*) filter (where ${I.verificationStatus} in ('unverified','pending_bank'))`.mapWith(Number),
        red: sql<number>`count(*) filter (where ${I.riskBand} = 'red')`.mapWith(Number),
        releases: sql<number>`count(*) filter (where ${I.releaseStatus} in ('requested','recommended','checked'))`.mapWith(Number),
      })
      .from(I)
      .innerJoin(Inst, eq(Inst.id, I.institutionId))
      .where(live),
  ]);
  const [disc] = await db
    .select({ open: count(), escalated: sql<number>`count(*) filter (where ${schema.discrepancies.severity} = 'critical')`.mapWith(Number) })
    .from(schema.discrepancies)
    .innerJoin(I, eq(I.id, schema.discrepancies.instrumentId))
    .innerJoin(Inst, eq(Inst.id, I.institutionId))
    .where(and(scope, notInArray(schema.discrepancies.status, ["closed", "dismissed"])));
  return { ...s, openDiscrepancies: disc.open, criticalDiscrepancies: disc.escalated };
}

/** Live instruments maturing per month for the next 12 months. */
export async function maturityForecast(user: SessionUser, today: string) {
  const scope = instrumentScope(user);
  const rows = await db
    .select({
      month: sql<string>`to_char(date_trunc('month', ${I.maturityDate}), 'YYYY-MM')`,
      due: count(),
      renewed: sql<number>`count(*) filter (where ${I.renewalStatus} in ('requested','renewed','replaced'))`.mapWith(Number),
    })
    .from(I)
    .innerJoin(Inst, eq(Inst.id, I.institutionId))
    .where(and(scope, sql`${I.maturityDate} >= date_trunc('month', ${today}::date) and ${I.maturityDate} < date_trunc('month', ${today}::date) + interval '12 months'`, notInArray(I.releaseStatus, ["released", "refunded"])))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return rows;
}

/* ------------------------------------------------------------- one case -- */

export async function getCase(user: SessionUser, caseNo: string) {
  const scope = instrumentScope(user);
  const [row] = await db
    .select({ i: I, inst: Inst, region: R, owner: { id: U.id, name: U.name, designation: U.designation } })
    .from(I)
    .innerJoin(Inst, eq(Inst.id, I.institutionId))
    .innerJoin(R, eq(R.id, Inst.regionId))
    .leftJoin(U, eq(U.id, I.ownerUserId))
    .where(and(eq(I.caseNo, caseNo), scope))
    .limit(1);
  if (!row) return null;
  const id = row.i.id;
  const Prev = alias(I, "prev");

  const [fields, documents, verifications, discrepancies, releases, ledger, successors, predecessor, branch] = await Promise.all([
    db.select().from(schema.instrumentFields).where(eq(schema.instrumentFields.instrumentId, id)),
    db.select().from(schema.documents).where(eq(schema.documents.instrumentId, id)).orderBy(asc(schema.documents.uploadedAt)),
    db
      .select({ v: schema.verifications, requestedBy: U.name })
      .from(schema.verifications)
      .leftJoin(U, eq(U.id, schema.verifications.requestedBy))
      .where(eq(schema.verifications.instrumentId, id))
      .orderBy(desc(schema.verifications.requestedAt)),
    db.select().from(schema.discrepancies).where(eq(schema.discrepancies.instrumentId, id)).orderBy(desc(schema.discrepancies.raisedAt)),
    db.select().from(schema.releaseRequests).where(eq(schema.releaseRequests.instrumentId, id)).orderBy(desc(schema.releaseRequests.requestedAt)),
    db
      .select({ e: schema.auditLedger, actor: U.name })
      .from(schema.auditLedger)
      .leftJoin(U, eq(U.id, schema.auditLedger.actorId))
      .where(and(eq(schema.auditLedger.entity, "instrument"), eq(schema.auditLedger.entityId, id)))
      .orderBy(desc(schema.auditLedger.seq))
      .limit(50),
    db.select({ caseNo: I.caseNo, issueDate: I.issueDate, maturityDate: I.maturityDate, record: I.recordStatus }).from(I).where(eq(I.replacesInstrumentId, id)),
    row.i.replacesInstrumentId
      ? db.select({ caseNo: Prev.caseNo, issueDate: Prev.issueDate, maturityDate: Prev.maturityDate, renewal: Prev.renewalStatus }).from(Prev).where(eq(Prev.id, row.i.replacesInstrumentId))
      : Promise.resolve([]),
    row.i.ifsc ? db.select().from(schema.ifscBranches).where(eq(schema.ifscBranches.ifsc, row.i.ifsc)).limit(1) : Promise.resolve([]),
  ]);

  const observations = await db
    .select({ o: schema.observations, author: U.name })
    .from(schema.observations)
    .innerJoin(U, eq(U.id, schema.observations.authorId))
    .where(eq(schema.observations.instrumentId, id))
    .orderBy(asc(schema.observations.createdAt));

  const approvals = releases.length
    ? await db
        .select({ a: schema.approvals, actor: U.name, designation: U.designation })
        .from(schema.approvals)
        .innerJoin(U, eq(U.id, schema.approvals.actorId))
        .where(inArray(schema.approvals.releaseRequestId, releases.map((r) => r.id)))
        .orderBy(asc(schema.approvals.createdAt))
    : [];

  // Full renewal chain (oldest first) for the history strip.
  const chain = await db.execute<{ case_no: string; issue_date: string; maturity_date: string; renewal_status: string; release_status: string; depth: number }>(sql`
    with recursive up as (
      select id, replaces_instrument_id, 0 as depth from instruments where id = ${id}
      union all
      select i.id, i.replaces_instrument_id, up.depth - 1 from instruments i join up on i.id = up.replaces_instrument_id
    ), down as (
      select id, 0 as depth from instruments where id = ${id}
      union all
      select i.id, down.depth + 1 from instruments i join down on i.replaces_instrument_id = down.id
    ), ids as (select id, depth from up union select id, depth from down)
    select i.case_no, i.issue_date::text, i.maturity_date::text, i.renewal_status, i.release_status, ids.depth
    from ids join instruments i on i.id = ids.id order by ids.depth`);

  return {
    ...row,
    fields,
    documents,
    verifications,
    discrepancies,
    releases,
    approvals,
    observations,
    ledger,
    successors,
    predecessor: predecessor[0] ?? null,
    branch: branch[0] ?? null,
    chain: [...chain],
    openDiscrepancies: discrepancies.filter((d) => !["closed", "dismissed"].includes(d.status)).length,
  };
}

export type CaseDetail = NonNullable<Awaited<ReturnType<typeof getCase>>>;

export const regionsList = () => db.select({ id: R.id, code: R.code, name: R.name }).from(R).orderBy(asc(R.id));

