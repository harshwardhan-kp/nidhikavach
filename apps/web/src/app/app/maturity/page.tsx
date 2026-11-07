import type { Metadata } from "next";
import { LifecycleTable, Tabs } from "@/components/lifecycle-table";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { formatDate } from "@/lib/utils";
import { scopeLabel } from "@/modules/cases/scope";
import { BUCKET_LABEL, MATURITY_BUCKETS, type MaturityBucket, maturityCounts, maturityList } from "@/modules/lifecycle/queries";
import { lastReminders } from "@/modules/lifecycle/run";

export const metadata: Metadata = { title: "Maturity watch" };

export default async function MaturityPage({ searchParams }: PageProps<"/app/maturity">) {
  const user = await requireUser();
  const { tab: raw } = await searchParams;
  const todayIso = await today();
  const counts = await maturityCounts(user, todayIso);
  const tab = (MATURITY_BUCKETS as readonly string[]).includes(String(raw)) ? (raw as MaturityBucket) : (MATURITY_BUCKETS.find((b) => counts[b] > 0) ?? "30");
  const rows = await maturityList(user, todayIso, tab);
  const reminders = await lastReminders(rows.map((r) => r.id));
  return (
    <>
      <PageHeader title="maturity" italic="watch" sub={`[${scopeLabel(user)} · as of ${formatDate(todayIso)} · reminders at T-90, 60, 30, 7, then escalation]`} />
      <Tabs base="/app/maturity" tabs={MATURITY_BUCKETS} active={tab} counts={counts} labels={BUCKET_LABEL} tone={(b) => (b === "7" || b === "grace" || b === "expired" ? "red" : undefined)} />
      <LifecycleTable rows={rows} today={todayIso} reminders={reminders} />
    </>
  );
}
