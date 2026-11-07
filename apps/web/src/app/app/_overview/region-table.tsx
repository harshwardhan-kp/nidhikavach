import Link from "next/link";
import { Card } from "@/components/ui";
import { cn, formatCrore } from "@/lib/utils";
import type { RegionRow } from "@/modules/oversight/queries";

/** HQ view: one row per AICTE regional office; red where it is slipping. */
export function RegionTable({ rows }: { rows: RegionRow[] }) {
  const max = (k: keyof RegionRow) => Math.max(1, ...rows.map((r) => Number(r[k])));
  const hot = (r: RegionRow, k: keyof RegionRow) => Number(r[k]) > 0 && Number(r[k]) === max(k);
  return (
    <Card className="overflow-x-auto">
      <div className="flex items-center justify-between px-5 pt-4 pb-2">
        <div className="kicker">by regional office</div>
        <span className="tag">[highest in each column in red]</span>
      </div>
      <table className="w-full min-w-[820px] text-left text-[12.5px]">
        <thead>
          <tr className="tag border-y border-line-2 text-[11px]">
            <th className="px-5 py-2 font-normal">[region]</th>
            <th className="px-3 py-2 text-right font-normal">[active]</th>
            <th className="px-3 py-2 text-right font-normal">[under watch]</th>
            <th className="px-3 py-2 text-right font-normal">[expiring 90d]</th>
            <th className="px-3 py-2 text-right font-normal">[renewal overdue]</th>
            <th className="px-3 py-2 text-right font-normal">[red]</th>
            <th className="px-3 py-2 text-right font-normal">[awaiting bank]</th>
            <th className="px-3 py-2 text-right font-normal">[discrepancies · past due]</th>
            <th className="px-5 py-2 text-right font-normal">[releases]</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line-2 font-mono">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-panel">
              <td className="px-5 py-2 font-sans">
                <Link href={`/app/cases?region=${r.id}`} className="hover:underline">
                  {r.name}
                </Link>
              </td>
              <td className="px-3 py-2 text-right">{r.active.toLocaleString("en-IN")}</td>
              <td className="px-3 py-2 text-right">{formatCrore(Number(r.amount_paise))}</td>
              <td className="px-3 py-2 text-right">{r.expiring}</td>
              <td className={cn("px-3 py-2 text-right", hot(r, "overdue") && "text-red")}>{r.overdue}</td>
              <td className={cn("px-3 py-2 text-right", hot(r, "red") && "text-red")}>{r.red}</td>
              <td className={cn("px-3 py-2 text-right", hot(r, "pending_bank") && "text-red")}>{r.pending_bank}</td>
              <td className={cn("px-3 py-2 text-right", hot(r, "stale_disc") && "text-red")}>
                {r.open_disc} · {r.stale_disc}
              </td>
              <td className="px-5 py-2 text-right">{r.releases}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
