import type { Metadata } from "next";
import { Card, PageHeader, Simulated } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { formatDate } from "@/lib/utils";
import { measure } from "@/modules/oversight/metrics";

export const metadata: Metadata = { title: "Metrics" };

const n = (v: number | null | undefined, unit = "") => (v == null ? "—" : `${v.toLocaleString("en-IN")}${unit}`);

export default async function MetricsPage() {
  await requirePermission("reports.view");
  const todayIso = await today();
  const m = await measure(todayIso);
  const coverage = m.coverage.due ? Math.round((m.coverage.covered / m.coverage.due) * 100) : null;

  const scenarios = [
    {
      title: "1 · New FDR submission",
      before: "Physical FDR posted or handed in; details typed into a register; the bank is asked by letter. Typically days to weeks before anyone knows the FDR is genuine.",
      after: [
        m.scan.n ? `Scan read by two independent readers in a median ${n(m.scan.median_s, " s")} (${n(m.scan.n)} scans read; ${n(m.scan.agree)} of 8 fields agree on average).` : "Scan reading: not measured yet. Submit an FDR or read a scan on any case.",
        m.bank.n ? `Bank answer over Account Aggregator / NeSL in a median ${n(m.bank.median_s, " s")} (${n(m.bank.aa)} AA, ${n(m.bank.nesl)} NeSL).` : "Bank confirmation: not measured yet. Ask the bank on any case.",
        `Banks off the network: a letter recorded by one officer and confirmed by another (${n(m.letter.n)} confirmed in this session's data).`,
      ],
      how: "documents.extraction.ms; verifications requested → completed",
    },
    {
      title: "2 · Validity tracking",
      before: "A spreadsheet or register reviewed periodically; a lapsed lien or matured FDR is noticed late, if at all.",
      after: [
        m.life.payload ? `Every live FDR (${n(m.life.payload.instruments)}) is re-derived on each pass in ${n(m.life.payload.ms, " ms")}; ${n(m.life.runs)} passes logged (daily cron + every demo-clock move).` : "Lifecycle pass not run yet.",
        "Five separate status lanes (record, verification, validity, renewal, release), so one problem never hides another.",
      ],
      how: "last lifecycle.run entry on the audit ledger",
    },
    {
      title: "3 · Approaching maturity",
      before: "No systematic reminder; the institution or the officer has to remember the date.",
      after: [`${coverage == null ? "—" : `${coverage}%`} of FDRs maturing in the next 90 days have had their reminder (${n(m.coverage.covered)} of ${n(m.coverage.due)}).`, `${n(m.reminders.maturity)} T-90/60/30/7 reminders recorded; ${n(m.reminders.emails)} emails in the outbox.`],
      how: "reminders vs FDRs maturing within 90 days that still need renewal",
    },
    {
      title: "4 · Renewal",
      before: "Follow-up letters and calls; the new FDR is linked to the old one by hand, and overdue renewals have no escalation path.",
      after: [`Escalation ladder institution → dealing officer → regional officer → authority, one step a week after 15 days' grace: ${n(m.reminders.escalations)} escalation steps recorded.`, "Accepting the renewal closes the old link and keeps one chain per deposit."],
      how: "reminders of kind renewal_overdue; renewal.* ledger entries",
    },
    {
      title: "5 · Discrepancy",
      before: "Found when a bank letter comes back weeks later; tracked in paper files without an owner or a due date.",
      after: [`${n(m.disc.auto)} of ${n(m.disc.auto + m.disc.manual)} discrepancies were raised automatically (scan vs declaration vs bank, tamper scan); each has an owner and a 15-day due date.`, `Closing needs a second officer: ${n(m.disc.closed)} closed${m.disc.median_close_days != null ? `, median ${n(m.disc.median_close_days, " days")} to close` : ""}.`],
      how: "discrepancies.auto_raised, raised_at → closed_at",
    },
    {
      title: "6 · Authorised release",
      before: "Paper file noting with three signatures; the release order cannot be checked by the bank or the institution.",
      after: [
        m.release.orders ? `${n(m.release.orders)} release orders eSigned; median ${n(m.release.median_hours, " h")} from request to decision.` : "No release order signed yet. FDR-16-07734 waits for the competent authority.",
        `Separation of duties: ${n(m.sod.breaches)} breaches in ${n(m.sod.requests)} requests (the system refuses a second step by the same person). Every order has a public QR verify page.`,
      ],
      how: "release_requests requested → decided; approvals actors",
    },
  ];

  return (
    <>
      <PageHeader title="measurable" italic="improvement" sub={`[six PS scenarios · measured live on this prototype's data · ${formatDate(todayIso)}]`}>
        <Simulated what="synthetic data · baseline is a written estimate" />
      </PageHeader>
      <div className="grid gap-3 lg:grid-cols-2">
        {scenarios.map((s) => (
          <Card key={s.title} className="flex flex-col p-5">
            <div className="kicker">{s.title}</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[10px] border border-dashed border-line px-3 py-2.5">
                <div className="tag">[manual today · estimate]</div>
                <p className="mt-1 text-[12.5px] text-txt">{s.before}</p>
              </div>
              <div className="rounded-[10px] border border-green/40 bg-green-soft/30 px-3 py-2.5">
                <div className="tag">[with nidhikavach · measured]</div>
                <ul className="mt-1 flex flex-col gap-1.5 text-[12.5px]">
                  {s.after.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="tag mt-3">[source: {s.how}]</p>
          </Card>
        ))}
      </div>
      <p className="tag mt-4 text-[12px]">
        The manual column is our written estimate of today&apos;s process, to be validated with the Regulation Bureau. The measured column is computed from this prototype&apos;s audit ledger ({n(m.ledger.entries)} entries) and tables on every page load.
      </p>
    </>
  );
}
