import { FileDown } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { formatPaise } from "@/lib/utils";
import { scopeLabel } from "@/modules/cases/scope";
import { formatCell, reportById, reportCount, runReport } from "@/modules/oversight/reports";

export async function generateMetadata({ params }: PageProps<"/app/reports/[id]">): Promise<Metadata> {
  const { id } = await params;
  return { title: reportById(id)?.title ?? "Report" };
}

const PREVIEW = 100;

export default async function ReportPage({ params }: PageProps<"/app/reports/[id]">) {
  const user = await requirePermission("reports.view");
  const { id } = await params;
  const report = reportById(id);
  if (!report) notFound();
  const todayIso = await today();
  const [rows, total] = await Promise.all([runReport(user, report, todayIso, PREVIEW), reportCount(user, report, todayIso)]);
  return (
    <>
      <Link href="/app/reports" className="tag text-[12px] hover:text-ink">
        ← [reports]
      </Link>
      <PageHeader title={report.title} sub={`[${scopeLabel(user)} · ${total.toLocaleString("en-IN")} rows${total > PREVIEW ? ` · first ${PREVIEW} shown` : ""}]`}>
        <div className="flex gap-2 font-mono text-[12px]">
          <a href={`/app/reports/${report.id}/export?format=csv`} className="inline-flex items-center gap-1 rounded-[9px] bg-ink-2 px-3 py-2 text-white hover:opacity-85">
            <FileDown size={13} /> [export csv]
          </a>
          <a href={`/app/reports/${report.id}/export?format=pdf`} className="inline-flex items-center gap-1 rounded-[9px] bg-chip px-3 py-2 hover:opacity-85">
            <FileDown size={13} /> [export pdf]
          </a>
        </div>
      </PageHeader>
      <p className="tag -mt-3 mb-4 text-[12px]">{report.about}</p>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-[12px]">
          <thead>
            <tr className="tag border-b border-line text-[11px]">
              {report.columns.map((c) => (
                <th key={c.key} className={`px-3 py-2.5 font-normal ${c.kind === "money" || c.kind === "num" ? "text-right" : ""}`}>
                  [{c.label.toLowerCase()}]
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line-2">
            {rows.map((r, n) => (
              <tr key={n} className="hover:bg-panel">
                {report.columns.map((c) => (
                  <td key={c.key} className={`px-3 py-2 ${c.kind === "money" || c.kind === "num" ? "text-right font-mono" : ""} ${c.key === "institution" || c.key === "title" ? "max-w-[240px] truncate" : "whitespace-nowrap"}`}>
                    {c.key === "case_no" ? (
                      <Link href={`/app/cases/${String(r[c.key])}`} className="font-mono font-semibold hover:underline">
                        {String(r[c.key])}
                      </Link>
                    ) : c.kind === "money" ? (
                      formatPaise(Number(r[c.key]))
                    ) : (
                      formatCell(r[c.key], c.kind).replaceAll("_", " ")
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length ? (
              <tr>
                <td colSpan={report.columns.length} className="px-4 py-10 text-center text-[13px] text-txt">
                  No rows in your scope.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Card>
    </>
  );
}
