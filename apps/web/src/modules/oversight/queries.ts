import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

export type RegionRow = {
  id: number;
  code: string;
  name: string;
  active: number;
  amount_paise: string;
  expiring: number;
  overdue: number;
  red: number;
  pending_bank: number;
  open_disc: number;
  stale_disc: number;
  releases: number;
};

const LIVE = sql`i.renewal_status not in ('renewed','replaced') and i.release_status not in ('released','refunded')`;

/** One row per region (HQ roles only): the numbers a bureau head scans first. */
export async function regionBreakdown(user: SessionUser, today: string) {
  if (!can(user.roles, "instrument.view_all")) return null;
  return db.execute<RegionRow>(sql`
    select r.id, r.code, r.name,
      count(i.id) filter (where ${LIVE})::int as active,
      coalesce(sum(i.amount_paise) filter (where ${LIVE}), 0)::text as amount_paise,
      count(*) filter (where ${LIVE} and i.maturity_date between ${today}::date and ${today}::date + 90)::int as expiring,
      count(*) filter (where i.renewal_status = 'overdue' and i.release_status not in ('released','refunded'))::int as overdue,
      count(*) filter (where ${LIVE} and i.risk_band = 'red')::int as red,
      count(*) filter (where ${LIVE} and i.verification_status in ('unverified','pending_bank','unavailable'))::int as pending_bank,
      coalesce(sum(d.open_disc), 0)::int as open_disc,
      coalesce(sum(d.stale_disc), 0)::int as stale_disc,
      count(*) filter (where i.release_status in ('requested','recommended','checked','approved'))::int as releases
    from regions r
    left join institutions n on n.region_id = r.id
    left join instruments i on i.institution_id = n.id
    left join lateral (
      select count(*) filter (where x.status not in ('closed','dismissed')) as open_disc,
             count(*) filter (where x.status not in ('closed','dismissed') and x.due_at < ${today}::date) as stale_disc
      from discrepancies x where x.instrument_id = i.id
    ) d on true
    group by r.id order by r.id`);
}

/** Facts for the weekly bureau briefing (A10): only aggregates, no personal data. */
export async function briefingFacts(user: SessionUser, today: string) {
  const regions = (await regionBreakdown(user, today)) ?? [];
  const [week] = await db.execute<{ maturing_7: number; maturing_30: number; renewals_in_7d: number; disc_raised_7d: number; disc_closed_7d: number; releases_signed_7d: number; reminders_7d: number; escalations_7d: number }>(sql`
    select
      (select count(*) from instruments i where ${LIVE} and i.maturity_date between ${today}::date and ${today}::date + 7)::int as maturing_7,
      (select count(*) from instruments i where ${LIVE} and i.maturity_date between ${today}::date and ${today}::date + 30)::int as maturing_30,
      (select count(*) from audit_ledger where action = 'renewal.accepted' and ts > now() - interval '7 days')::int as renewals_in_7d,
      (select count(*) from audit_ledger where action in ('discrepancy.raised','discrepancy.auto_raised') and ts > now() - interval '7 days')::int as disc_raised_7d,
      (select count(*) from audit_ledger where action = 'discrepancy.close' and ts > now() - interval '7 days')::int as disc_closed_7d,
      (select count(*) from audit_ledger where action = 'release.approved' and ts > now() - interval '7 days')::int as releases_signed_7d,
      (select count(*) from reminders where kind = 'maturity' and due_on > ${today}::date - 7)::int as reminders_7d,
      (select count(*) from reminders where kind = 'renewal_overdue' and due_on > ${today}::date - 7)::int as escalations_7d`);
  const stuck = await db.execute<{ case_no: string; region: string; next_action: string; days_overdue: number; amount_paise: string }>(sql`
    select i.case_no, r.code as region, i.next_action, (${today}::date - i.next_action_due)::int as days_overdue, i.amount_paise::text
    from instruments i join institutions n on n.id = i.institution_id join regions r on r.id = n.region_id
    where ${LIVE} and i.next_action_due < ${today}::date
    order by i.next_action_due asc, i.amount_paise desc limit 6`);
  return {
    today,
    regions: regions.map((r) => ({ region: r.code, name: r.name, active: r.active, amountCrore: Math.round(Number(r.amount_paise) / 1e9) / 1, expiring90: r.expiring, overdue: r.overdue, red: r.red, awaitingBank: r.pending_bank, openDiscrepancies: r.open_disc, discrepanciesPastDue: r.stale_disc, releasesInFlight: r.releases })),
    week,
    stuck: [...stuck].map((s) => ({ caseNo: s.case_no, region: s.region, nextAction: s.next_action, daysOverdue: s.days_overdue, amountLakh: Math.round(Number(s.amount_paise) / 1e7) })),
  };
}
