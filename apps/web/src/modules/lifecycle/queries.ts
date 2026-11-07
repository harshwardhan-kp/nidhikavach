import "server-only";
import { and, asc, count, desc, eq, type SQL, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { instrumentScope } from "@/modules/cases/scope";

const { instruments: I, institutions: Inst, users: U } = schema;
const Next = alias(I, "next_link");

const open = sql`${I.renewalStatus} not in ('renewed','replaced') and ${I.releaseStatus} not in ('released','refunded')`;
const left = (today: string) => sql`(${I.maturityDate} - ${today}::date)`;

export const MATURITY_BUCKETS = ["7", "30", "60", "90", "grace", "expired"] as const;
export type MaturityBucket = (typeof MATURITY_BUCKETS)[number];
export const BUCKET_LABEL: Record<MaturityBucket, string> = {
  "7": "within 7 days",
  "30": "8–30 days",
  "60": "31–60 days",
  "90": "61–90 days",
  grace: "matured · in grace",
  expired: "past grace",
};

function bucketCondition(b: MaturityBucket, today: string): SQL {
  const d = left(today);
  switch (b) {
    case "7":
      return sql`${d} between 1 and 7`;
    case "30":
      return sql`${d} between 8 and 30`;
    case "60":
      return sql`${d} between 31 and 60`;
    case "90":
      return sql`${d} between 61 and 90`;
    case "grace":
      return sql`${d} between -15 and 0`;
    case "expired":
      return sql`${d} < -15`;
  }
}

export const RENEWAL_TABS = ["due", "requested", "overdue", "done"] as const;
export type RenewalTab = (typeof RENEWAL_TABS)[number];
export const RENEWAL_LABEL: Record<RenewalTab, string> = { due: "due, not submitted", requested: "renewal submitted", overdue: "overdue · escalating", done: "renewed" };

function renewalCondition(t: RenewalTab): SQL {
  if (t === "done") return sql`${I.renewalStatus} in ('renewed','replaced')`;
  return sql`${I.renewalStatus} = ${t} and ${I.releaseStatus} not in ('released','refunded')`;
}

const columns = {
  id: I.id,
  caseNo: I.caseNo,
  institution: Inst.name,
  city: Inst.city,
  bank: I.bankName,
  amountPaise: I.amountPaise,
  maturityDate: I.maturityDate,
  validity: I.validityStatus,
  renewal: I.renewalStatus,
  release: I.releaseStatus,
  nextAction: I.nextAction,
  nextActionDue: I.nextActionDue,
  owner: U.name,
  successor: Next.caseNo,
  successorRecord: Next.recordStatus,
  updatedAt: I.updatedAt,
};

function list(user: SessionUser, where: SQL, order: SQL[], limit = 80) {
  return db
    .select(columns)
    .from(I)
    .innerJoin(Inst, eq(Inst.id, I.institutionId))
    .leftJoin(U, eq(U.id, I.ownerUserId))
    .leftJoin(Next, eq(Next.replacesInstrumentId, I.id))
    .where(and(instrumentScope(user), where))
    .orderBy(...order, asc(I.caseNo))
    .limit(limit);
}

async function counts<T extends string>(user: SessionUser, keys: readonly T[], cond: (k: T) => SQL) {
  const rows = await Promise.all(
    keys.map((k) =>
      db
        .select({ n: count() })
        .from(I)
        .innerJoin(Inst, eq(Inst.id, I.institutionId))
        .where(and(instrumentScope(user), cond(k)))
        .then(([r]) => [k, r.n] as const),
    ),
  );
  return Object.fromEntries(rows) as Record<T, number>;
}

export const maturityCounts = (user: SessionUser, today: string) => counts(user, MATURITY_BUCKETS, (b) => and(open, bucketCondition(b, today))!);
export const maturityList = (user: SessionUser, today: string, b: MaturityBucket) => list(user, and(open, bucketCondition(b, today))!, [asc(I.maturityDate)]);

export const renewalCounts = (user: SessionUser) => counts(user, RENEWAL_TABS, renewalCondition);
export const renewalList = (user: SessionUser, t: RenewalTab) => list(user, renewalCondition(t), t === "done" ? [desc(I.updatedAt)] : [asc(I.maturityDate)]);

export type LifecycleRow = Awaited<ReturnType<typeof maturityList>>[number];
