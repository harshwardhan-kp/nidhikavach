/**
 * Validity and renewal lanes, derived from dates and "today" (demo clock aware).
 * Record, verification and release lanes move only by explicit actions.
 */
export type ValidityStatus = "valid" | "expiring" | "matured" | "expired" | "lien_unknown";
export type RenewalStatus = "not_due" | "due" | "requested" | "renewed" | "replaced" | "overdue";
export type ReleaseStatus = "none" | "requested" | "recommended" | "checked" | "approved" | "released" | "refunded" | "rejected";

export const EXPIRING_WINDOW_DAYS = 90;

export function daysBetween(fromIso: string, toIso: string) {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

export function addDays(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function validityLane(args: {
  maturityDate: string | null;
  today: string;
  lienIsAicte: boolean | null; // null = not known yet
  graceDays?: number;
}): ValidityStatus {
  const grace = args.graceDays ?? 15;
  if (args.maturityDate) {
    const left = daysBetween(args.today, args.maturityDate);
    if (left < -grace) return "expired";
    if (left <= 0) return "matured";
    if (args.lienIsAicte === false || args.lienIsAicte === null) return "lien_unknown";
    if (left <= EXPIRING_WINDOW_DAYS) return "expiring";
    return "valid";
  }
  return args.lienIsAicte ? "valid" : "lien_unknown";
}

export function renewalLane(args: {
  current: RenewalStatus;
  release: ReleaseStatus;
  maturityDate: string | null;
  today: string;
  graceDays?: number;
}): RenewalStatus {
  // Explicit states set by actions are sticky.
  if (["requested", "renewed", "replaced"].includes(args.current)) return args.current;
  // A release in progress or done suspends renewal: the deposit is on its way back.
  if (args.release !== "none" && args.release !== "rejected") return "not_due";
  if (!args.maturityDate) return "not_due";
  const left = daysBetween(args.today, args.maturityDate);
  if (left < -(args.graceDays ?? 15)) return "overdue";
  if (left <= EXPIRING_WINDOW_DAYS) return "due";
  return "not_due";
}
