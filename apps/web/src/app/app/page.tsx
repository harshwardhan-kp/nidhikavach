import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { TrustMeter } from "@/components/case-ui";
import { Card, PageHeader, Pill, Stat } from "@/components/ui";
import { can, ROLE_LABEL } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { ledgerHead } from "@/lib/ledger";
import { formatCrore, formatDate, formatDateTime, formatPaise } from "@/lib/utils";
import { listCases, maturityForecast, overviewStats } from "@/modules/cases/queries";
import { scopeLabel } from "@/modules/cases/scope";
import { regionBreakdown } from "@/modules/oversight/queries";
import { BriefingCard, BriefingSkeleton } from "./_overview/briefing-card";
import { RegionTable } from "./_overview/region-table";

export const metadata: Metadata = { title: "Overview" };

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

export default async function OverviewPage() {
  const user = await requireUser();
  const todayIso = await today();
  const [stats, action, forecast, head, regions] = await Promise.all([
    overviewStats(user, todayIso),
    listCases(user, { view: "action" }),
    maturityForecast(user, todayIso),
    ledgerHead(),
    regionBreakdown(user, todayIso),
  ]);
  const hq = can(user.roles, "instrument.view_all");

  // Pad the forecast to 12 consecutive months.
  const start = new Date(`${todayIso.slice(0, 7)}-01T00:00:00Z`);
  const months = Array.from({ length: 12 }, (_, k) => {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + k);
    const key = d.toISOString().slice(0, 7);
    const row = forecast.find((f) => f.month === key);
    return { key, m: MONTHS[d.getUTCMonth()], due: row?.due ?? 0, renewed: row?.renewed ?? 0 };
  });
  const peak = Math.max(1, ...months.map((m) => m.due));

  return (
    <>
      <PageHeader
        title="deposit & fdr"
        italic="overview"
        sub={`[${scopeLabel(user)} · ${formatDate(todayIso)} · ${ROLE_LABEL[user.primaryRole].toLowerCase()}]`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="active instruments" value={stats.active.toLocaleString("en-IN")} hint={`${formatCrore(stats.amount)} under watch`} />
        <Stat label="expiring · 90 days" value={stats.expiring.toLocaleString("en-IN")} hint={`${stats.renewalDue} renewals due · ${stats.overdue} overdue`} />
        <Stat
          label="open discrepancies"
          value={stats.openDiscrepancies}
          accent={stats.openDiscrepancies > 0}
          hint={`${stats.criticalDiscrepancies} critical · ${stats.pendingVerification} awaiting bank`}
        />
        <Stat label="release requests" value={stats.releases} hint="maker → checker → authority" />
      </div>

      {hq ? (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
          {regions ? <RegionTable rows={[...regions]} /> : null}
          <Suspense fallback={<BriefingSkeleton />}>
            <BriefingCard user={user} today={todayIso} />
          </Suspense>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.7fr_1fr]">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <div className="kicker">cases needing action</div>
            <Link href="/app/cases?view=action" className="tag hover:text-ink">
              [sorted by risk · {action.total} total →]
            </Link>
          </div>
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="tag border-y border-line-2 text-[11px]">
                <th className="px-5 py-2 font-normal">[case]</th>
                <th className="px-3 py-2 font-normal">[institution]</th>
                <th className="px-3 py-2 text-right font-normal">[amount]</th>
                <th className="px-3 py-2 font-normal">[trust]</th>
                <th className="px-5 py-2 font-normal">[next]</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-2">
              {action.rows.slice(0, 8).map((r) => (
                <tr key={r.id} className="hover:bg-panel">
                  <td className="px-5 py-2">
                    <Link href={`/app/cases/${r.caseNo}`} className="font-mono font-semibold whitespace-nowrap hover:underline">
                      {r.caseNo}
                    </Link>
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2">{r.institution}</td>
                  <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{formatPaise(r.amountPaise)}</td>
                  <td className="px-3 py-2">
                    <TrustMeter score={r.trustScore} band={r.riskBand} />
                  </td>
                  <td className="max-w-[240px] px-5 py-2">
                    <div className="truncate">{r.nextAction}</div>
                  </td>
                </tr>
              ))}
              {!action.rows.length ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-txt">
                    Nothing needs your action.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="flex items-center justify-between">
              <div className="kicker">maturity forecast</div>
              <div className="tag flex items-center gap-3">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 bg-line" /> due
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 bg-ink-2" /> renewal in
                </span>
              </div>
            </div>
            <div className="mt-4 flex h-[140px] items-end gap-1.5" role="img" aria-label="Instruments maturing per month over the next 12 months">
              {months.map((m) => (
                <div key={m.key} className="flex flex-1 flex-col items-center gap-1" title={`${m.key}: ${m.due} maturing, ${m.renewed} renewal received`}>
                  <div className="relative flex w-full flex-1 items-end">
                    <div className="w-full rounded-t-[3px] bg-line" style={{ height: `${(m.due / peak) * 100}%` }}>
                      <div className="w-full rounded-t-[3px] bg-ink-2" style={{ height: `${m.due ? (m.renewed / m.due) * 100 : 0}%`, marginTop: "auto" }} />
                    </div>
                  </div>
                  <span className="tag text-[10px]">{m.m}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <div className="kicker">audit ledger head</div>
            {head ? (
              <div className="mt-3 flex flex-col gap-1.5">
                <div className="flex items-center gap-2">
                  <Pill tone="dark">#{head.seq.toLocaleString("en-IN")}</Pill>
                  <span className="tag">{formatDateTime(head.ts)}</span>
                </div>
                <code className="font-mono text-[11.5px] break-all text-txt">{head.hash}</code>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <span className="tag">every action is hash-chained; edit one past entry and every hash after it stops matching</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
