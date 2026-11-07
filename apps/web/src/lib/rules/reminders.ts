/**
 * Which reminders an instrument has earned by "today" (demo-clock aware). Pure.
 *
 * - maturity: T-90 / T-60 / T-30 / T-7 notices to the institution while the
 *   deposit is neither renewed nor on its way back.
 * - renewal_overdue: once maturity + grace passes with no renewal, an
 *   escalation ladder institution -> maker -> checker -> authority, one step
 *   every `stepAfterDays`.
 */
import { addDays, daysBetween } from "./lanes";

export type Audience = "institution" | "maker" | "checker" | "authority";
export type DueReminder = { kind: "maturity" | "renewal_overdue"; offsetDays: number; level: number; dueOn: string; audience: Audience };

export type ReminderRules = {
  maturityOffsetsDays: readonly number[];
  renewalGraceDays: number;
  ladder: readonly Audience[];
  stepAfterDays: number;
};

export const DEFAULT_REMINDER_RULES: ReminderRules = {
  maturityOffsetsDays: [90, 60, 30, 7],
  renewalGraceDays: 15,
  ladder: ["institution", "maker", "checker", "authority"],
  stepAfterDays: 7,
};

export function dueReminders(
  i: { maturityDate: string | null; renewalStatus: string; releaseStatus: string },
  today: string,
  rules: ReminderRules = DEFAULT_REMINDER_RULES,
): DueReminder[] {
  if (!i.maturityDate) return [];
  if (["requested", "renewed", "replaced"].includes(i.renewalStatus)) return [];
  if (!["none", "rejected"].includes(i.releaseStatus)) return [];
  const out: DueReminder[] = [];
  const left = daysBetween(today, i.maturityDate);

  for (const off of rules.maturityOffsetsDays) {
    if (left <= off && left > -rules.renewalGraceDays) {
      out.push({ kind: "maturity", offsetDays: off, level: 0, dueOn: addDays(i.maturityDate, -off), audience: "institution" });
    }
  }

  const graceEnd = addDays(i.maturityDate, rules.renewalGraceDays);
  const over = daysBetween(graceEnd, today);
  if (over > 0) {
    const top = Math.min(rules.ladder.length - 1, Math.floor((over - 1) / rules.stepAfterDays));
    for (let level = 0; level <= top; level++) {
      out.push({ kind: "renewal_overdue", offsetDays: 0, level, dueOn: addDays(graceEnd, 1 + level * rules.stepAfterDays), audience: rules.ladder[level] });
    }
  }
  return out;
}

/** Of several reminders that fall due at once (a big clock jump), only the most urgent is sent; the rest are recorded as passed. */
export function mostUrgent(reminders: DueReminder[]): DueReminder | null {
  if (!reminders.length) return null;
  const esc = reminders.filter((r) => r.kind === "renewal_overdue").sort((a, b) => b.level - a.level);
  if (esc.length) return esc[0];
  return [...reminders].sort((a, b) => a.offsetDays - b.offsetDays)[0];
}

export function reminderText(r: DueReminder, c: { caseNo: string; institution: string; amount: string; maturityDate: string; bank: string }) {
  if (r.kind === "maturity") {
    return {
      subject: `${c.caseNo}: FDR matures in ${r.offsetDays} days (T-${r.offsetDays})`,
      body: `${c.institution}: your security-deposit FDR ${c.caseNo} (${c.amount}, ${c.bank}) matures on ${c.maturityDate}. Submit the renewed or replacement FDR, lien-marked to the Member Secretary, AICTE, before maturity so the deposit stays valid.`,
    };
  }
  const who = ["the institution", "the dealing officer", "the regional officer", "the competent authority"][r.level];
  return {
    subject: `${c.caseNo}: renewal overdue, escalated to ${who} (level ${r.level})`,
    body: `${c.caseNo} of ${c.institution} (${c.amount}) matured on ${c.maturityDate} and no renewed FDR has been received after the grace period. Escalated to ${who} for action.`,
  };
}
