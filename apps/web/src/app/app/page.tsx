import { count, eq, sql } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, PageHeader, Pill, Stat } from "@/components/ui";
import { db, schema } from "@/db";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { ledgerHead } from "@/lib/ledger";
import { formatCrore, formatDateTime } from "@/lib/utils";

export const metadata: Metadata = { title: "Overview" };

const LANES = [
  ["record", "draft → submitted → under scrutiny → accepted"],
  ["verification", "unverified → pending bank → bank confirmed / mismatch"],
  ["validity", "valid → expiring → matured → expired"],
  ["renewal", "not due → due → requested → renewed / replaced"],
  ["release", "none → requested → recommended → checked → approved → released"],
] as const;

export default async function OverviewPage() {
  const user = await requireUser();

  const [[totals], [discrepancyCount], [releaseCount], head] = await Promise.all([
    db
      .select({
        active: count(),
        amount: sql<number>`coalesce(sum(${schema.instruments.amountPaise}), 0)::bigint`.mapWith(Number),
        expiring: sql<number>`count(*) filter (where ${schema.instruments.validityStatus} = 'expiring')`.mapWith(Number),
      })
      .from(schema.instruments),
    db.select({ n: count() }).from(schema.discrepancies).where(eq(schema.discrepancies.status, "open")),
    db.select({ n: count() }).from(schema.releaseRequests),
    ledgerHead(),
  ]);

  return (
    <>
      <PageHeader title="deposit & fdr" italic="overview" sub={`[${user.regionName ?? "all regions"} · signed in as ${ROLE_LABEL[user.primaryRole].toLowerCase()}]`} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="active instruments" value={totals.active.toLocaleString("en-IN")} hint={`${formatCrore(totals.amount)} under watch`} />
        <Stat label="expiring · 90 days" value={totals.expiring.toLocaleString("en-IN")} hint="reminders from p3" />
        <Stat label="open discrepancies" value={discrepancyCount.n} accent={discrepancyCount.n > 0} hint="auto-raised from p2" />
        <Stat label="release requests" value={releaseCount.n} hint="maker → checker → authority" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <div className="kicker">five independent status lanes</div>
          <p className="mt-2 text-[13px] text-txt">Every FDR moves through five lanes at once, so maturity is never confused with release authority.</p>
          <ul className="mt-4 flex flex-col divide-y divide-line-2">
            {LANES.map(([lane, flow]) => (
              <li key={lane} className="flex items-baseline gap-4 py-2.5">
                <span className="w-24 shrink-0 font-mono text-[12px] font-semibold">{lane}</span>
                <span className="font-mono text-[12px] text-txt">{flow}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="p-5">
          <div className="kicker">audit ledger head</div>
          {head ? (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Pill tone="dark">#{head.seq}</Pill>
                <span className="tag">{formatDateTime(head.ts)}</span>
              </div>
              <code className="break-all font-mono text-[12px] text-txt">{head.hash}</code>
              <p className="text-[12.5px] text-txt">Every action is hash-chained. Change one past entry and every hash after it stops matching.</p>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-txt">No entries yet.</p>
          )}
        </Card>
      </div>
    </>
  );
}
