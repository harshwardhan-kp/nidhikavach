import type { Metadata } from "next";
import { Button, Card, PageHeader, Simulated } from "@/components/ui";
import { requirePermission } from "@/lib/auth/session";
import { getClockOffsetDays, istDate, today } from "@/lib/clock";
import { formatDate } from "@/lib/utils";
import { moveClock } from "./actions";

export const metadata: Metadata = { title: "Admin" };

const STEPS = [7, 30, 60, 90, 365];

export default async function AdminPage() {
  await requirePermission("admin.clock");
  const [offset, todayIso] = await Promise.all([getClockOffsetDays(), today()]);

  return (
    <>
      <PageHeader title="system" italic="admin" sub="[demo controls · rule sets · users]" />
      <Card className="max-w-[640px] p-5">
        <div className="flex items-center gap-2">
          <span className="kicker">demo clock</span>
          <Simulated what="demo only" />
        </div>
        <p className="mt-2 text-[13px] text-txt">
          Moves the portal&apos;s idea of “today” so the pitch can show T-90 → T-7 reminders, maturity and escalation without waiting.
        </p>
        <div className="mt-4 flex items-baseline gap-3">
          <span className="font-serif text-[30px]">{formatDate(todayIso)}</span>
          <span className="tag text-[12px]">
            [real date {formatDate(istDate(new Date()))} · offset {offset >= 0 ? `+${offset}` : offset} days]
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {STEPS.map((d) => (
            <form key={d} action={moveClock}>
              <input type="hidden" name="mode" value="add" />
              <input type="hidden" name="days" value={d} />
              <Button type="submit" variant="light" size="sm">
                +{d} days
              </Button>
            </form>
          ))}
          <form action={moveClock}>
            <input type="hidden" name="mode" value="reset" />
            <Button type="submit" variant="ghost" size="sm" disabled={offset === 0}>
              reset to real date
            </Button>
          </form>
        </div>
      </Card>
    </>
  );
}
