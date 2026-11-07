import { can } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { appendLedger } from "@/lib/ledger";
import { formatDate } from "@/lib/utils";
import { scopeLabel } from "@/modules/cases/scope";
import { reportPdf } from "@/modules/oversight/report-pdf";
import { reportById, runReport, toCsv } from "@/modules/oversight/reports";

export const maxDuration = 60;

/** /app/reports/<id>/export?format=csv|pdf — scoped to the user, logged on the ledger. */
export async function GET(req: Request, ctx: RouteContext<"/app/reports/[id]/export">) {
  const user = await getSessionUser();
  if (!user) return new Response("sign in first", { status: 401 });
  if (!can(user.roles, "reports.view")) return new Response("forbidden", { status: 403 });
  const { id } = await ctx.params;
  const report = reportById(id);
  if (!report) return new Response("no such report", { status: 404 });
  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "csv";
  const todayIso = await today();
  const rows = await runReport(user, report, todayIso);
  await appendLedger({ actor: user, action: "report.exported", entity: "settings", entityId: report.id, payload: { format, rows: rows.length, scope: scopeLabel(user) } });
  const name = `nidhikavach-${report.id}-${todayIso}`;
  if (format === "csv") {
    return new Response(`﻿${toCsv(report, rows)}`, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${name}.csv"` } });
  }
  const bytes = await reportPdf(report.title, `${scopeLabel(user)} · as of ${formatDate(todayIso)} · ${rows.length.toLocaleString("en-IN")} rows · exported by ${user.name}`, report.columns, rows);
  return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}.pdf"` } });
}
