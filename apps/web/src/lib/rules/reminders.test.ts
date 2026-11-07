import { describe, expect, it } from "vitest";
import { dueReminders, mostUrgent } from "./reminders";

const live = { maturityDate: "2026-12-22", renewalStatus: "due", releaseStatus: "none" };

describe("dueReminders", () => {
  it("earns maturity notices as the date approaches", () => {
    expect(dueReminders(live, "2026-09-01")).toEqual([]);
    expect(dueReminders(live, "2026-11-07").map((r) => r.offsetDays)).toEqual([90, 60]);
    expect(dueReminders(live, "2026-12-20").map((r) => r.offsetDays)).toEqual([90, 60, 30, 7]);
  });

  it("stops once a renewal is submitted or a release is under way", () => {
    expect(dueReminders({ ...live, renewalStatus: "requested" }, "2026-12-20")).toEqual([]);
    expect(dueReminders({ ...live, releaseStatus: "recommended" }, "2026-12-20")).toEqual([]);
  });

  it("climbs the escalation ladder one step a week after the grace period", () => {
    // grace ends 6 Jan 2027
    expect(dueReminders(live, "2027-01-06").filter((r) => r.kind === "renewal_overdue")).toEqual([]);
    const day1 = dueReminders(live, "2027-01-07").filter((r) => r.kind === "renewal_overdue");
    expect(day1.map((r) => r.audience)).toEqual(["institution"]);
    const week3 = dueReminders(live, "2027-01-21").filter((r) => r.kind === "renewal_overdue");
    expect(week3.map((r) => r.audience)).toEqual(["institution", "maker", "checker"]);
    const late = dueReminders(live, "2027-06-01").filter((r) => r.kind === "renewal_overdue");
    expect(late.at(-1)?.audience).toBe("authority");
    expect(late).toHaveLength(4);
  });

  it("sends only the most urgent of several", () => {
    expect(mostUrgent(dueReminders(live, "2026-12-20"))?.offsetDays).toBe(7);
    expect(mostUrgent(dueReminders(live, "2027-01-21"))?.audience).toBe("checker");
  });
});
