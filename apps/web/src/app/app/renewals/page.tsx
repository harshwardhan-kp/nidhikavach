import type { Metadata } from "next";
import { LifecycleTable, Tabs } from "@/components/lifecycle-table";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { scopeLabel } from "@/modules/cases/scope";
import { RENEWAL_LABEL, RENEWAL_TABS, type RenewalTab, renewalCounts, renewalList } from "@/modules/lifecycle/queries";
import { lastReminders } from "@/modules/lifecycle/run";

export const metadata: Metadata = { title: "Renewals" };

const HINT: Record<RenewalTab, string> = {
  due: "Maturing within 90 days and no renewed FDR submitted yet. The institution is reminded at T-90, 60, 30 and 7.",
  requested: "The institution submitted a renewed or replacement FDR; the dealing officer verifies it like any new FDR. Accepting it closes the old link.",
  overdue: "Past maturity plus 15 days' grace with no renewal. Escalates one level a week: institution → dealing officer → regional officer → authority.",
  done: "Renewal accepted: the old FDR is closed and the chain continues on the new one.",
};

export default async function RenewalsPage({ searchParams }: PageProps<"/app/renewals">) {
  const user = await requireUser();
  const { tab: raw } = await searchParams;
  const [todayIso, counts] = await Promise.all([today(), renewalCounts(user)]);
  const tab = (RENEWAL_TABS as readonly string[]).includes(String(raw)) ? (raw as RenewalTab) : "due";
  const rows = await renewalList(user, tab);
  const reminders = await lastReminders(rows.map((r) => r.id));
  return (
    <>
      <PageHeader title="renewals" italic="& replacements" sub={`[${scopeLabel(user)}]`} />
      <Tabs base="/app/renewals" tabs={RENEWAL_TABS} active={tab} counts={counts} labels={RENEWAL_LABEL} tone={(t) => (t === "overdue" ? "red" : undefined)} />
      <p className="tag mb-3 text-[12px]">{HINT[tab]}</p>
      <LifecycleTable rows={rows} today={todayIso} reminders={reminders} />
    </>
  );
}
