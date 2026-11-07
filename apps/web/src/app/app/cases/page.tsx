import type { Metadata } from "next";
import Link from "next/link";
import { DaysLeft, LanePill, TrustMeter } from "@/components/case-ui";
import { Card, PageHeader } from "@/components/ui";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { daysBetween } from "@/lib/rules/lanes";
import { formatDate, formatPaise } from "@/lib/utils";
import { TYPE_LABEL } from "@/modules/cases/labels";
import { caseFilterSchema, listCases, regionsList } from "@/modules/cases/queries";
import { scopeLabel } from "@/modules/cases/scope";
import { FilterBar } from "./filter-bar";

export const metadata: Metadata = { title: "Cases" };

export default async function CasesPage({ searchParams }: PageProps<"/app/cases">) {
  const user = await requireUser();
  const raw = await searchParams;
  const flat = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const filters = caseFilterSchema.parse(flat);
  const [result, todayIso, regions] = await Promise.all([
    listCases(user, filters),
    today(),
    can(user.roles, "instrument.view_all") ? regionsList() : Promise.resolve(null),
  ]);

  const pageHref = (p: number) => {
    const qs = new URLSearchParams(Object.entries({ ...flat, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/app/cases?${qs}`;
  };

  return (
    <>
      <PageHeader title="deposit" italic="cases" sub={`[${scopeLabel(user)} · ${result.total.toLocaleString("en-IN")} matching · sorted by ${filters.sort ?? "risk"}]`}>
        {can(user.roles, "instrument.submit") ? (
          <Link href="/app/submit" className="rounded-[10px] bg-ink-2 px-4 py-2.5 font-mono text-[13px] text-white hover:opacity-85">
            [+ submit an FDR]
          </Link>
        ) : null}
      </PageHeader>

      <FilterBar values={flat as Record<string, string | undefined>} regions={regions} />

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[1080px] text-left text-[13px]">
          <thead>
            <tr className="tag border-b border-line text-[11px]">
              <th className="px-4 py-3 font-normal">[case]</th>
              <th className="px-3 py-3 font-normal">[institution]</th>
              <th className="px-3 py-3 font-normal">[bank · ifsc]</th>
              <th className="px-3 py-3 text-right font-normal">[amount]</th>
              <th className="px-3 py-3 font-normal">[maturity]</th>
              <th className="px-3 py-3 font-normal">[trust]</th>
              <th className="px-3 py-3 font-normal">[status]</th>
              <th className="px-4 py-3 font-normal">[next action]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {result.rows.map((r) => {
              const days = r.maturityDate ? daysBetween(todayIso, r.maturityDate) : null;
              const attention = [
                r.verification !== "bank_confirmed" && r.verification !== "manual_confirmed" ? r.verification : null,
                r.validity !== "valid" ? r.validity : null,
                r.renewal !== "not_due" ? r.renewal : null,
                r.release !== "none" ? `release ${r.release}` : null,
                r.record !== "accepted" ? r.record : null,
              ].filter(Boolean) as string[];
              return (
                <tr key={r.id} className="align-top hover:bg-panel">
                  <td className="px-4 py-2.5">
                    <Link href={`/app/cases/${r.caseNo}`} className="font-mono text-[12.5px] font-semibold whitespace-nowrap underline-offset-2 hover:underline">
                      {r.caseNo}
                    </Link>
                    <div className="tag">{TYPE_LABEL[r.type]}</div>
                  </td>
                  <td className="max-w-[260px] px-3 py-2.5">
                    <div className="truncate">{r.institution}</div>
                    <div className="tag truncate">
                      {r.programme} · {r.region}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="max-w-[170px] truncate">{r.bank}</div>
                    <div className="tag">{r.ifsc}</div>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-[12.5px] whitespace-nowrap">{formatPaise(r.amountPaise)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-mono text-[12px]">{formatDate(r.maturityDate)}</div>
                    <DaysLeft days={days} />
                  </td>
                  <td className="px-3 py-2.5">
                    <TrustMeter score={r.trustScore} band={r.riskBand} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex max-w-[220px] flex-wrap gap-1">
                      {attention.length ? attention.slice(0, 3).map((a) => <LanePill key={a} value={a.replace("release ", "")} />) : <LanePill value="bank_confirmed" />}
                    </div>
                  </td>
                  <td className="max-w-[260px] px-4 py-2.5">
                    {r.nextAction ? (
                      <>
                        <div className="text-[12.5px]">{r.nextAction}</div>
                        <div className="tag">
                          {r.owner ?? "unassigned"} · due {formatDate(r.nextActionDue)}
                        </div>
                      </>
                    ) : (
                      <span className="tag">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {!result.rows.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[13px] text-txt">
                  No cases match these filters.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>

      {result.pages > 1 ? (
        <div className="mt-4 flex items-center justify-between font-mono text-[12px] text-txt">
          <span>
            page {result.page} of {result.pages}
          </span>
          <div className="flex gap-2">
            {result.page > 1 ? (
              <Link href={pageHref(result.page - 1)} className="rounded-[9px] bg-chip px-3 py-1.5 hover:opacity-85">
                ← previous
              </Link>
            ) : null}
            {result.page < result.pages ? (
              <Link href={pageHref(result.page + 1)} className="rounded-[9px] bg-chip px-3 py-1.5 hover:opacity-85">
                next →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
