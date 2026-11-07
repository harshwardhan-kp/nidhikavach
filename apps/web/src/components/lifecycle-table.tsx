import Link from "next/link";
import { DaysLeft, LanePill } from "@/components/case-ui";
import { Card } from "@/components/ui";
import { daysBetween } from "@/lib/rules/lanes";
import { cn, formatDate, formatPaise } from "@/lib/utils";

type Row = {
  id: string;
  caseNo: string;
  institution: string;
  city: string | null;
  bank: string | null;
  amountPaise: number | null;
  maturityDate: string | null;
  validity: string;
  renewal: string;
  nextAction: string | null;
  nextActionDue: string | null;
  owner: string | null;
  successor: string | null;
  successorRecord: string | null;
};
type Reminder = { kind: string; offsetDays: number | null; level: number } | undefined;

const LADDER = ["institution", "dealing officer", "regional officer", "authority"];

export function reminderLabel(r: Reminder) {
  if (!r) return null;
  return r.kind === "maturity" ? `T-${r.offsetDays} notice sent` : `escalated to ${LADDER[r.level] ?? "authority"}`;
}

/** Shared table for the maturity watch and renewals pages. */
export function LifecycleTable({ rows, today, reminders }: { rows: Row[]; today: string; reminders: Map<string, NonNullable<Reminder>> }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[1040px] text-left text-[13px]">
        <thead>
          <tr className="tag border-b border-line text-[11px]">
            <th className="px-4 py-3 font-normal">[case]</th>
            <th className="px-3 py-3 font-normal">[institution]</th>
            <th className="px-3 py-3 text-right font-normal">[amount]</th>
            <th className="px-3 py-3 font-normal">[matures]</th>
            <th className="px-3 py-3 font-normal">[validity · renewal]</th>
            <th className="px-3 py-3 font-normal">[last reminder]</th>
            <th className="px-4 py-3 font-normal">[next action]</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-2">
          {rows.map((r) => {
            const rem = reminders.get(r.id);
            return (
              <tr key={r.id} className="align-top hover:bg-panel">
                <td className="px-4 py-2.5">
                  <Link href={`/app/cases/${r.caseNo}`} className="font-mono text-[12.5px] font-semibold whitespace-nowrap hover:underline">
                    {r.caseNo}
                  </Link>
                  {r.successor ? (
                    <div className="tag whitespace-nowrap">
                      →{" "}
                      <Link href={`/app/cases/${r.successor}`} className="hover:text-ink hover:underline">
                        {r.successor}
                      </Link>{" "}
                      ({r.successorRecord?.replaceAll("_", " ")})
                    </div>
                  ) : null}
                </td>
                <td className="max-w-[260px] px-3 py-2.5">
                  <div className="truncate">{r.institution}</div>
                  <div className="tag truncate">
                    {r.city} · {r.bank}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right font-mono text-[12.5px] whitespace-nowrap">{formatPaise(r.amountPaise)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <div className="font-mono text-[12px]">{formatDate(r.maturityDate)}</div>
                  <DaysLeft days={r.maturityDate ? daysBetween(today, r.maturityDate) : null} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    <LanePill value={r.validity} />
                    <LanePill value={r.renewal} />
                  </div>
                </td>
                <td className={cn("px-3 py-2.5 text-[12.5px]", rem?.kind === "renewal_overdue" && "text-red")}>{reminderLabel(rem) ?? <span className="tag">—</span>}</td>
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
          {!rows.length ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-[13px] text-txt">
                Nothing in this window.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Card>
  );
}

export function Tabs<T extends string>({ base, tabs, active, counts, labels, tone }: { base: string; tabs: readonly T[]; active: T; counts: Record<T, number>; labels: Record<T, string>; tone?: (t: T) => "red" | undefined }) {
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {tabs.map((t) => (
        <Link
          key={t}
          href={`${base}?tab=${t}`}
          className={cn("flex items-center gap-2 rounded-[10px] border px-3 py-2 font-mono text-[12.5px]", t === active ? "border-ink bg-ink-2 text-white" : "border-line bg-card hover:border-ink")}
        >
          {labels[t]}
          <span className={cn("rounded-full px-1.5 text-[11px]", t === active ? "bg-white/20" : tone?.(t) === "red" && counts[t] ? "bg-red-soft text-red" : "bg-chip text-txt")}>{counts[t].toLocaleString("en-IN")}</span>
        </Link>
      ))}
    </div>
  );
}
