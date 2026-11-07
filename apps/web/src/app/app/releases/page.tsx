import type { Metadata } from "next";
import Link from "next/link";
import { LanePill } from "@/components/case-ui";
import { Card, PageHeader, Pill } from "@/components/ui";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { cn, formatDate, formatDateTime, formatPaise } from "@/lib/utils";
import { scopeLabel } from "@/modules/cases/scope";
import { RELEASE_TAB_META, RELEASE_TABS, type ReleaseTab, releaseCounts, releaseList } from "@/modules/release/queries";

export const metadata: Metadata = { title: "Releases" };

export default async function ReleasesPage({ searchParams }: PageProps<"/app/releases">) {
  const user = await requirePermission("reports.view");
  const { tab: raw } = await searchParams;
  const counts = await releaseCounts(user);
  const mine: ReleaseTab = can(user.roles, "release.approve") ? "checked" : can(user.roles, "release.check") ? "recommended" : "requested";
  const tab = (RELEASE_TABS as readonly string[]).includes(String(raw)) ? (raw as ReleaseTab) : mine;
  const rows = await releaseList(user, tab);
  return (
    <>
      <PageHeader title="releases" italic="& refunds" sub={`[${scopeLabel(user)} · APH cl. 6.46 · three officers, one eSign]`} />
      <div className="mb-4 flex flex-wrap gap-2">
        {RELEASE_TABS.map((t) => (
          <Link key={t} href={`/app/releases?tab=${t}`} className={cn("flex items-center gap-2 rounded-[10px] border px-3 py-2 font-mono text-[12.5px]", t === tab ? "border-ink bg-ink-2 text-white" : "border-line bg-card hover:border-ink")}>
            {RELEASE_TAB_META[t].label}
            <span className={cn("rounded-full px-1.5 text-[11px]", t === tab ? "bg-white/20" : "bg-chip text-txt")}>{counts[t]}</span>
            <span className={cn("text-[10.5px]", t === tab ? "text-white/60" : "text-mut")}>[{RELEASE_TAB_META[t].who}]</span>
          </Link>
        ))}
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[13px]">
          <thead>
            <tr className="tag border-b border-line text-[11px]">
              <th className="px-4 py-3 font-normal">[case]</th>
              <th className="px-3 py-3 font-normal">[institution]</th>
              <th className="px-3 py-3 text-right font-normal">[amount]</th>
              <th className="px-3 py-3 font-normal">[kind · state]</th>
              <th className="px-3 py-3 font-normal">[requested]</th>
              <th className="px-4 py-3 font-normal">[next action / order]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {rows.map((x) => (
              <tr key={x.r.id} className="align-top hover:bg-panel">
                <td className="px-4 py-2.5">
                  <Link href={`/app/cases/${x.caseNo}`} className="font-mono text-[12.5px] font-semibold hover:underline">
                    {x.caseNo}
                  </Link>
                  <div className="tag">issued {formatDate(x.issueDate)}</div>
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <div className="truncate">{x.institution}</div>
                  <div className="tag truncate">
                    {x.city} · {x.bank}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] whitespace-nowrap">{formatPaise(x.amountPaise)}</td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <Pill tone="dark">{x.r.kind}</Pill>
                    <LanePill value={x.r.state} />
                  </div>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="tag">{formatDateTime(x.r.requestedAt)}</span>
                </td>
                <td className="max-w-[300px] px-4 py-2.5">
                  {x.r.orderNo ? (
                    <a href={`/verify/${x.r.id}`} target="_blank" rel="noreferrer" className="font-mono text-[12px] underline hover:text-ink">
                      {x.r.orderNo}
                    </a>
                  ) : x.nextAction ? (
                    <>
                      <div className="text-[12.5px]">{x.nextAction}</div>
                      <div className="tag">due {formatDate(x.nextActionDue)}</div>
                    </>
                  ) : (
                    <span className="tag">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-txt">
                  Nothing here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}
