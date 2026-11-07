import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";

const one = async <T>(q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as T[])[0];

/** Live measurements from this prototype's own records, for the six PS scenarios. */
export async function measure(today: string) {
  const [scan, bank, letter, life, coverage, reminders, disc, release, sod, ledger] = await Promise.all([
    one<{ n: number; median_s: number | null; agree: number | null }>(sql`
      select count(*)::int as n, round((percentile_cont(0.5) within group (order by (extraction->>'ms')::numeric) / 1000)::numeric, 1)::float as median_s,
        round(avg((select count(*) from jsonb_each(extraction->'fields') f where (f.value->>'agree')::boolean))::numeric, 1)::float as agree
      from documents where extraction ? 'ms'`),
    // Live actions only: the seed writes rows but no bank.* ledger entries.
    one<{ n: number; median_s: number | null; aa: number; nesl: number }>(sql`
      select count(*)::int as n, round(percentile_cont(0.5) within group (order by extract(epoch from b.ts - a.ts))::numeric, 1)::float as median_s,
        count(*) filter (where a.payload->>'method' = 'account_aggregator')::int as aa, count(*) filter (where a.payload->>'method' = 'nesl')::int as nesl
      from audit_ledger a join audit_ledger b on b.action in ('bank.answered','bank.no_record') and b.payload->>'verificationId' = a.payload->>'verificationId'
      where a.action = 'bank.confirmation_requested'`),
    one<{ n: number }>(sql`select count(*)::int as n from audit_ledger where action = 'bank.letter_confirmed'`),
    one<{ payload: { instruments: number; ms: number; lanesChanged: number; remindersSent: number } | null; runs: number }>(sql`
      select (select payload from audit_ledger where action = 'lifecycle.run' order by seq desc limit 1) as payload, (select count(*)::int from audit_ledger where action = 'lifecycle.run') as runs`),
    one<{ due: number; covered: number }>(sql`
      select count(*)::int as due, count(*) filter (where exists (select 1 from reminders m where m.instrument_id = i.id))::int as covered
      from instruments i
      where i.maturity_date between ${today}::date and ${today}::date + 90 and i.renewal_status in ('due','not_due') and i.release_status in ('none','rejected')
        and not (i.issue_date is not null and (i.issue_date + interval '10 years')::date <= i.maturity_date)`),
    one<{ maturity: number; escalations: number; emails: number }>(sql`
      select (select count(*) from reminders where kind = 'maturity')::int as maturity, (select count(*) from reminders where kind = 'renewal_overdue')::int as escalations,
        (select count(*) from notifications where channel = 'email')::int as emails`),
    one<{ open: number; auto: number; manual: number; closed: number; median_close_days: number | null }>(sql`
      select count(*) filter (where status not in ('closed','dismissed'))::int as open, count(*) filter (where auto_raised)::int as auto, count(*) filter (where not auto_raised)::int as manual,
        count(*) filter (where status = 'closed')::int as closed,
        round(percentile_cont(0.5) within group (order by extract(epoch from closed_at - raised_at) / 86400) filter (where closed_at is not null)::numeric, 1)::float as median_close_days
      from discrepancies`),
    one<{ decided: number; median_hours: number | null; orders: number }>(sql`
      select count(*) filter (where decided_at is not null)::int as decided,
        round(percentile_cont(0.5) within group (order by extract(epoch from decided_at - requested_at) / 3600) filter (where decided_at is not null)::numeric, 1)::float as median_hours,
        count(order_no)::int as orders
      from release_requests`),
    one<{ breaches: number; requests: number }>(sql`
      select count(*) filter (where n <> d)::int as breaches, count(*)::int as requests from (
        select q.id, count(x.a) as n, count(distinct x.a) as d from release_requests q
        cross join lateral (select q.requested_by as a where q.requested_by is not null union all select actor_id from approvals where release_request_id = q.id) x
        group by q.id) t`),
    one<{ entries: number }>(sql`select count(*)::int as entries from audit_ledger`),
  ]);
  return { scan, bank, letter, life, coverage, reminders, disc, release, sod, ledger };
}
