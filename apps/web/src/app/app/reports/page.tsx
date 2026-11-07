import { FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { scopeLabel } from "@/modules/cases/scope";
import { REPORTS, reportCount } from "@/modules/oversight/reports";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const user = await requirePermission("reports.view");
  const todayIso = await today();
  const counts = await Promise.all(REPORTS.map((r) => reportCount(user, r, todayIso)));
  return (
    <>
      <PageHeader title="reports" italic="& exports" sub={`[${scopeLabel(user)} · every export is logged on the audit ledger]`} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {REPORTS.map((r, k) => (
          <Card key={r.id} className="flex flex-col p-5">
            <div className="flex items-baseline justify-between gap-3">
              <Link href={`/app/reports/${r.id}`} className="font-serif text-[22px] leading-tight hover:underline">
                {r.title}
              </Link>
              <span className="font-mono text-[13px]">{counts[k].toLocaleString("en-IN")}</span>
            </div>
            <p className="mt-1.5 flex-1 text-[13px] text-txt">{r.about}</p>
            <div className="mt-4 flex gap-2 font-mono text-[12px]">
              <Link href={`/app/reports/${r.id}`} className="rounded-[9px] bg-ink-2 px-3 py-1.5 text-white hover:opacity-85">
                [view]
              </Link>
              <a href={`/app/reports/${r.id}/export?format=csv`} className="inline-flex items-center gap-1 rounded-[9px] bg-chip px-3 py-1.5 hover:opacity-85">
                <FileDown size={12} /> csv
              </a>
              <a href={`/app/reports/${r.id}/export?format=pdf`} className="inline-flex items-center gap-1 rounded-[9px] bg-chip px-3 py-1.5 hover:opacity-85">
                <FileDown size={12} /> pdf
              </a>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}
