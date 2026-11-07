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

/** The ten-year hold (APH cl. 1.12(iv)) ends on the same calendar date ten years on. */
export const HOLD_YEARS = 10;
export function holdEnds(issueDate: string) {
  const y = Number(issueDate.slice(0, 4)) + HOLD_YEARS;
  const md = issueDate.slice(5);
  return md === "02-29" ? addDays(`${y}-02-28`, 1) : `${y}-${md}`;
}

/** True when this FDR runs to (or past) the end of the hold: no renewal needed, release is next. */
export function holdCompleteAtMaturity(issueDate: string | null | undefined, maturityDate: string | null | undefined) {
  return !!issueDate && !!maturityDate && holdEnds(issueDate) <= maturityDate;
}

export function validityLane(args: {
  maturityDate: string | null;
  today: string;
  lienIsAicte: boolean | null; // null = not known yet
  graceDays?: number;
  issueDate?: string | null;
}): ValidityStatus {
  const grace = args.graceDays ?? 15;
  if (args.maturityDate) {
    const left = daysBetween(args.today, args.maturityDate);
    if (left < -grace) return holdCompleteAtMaturity(args.issueDate, args.maturityDate) ? "matured" : "expired";
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
  issueDate?: string | null;
}): RenewalStatus {
  // Explicit states set by actions are sticky.
  if (["requested", "renewed", "replaced"].includes(args.current)) return args.current;
  // The hold ends with this FDR: it is released, not renewed.
  if (holdCompleteAtMaturity(args.issueDate, args.maturityDate)) return "not_due";
  // A release in progress or done suspends renewal: the deposit is on its way back.
  if (args.release !== "none" && args.release !== "rejected") return "not_due";
  if (!args.maturityDate) return "not_due";
  const left = daysBetween(args.today, args.maturityDate);
  if (left < -(args.graceDays ?? 15)) return "overdue";
  if (left <= EXPIRING_WINDOW_DAYS) return "due";
  return "not_due";
}
