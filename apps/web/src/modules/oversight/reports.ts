import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

export type Column = { key: string; label: string; kind?: "money" | "date" | "num" | "text" };
export type Report = { id: string; title: string; about: string; columns: Column[]; query: (scope: ReturnType<typeof scopeSql>, today: string) => ReturnType<typeof sql> };

/** Row-level scope as raw SQL (same rule as instrumentScope). */
function scopeSql(user: SessionUser) {
  if (can(user.roles, "instrument.view_all")) return sql`true`;
  if (can(user.roles, "instrument.view_scope") && user.regionId) return sql`n.region_id = ${user.regionId}`;
  if (user.institutionId) return sql`i.institution_id = ${user.institutionId}`;
  return sql`false`;
}

const LIVE = sql`i.renewal_status not in ('renewed','replaced') and i.release_status not in ('released','refunded')`;
const BASE = sql`from instruments i join institutions n on n.id = i.institution_id join regions r on r.id = n.region_id`;

export const REPORTS: Report[] = [
  {
    id: "registry",
    title: "Security deposit registry",
    about: "Every live FDR under AICTE lien with its five lanes and trust score.",
    columns: [
      { key: "case_no", label: "Case" }, { key: "institution", label: "Institution" }, { key: "aicte_id", label: "AICTE id" }, { key: "region", label: "Region" },
      { key: "bank", label: "Bank" }, { key: "ifsc", label: "IFSC" }, { key: "fdr_no", label: "FDR no." }, { key: "amount", label: "Amount", kind: "money" },
      { key: "issued", label: "Issued", kind: "date" }, { key: "matures", label: "Matures", kind: "date" }, { key: "record", label: "Record" }, { key: "verification", label: "Verification" },
      { key: "validity", label: "Validity" }, { key: "renewal", label: "Renewal" }, { key: "trust", label: "Trust", kind: "num" },
    ],
    query: (scope) => sql`select i.case_no, n.name as institution, n.aicte_id, r.code as region, i.bank_name as bank, i.ifsc, i.instrument_no as fdr_no, i.amount_paise as amount,
      i.issue_date::text as issued, i.maturity_date::text as matures, i.record_status as record, i.verification_status as verification, i.validity_status as validity, i.renewal_status as renewal, i.trust_score as trust
      ${BASE} where ${scope} and ${LIVE} order by r.id, i.maturity_date`,
  },
  {
    id: "maturity",
    title: "Maturing in the next 90 days",
    about: "What falls due, whether a renewal is in, and the last reminder sent.",
    columns: [
      { key: "case_no", label: "Case" }, { key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "amount", label: "Amount", kind: "money" },
      { key: "matures", label: "Matures", kind: "date" }, { key: "days_left", label: "Days left", kind: "num" }, { key: "renewal", label: "Renewal" }, { key: "last_reminder", label: "Last reminder" },
    ],
    query: (scope, today) => sql`select i.case_no, n.name as institution, r.code as region, i.amount_paise as amount, i.maturity_date::text as matures, (i.maturity_date - ${today}::date) as days_left,
      i.renewal_status as renewal, (select case when m.kind = 'maturity' then 'T-' || m.offset_days else 'escalation ' || m.escalation_level end from reminders m where m.instrument_id = i.id order by m.due_on desc limit 1) as last_reminder
      ${BASE} where ${scope} and ${LIVE} and i.maturity_date between ${today}::date and ${today}::date + 90 order by i.maturity_date`,
  },
  {
    id: "overdue",
    title: "Renewals overdue",
    about: "Matured past the 15-day grace with no renewal; the escalation level reached.",
    columns: [
      { key: "case_no", label: "Case" }, { key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "amount", label: "Amount", kind: "money" },
      { key: "matured", label: "Matured", kind: "date" }, { key: "days_past", label: "Days past", kind: "num" }, { key: "escalated_to", label: "Escalated to" }, { key: "owner", label: "Owner" },
    ],
    query: (scope, today) => sql`select i.case_no, n.name as institution, r.code as region, i.amount_paise as amount, i.maturity_date::text as matured, (${today}::date - i.maturity_date) as days_past,
      (select (array['institution','dealing officer','regional officer','authority'])[max(m.escalation_level) + 1] from reminders m where m.instrument_id = i.id and m.kind = 'renewal_overdue') as escalated_to,
      (select u.name from users u where u.id = i.owner_user_id) as owner
      ${BASE} where ${scope} and i.renewal_status = 'overdue' and i.release_status not in ('released','refunded') order by i.maturity_date`,
  },
  {
    id: "discrepancies",
    title: "Discrepancy ageing",
    about: "Open discrepancies, oldest first, with severity and whether the 15-day SLA has passed.",
    columns: [
      { key: "case_no", label: "Case" }, { key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "title", label: "Discrepancy" },
      { key: "severity", label: "Severity" }, { key: "status", label: "Status" }, { key: "raised", label: "Raised", kind: "date" }, { key: "age_days", label: "Age (days)", kind: "num" }, { key: "past_due", label: "Past SLA" },
    ],
    query: (scope, today) => sql`select i.case_no, n.name as institution, r.code as region, x.title, x.severity, x.status, x.raised_at::date::text as raised,
      (${today}::date - x.raised_at::date) as age_days, case when x.due_at::date < ${today}::date then 'yes' else 'no' end as past_due
      from discrepancies x join instruments i on i.id = x.instrument_id join institutions n on n.id = i.institution_id join regions r on r.id = n.region_id
      where ${scope} and x.status not in ('closed','dismissed') order by x.raised_at`,
  },
  {
    id: "releases",
    title: "Releases and refunds",
    about: "Every request with its stage, the three officers' decisions and the order number.",
    columns: [
      { key: "case_no", label: "Case" }, { key: "institution", label: "Institution" }, { key: "region", label: "Region" }, { key: "kind", label: "Kind" }, { key: "amount", label: "Amount", kind: "money" },
      { key: "state", label: "State" }, { key: "requested", label: "Requested", kind: "date" }, { key: "decided", label: "Decided", kind: "date" }, { key: "order_no", label: "Order no." },
    ],
    query: (scope) => sql`select i.case_no, n.name as institution, r.code as region, q.kind, i.amount_paise as amount, q.state, q.requested_at::date::text as requested, q.decided_at::date::text as decided, q.order_no
      from release_requests q join instruments i on i.id = q.instrument_id join institutions n on n.id = i.institution_id join regions r on r.id = n.region_id
      where ${scope} order by q.requested_at desc`,
  },
];

export const reportById = (id: string) => REPORTS.find((r) => r.id === id) ?? null;

export async function runReport(user: SessionUser, report: Report, today: string, limit?: number) {
  const q = report.query(scopeSql(user), today);
  const rows = await db.execute<Record<string, unknown>>(limit ? sql`select * from (${q}) t limit ${limit}` : q);
  return [...rows];
}

export async function reportCount(user: SessionUser, report: Report, today: string) {
  const [r] = await db.execute<{ n: number }>(sql`select count(*)::int as n from (${report.query(scopeSql(user), today)}) t`);
  return r.n;
}

export function formatCell(v: unknown, kind?: Column["kind"]) {
  if (v == null) return "";
  if (kind === "money") return (Number(v) / 100).toFixed(0);
  return String(v);
}

export function toCsv(report: Report, rows: Record<string, unknown>[]) {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const head = report.columns.map((c) => esc(c.kind === "money" ? `${c.label} (Rs)` : c.label)).join(",");
  return [head, ...rows.map((r) => report.columns.map((c) => esc(formatCell(r[c.key], c.kind))).join(","))].join("\n");
}
