import type { Metadata } from "next";
import Link from "next/link";
import { LanePill, TrustMeter } from "@/components/case-ui";
import { Card, PageHeader } from "@/components/ui";
import { can } from "@/lib/auth/roles";
import { requirePermission } from "@/lib/auth/session";
import { cn, formatDate, formatDateTime, formatPaise } from "@/lib/utils";
import { scopeLabel } from "@/modules/cases/scope";
import { QUEUE_TABS, queueCounts, queueRows, type QueueTab, TAB_META } from "@/modules/verify/queue";

export const metadata: Metadata = { title: "Verification" };

export default async function VerificationPage({ searchParams }: PageProps<"/app/verification">) {
  const user = await requirePermission("reports.view");
  const { tab: raw } = await searchParams;
  const counts = await queueCounts(user);
  // Open on the first tab this role works that has something in it.
  const mine: QueueTab[] = can(user.roles, "verification.confirm") && !can(user.roles, "verification.request") ? ["letters", "close"] : ["read", "bank", "mismatch"];
  const fallback = mine.find((t) => counts[t] > 0) ?? mine[0];
  const tab = (QUEUE_TABS as readonly string[]).includes(String(raw)) ? (raw as QueueTab) : fallback;
  const rows = await queueRows(user, tab);
  const meta = TAB_META[tab];

  return (
    <>
      <PageHeader title="verification" italic="queue" sub={`[${scopeLabel(user)} · declared vs scan vs bank]`} />

      <div className="mb-4 flex flex-wrap gap-2">
        {QUEUE_TABS.map((t) => (
          <Link
            key={t}
            href={`/app/verification?tab=${t}`}
            className={cn(
              "flex items-center gap-2 rounded-[10px] border px-3 py-2 font-mono text-[12.5px]",
              t === tab ? "border-ink bg-ink-2 text-white" : "border-line bg-card hover:border-ink",
            )}
          >
            {TAB_META[t].label}
            <span className={cn("rounded-full px-1.5 text-[11px]", t === tab ? "bg-white/20" : counts[t] ? "bg-red-soft text-red" : "bg-chip text-txt")}>{counts[t].toLocaleString("en-IN")}</span>
            <span className={cn("text-[10.5px]", t === tab ? "text-white/60" : "text-mut")}>[{TAB_META[t].who}]</span>
          </Link>
        ))}
      </div>
      <p className="tag mb-3 text-[12px]">{meta.hint}</p>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-[13px]">
          <thead>
            <tr className="tag border-b border-line text-[11px]">
              <th className="px-4 py-3 font-normal">[case]</th>
              <th className="px-3 py-3 font-normal">[institution]</th>
              <th className="px-3 py-3 font-normal">[bank · ifsc]</th>
              <th className="px-3 py-3 text-right font-normal">[amount]</th>
              <th className="px-3 py-3 font-normal">[trust]</th>
              <th className="px-3 py-3 font-normal">[record · bank]</th>
              <th className="px-4 py-3 font-normal">[next action]</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {rows.map((r) => (
              <tr key={r.caseNo} className="align-top hover:bg-panel">
                <td className="px-4 py-2.5">
                  <Link href={`/app/cases/${r.caseNo}`} className="font-mono text-[12.5px] font-semibold whitespace-nowrap hover:underline">
                    {r.caseNo}
                  </Link>
                  <div className="tag whitespace-nowrap">submitted {formatDateTime(r.submittedAt)}</div>
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <div className="truncate">{r.institution}</div>
                  <div className="tag truncate">{r.city}</div>
                </td>
                <td className="px-3 py-2.5">
                  <div className="max-w-[170px] truncate">{r.bank}</div>
                  <div className="tag">{r.ifsc}</div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] whitespace-nowrap">{formatPaise(r.amountPaise)}</td>
                <td className="px-3 py-2.5">
                  <TrustMeter score={r.trustScore} band={r.riskBand} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <LanePill value={r.record} />
                    <LanePill value={r.verification} />
                  </div>
                </td>
                <td className="max-w-[280px] px-4 py-2.5">
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
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-txt">
                  Nothing waiting here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
      {rows.length >= 60 ? <p className="tag mt-3">[showing the 60 most urgent of {counts[tab].toLocaleString("en-IN")}]</p> : null}
    </>
  );
}
