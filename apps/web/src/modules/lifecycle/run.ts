import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { appendLedger } from "@/lib/ledger";
import { isAicteLien } from "@/lib/rules/fields";
import { renewalLane, validityLane } from "@/lib/rules/lanes";
import { nextAction } from "@/lib/rules/next-action";
import { type Audience, DEFAULT_REMINDER_RULES, type DueReminder, dueReminders, mostUrgent, reminderText } from "@/lib/rules/reminders";
import { formatDate, formatPaise } from "@/lib/utils";

type Actor = { id: string; primaryRole: string } | null;

type Row = {
  id: string;
  case_no: string;
  institution_id: string;
  institution: string;
  nodal_email: string | null;
  region_id: number;
  bank_name: string;
  amount_paise: string;
  maturity_date: string | null;
  lien_holder: string | null;
  record_status: string;
  verification_status: string;
  validity_status: string;
  renewal_status: string;
  release_status: string;
  next_action: string | null;
  next_action_due: string | null;
  owner_user_id: string | null;
  open_disc: number;
  awaiting_check: number;
  letter_waiting: boolean;
  lien_values: (string | null)[] | null;
};

/** Who each role resolves to, per region / institution (same rule as recompute's ownerFor). */
async function loadOwners() {
  const officers = await db
    .select({ id: schema.users.id, email: schema.users.email, regionId: schema.users.regionId, institutionId: schema.users.institutionId, role: schema.userRoles.role })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .where(eq(schema.users.active, true));
  const pick = (role: string, regionId: number) => {
    const rows = officers.filter((o) => o.role === role);
    return (rows.find((r) => r.regionId === regionId) ?? rows.find((r) => r.regionId === null))?.id ?? null;
  };
  const institutionUser = new Map<string, { id: string; email: string }>();
  for (const o of officers) if (o.role === "institution" && o.institutionId && !institutionUser.has(o.institutionId)) institutionUser.set(o.institutionId, { id: o.id, email: o.email });
  return {
    of(role: Audience, regionId: number, institutionId: string) {
      return role === "institution" ? (institutionUser.get(institutionId)?.id ?? null) : pick(role, regionId);
    },
    institutionEmail: (institutionId: string) => institutionUser.get(institutionId)?.email ?? null,
  };
}

/** Appends many ledger entries in one round trip (the chain is extended row by row inside the statement). */
async function appendMany(actor: Actor, entries: { action: string; entityId: string; payload: object }[]) {
  for (let i = 0; i < entries.length; i += 400) {
    const chunk = entries.slice(i, i + 400);
    await db.execute(sql`
      select (ledger_append(${actor?.id ?? null}::uuid, ${actor?.primaryRole ?? "system"}, e.action, 'instrument', e.entity_id, e.payload)).seq
      from jsonb_to_recordset(${JSON.stringify(chunk.map((c, n) => ({ n, action: c.action, entity_id: c.entityId, payload: c.payload })))}::jsonb)
        as e(n int, action text, entity_id text, payload jsonb)
      order by e.n`);
  }
}

/**
 * The daily lifecycle pass (also run whenever the demo clock moves):
 * re-derives validity and renewal lanes from dates, refreshes next action and
 * owner, and sends the reminders and escalations that have fallen due.
 * `notify: false` records reminders as already sent (used right after seeding).
 */
export async function runLifecycle(todayIso: string, actor: Actor, opts: { reason: string; notify?: boolean }) {
  const t0 = Date.now();
  const notify = opts.notify ?? true;

  // Going back in time: forget reminders that have not happened yet (their messages go with them).
  const undone = await db.delete(schema.reminders).where(gt(schema.reminders.dueOn, todayIso)).returning({ id: schema.reminders.id });

  const rows = await db.execute<Row>(sql`
    select i.id, i.case_no, i.institution_id, n.name as institution, n.nodal_email, n.region_id, i.bank_name, i.amount_paise::text,
      i.maturity_date::text, i.lien_holder, i.record_status, i.verification_status, i.validity_status, i.renewal_status, i.release_status,
      i.next_action, i.next_action_due::text, i.owner_user_id,
      (select count(*)::int from discrepancies x where x.instrument_id = i.id and x.status not in ('closed','dismissed')) as open_disc,
      (select count(*)::int from discrepancies x where x.instrument_id = i.id and x.status = 'resolved_pending_check') as awaiting_check,
      exists (select 1 from verifications v where v.instrument_id = i.id and v.method = 'bank_letter' and v.status = 'running' and v.response ? 'letter') as letter_waiting,
      (select array[f.scan_value, f.bank_value] from instrument_fields f where f.instrument_id = i.id and f.field = 'lienHolder') as lien_values
    from instruments i join institutions n on n.id = i.institution_id
    where i.renewal_status not in ('renewed','replaced') and i.release_status not in ('released','refunded')`);

  const owners = await loadOwners();
  const updates: { id: string; validity: string; renewal: string; na: string | null; due: string | null; owner: string | null }[] = [];
  const ledger: { action: string; entityId: string; payload: object }[] = [];
  const dues = new Map<string, DueReminder[]>();

  for (const r of rows) {
    const lienValues = (r.lien_values ?? []).filter((v): v is string => !!v);
    const lienKnown = lienValues.length ? lienValues.every(isAicteLien) : r.lien_holder ? isAicteLien(r.lien_holder) : null;
    const validity = validityLane({ maturityDate: r.maturity_date, today: todayIso, lienIsAicte: lienKnown, graceDays: DEFAULT_REMINDER_RULES.renewalGraceDays });
    const renewal = renewalLane({ current: r.renewal_status as never, release: r.release_status as never, maturityDate: r.maturity_date, today: todayIso });
    const na = nextAction({
      recordStatus: r.record_status,
      verificationStatus: r.verification_status,
      validityStatus: validity,
      renewalStatus: renewal,
      releaseStatus: r.release_status,
      maturityDate: r.maturity_date,
      openDiscrepancies: r.open_disc,
      discrepanciesAwaitingCheck: r.awaiting_check,
      letterAwaitingCheck: r.letter_waiting,
      today: todayIso,
    });
    // Keep the due date of an unchanged action stable, so "due" does not drift each day.
    const due = na ? (na.text === r.next_action && r.next_action_due ? r.next_action_due : na.due) : null;
    const owner = na ? owners.of(na.role, r.region_id, r.institution_id) : null;
    if (validity !== r.validity_status || renewal !== r.renewal_status || (na?.text ?? null) !== r.next_action || due !== r.next_action_due || owner !== r.owner_user_id) {
      updates.push({ id: r.id, validity, renewal, na: na?.text ?? null, due, owner });
      if (validity !== r.validity_status) ledger.push({ action: "lifecycle.validity", entityId: r.id, payload: { from: r.validity_status, to: validity, today: todayIso } });
      if (renewal !== r.renewal_status) ledger.push({ action: "lifecycle.renewal", entityId: r.id, payload: { from: r.renewal_status, to: renewal, today: todayIso } });
    }
    const d = dueReminders({ maturityDate: r.maturity_date, renewalStatus: renewal, releaseStatus: r.release_status }, todayIso);
    if (d.length) dues.set(r.id, d);
  }

  // Bulk lane / next-action update.
  for (let i = 0; i < updates.length; i += 1000) {
    const chunk = updates.slice(i, i + 1000);
    await db.execute(sql`
      update instruments i set validity_status = u.validity::validity_status, renewal_status = u.renewal::renewal_status,
        next_action = u.na, next_action_due = u.due::date, owner_user_id = u.owner::uuid, updated_at = now()
      from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as u(id uuid, validity text, renewal text, na text, due text, owner text)
      where i.id = u.id`);
  }

  // Reminders: record every one that has fallen due; send only the most urgent new one per instrument.
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ids = [...dues.keys()];
  const existing = new Set<string>();
  for (let i = 0; i < ids.length; i += 2000) {
    const have = await db
      .select({ instrumentId: schema.reminders.instrumentId, kind: schema.reminders.kind, offsetDays: schema.reminders.offsetDays, level: schema.reminders.escalationLevel })
      .from(schema.reminders)
      .where(inArray(schema.reminders.instrumentId, ids.slice(i, i + 2000)));
    for (const h of have) existing.add(`${h.instrumentId}|${h.kind}|${h.offsetDays}|${h.level}`);
  }
  const fresh: { instrumentId: string; r: DueReminder; send: boolean }[] = [];
  for (const [id, list] of dues) {
    const missing = list.filter((r) => !existing.has(`${id}|${r.kind}|${r.offsetDays}|${r.level}`));
    if (!missing.length) continue;
    const top = mostUrgent(missing);
    for (const r of missing) fresh.push({ instrumentId: id, r, send: notify && r === top });
  }

  let sent = 0;
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500);
    const inserted = await db
      .insert(schema.reminders)
      .values(chunk.map((f) => ({ instrumentId: f.instrumentId, kind: f.r.kind, offsetDays: f.r.offsetDays, escalationLevel: f.r.level, dueOn: f.r.dueOn, ruleSetVersion: 1, firedAt: new Date() })))
      .onConflictDoNothing()
      .returning({ id: schema.reminders.id, instrumentId: schema.reminders.instrumentId, kind: schema.reminders.kind, offsetDays: schema.reminders.offsetDays, level: schema.reminders.escalationLevel });
    const key = (x: { instrumentId: string; kind: string; offsetDays: number | null; level: number }) => `${x.instrumentId}|${x.kind}|${x.offsetDays}|${x.level}`;
    const idOf = new Map(inserted.map((x) => [key(x), x.id]));

    const messages: (typeof schema.notifications.$inferInsert)[] = [];
    for (const f of chunk) {
      const reminderId = idOf.get(key({ instrumentId: f.instrumentId, kind: f.r.kind, offsetDays: f.r.offsetDays, level: f.r.level }));
      if (!reminderId || !f.send) continue;
      const c = byId.get(f.instrumentId)!;
      const text = reminderText(f.r, { caseNo: c.case_no, institution: c.institution, amount: formatPaise(Number(c.amount_paise)), maturityDate: formatDate(c.maturity_date), bank: c.bank_name });
      const link = `/app/cases/${c.case_no}`;
      const base = { instrumentId: f.instrumentId, reminderId, subject: text.subject, body: text.body, link };
      const to = owners.of(f.r.audience, c.region_id, c.institution_id);
      if (to) messages.push({ ...base, channel: "inbox", userId: to });
      // The institution always hears by email too; officers also get the T-30 and T-7 notices in their inbox.
      const email = c.nodal_email ?? owners.institutionEmail(c.institution_id);
      if (f.r.audience === "institution" && email) messages.push({ ...base, channel: "email", institutionId: c.institution_id, toAddress: email });
      if (f.r.kind === "maturity" && f.r.offsetDays <= 30) {
        const maker = owners.of("maker", c.region_id, c.institution_id);
        if (maker) messages.push({ ...base, channel: "inbox", userId: maker });
      }
      ledger.push({ action: "reminder.sent", entityId: f.instrumentId, payload: { kind: f.r.kind, offsetDays: f.r.offsetDays, level: f.r.level, audience: f.r.audience, dueOn: f.r.dueOn } });
      sent += 1;
    }
    if (messages.length) await db.insert(schema.notifications).values(messages);
  }

  await appendMany(actor, ledger);
  const stats = { today: todayIso, reason: opts.reason, instruments: rows.length, lanesChanged: updates.length, remindersRecorded: fresh.length, remindersSent: sent, undone: undone.length, ms: Date.now() - t0 };
  await appendLedger({ actor, action: "lifecycle.run", entity: "settings", entityId: "lifecycle", payload: stats });
  return stats;
}

/** Instruments with a reminder history, for the maturity watch (last notice per instrument). */
export async function lastReminders(instrumentIds: string[]) {
  if (!instrumentIds.length) return new Map<string, { kind: string; offsetDays: number | null; level: number; firedAt: Date | null }>();
  const rows = await db
    .selectDistinctOn([schema.reminders.instrumentId], {
      instrumentId: schema.reminders.instrumentId,
      kind: schema.reminders.kind,
      offsetDays: schema.reminders.offsetDays,
      level: schema.reminders.escalationLevel,
      firedAt: schema.reminders.firedAt,
    })
    .from(schema.reminders)
    .where(and(inArray(schema.reminders.instrumentId, instrumentIds)))
    .orderBy(schema.reminders.instrumentId, sql`${schema.reminders.dueOn} desc`, sql`${schema.reminders.escalationLevel} desc`);
  return new Map(rows.map((r) => [r.instrumentId, r]));
}
