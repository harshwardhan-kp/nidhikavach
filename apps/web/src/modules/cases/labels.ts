/** Display labels and tones for lane values. Pure (client-safe). */
export type Tone = "neutral" | "red" | "amber" | "green" | "blue" | "dark";

export const LANE_VALUES = {
  record: ["draft", "submitted", "under_scrutiny", "accepted", "returned", "rejected"],
  verification: ["unverified", "pending_bank", "bank_confirmed", "mismatch", "unavailable", "manual_confirmed"],
  validity: ["valid", "expiring", "matured", "expired", "lien_unknown"],
  renewal: ["not_due", "due", "requested", "renewed", "replaced", "overdue"],
  release: ["none", "requested", "recommended", "checked", "approved", "released", "refunded", "rejected"],
} as const;
export type Lane = keyof typeof LANE_VALUES;

const TONE: Record<string, Tone> = {
  // record
  draft: "neutral", submitted: "blue", under_scrutiny: "blue", accepted: "green", returned: "amber", rejected: "red",
  // verification
  unverified: "neutral", pending_bank: "amber", bank_confirmed: "green", mismatch: "red", unavailable: "amber", manual_confirmed: "green",
  // validity
  valid: "green", expiring: "amber", matured: "neutral", expired: "red", lien_unknown: "red",
  // renewal
  not_due: "neutral", due: "amber", requested: "blue", renewed: "green", replaced: "green", overdue: "red",
  // release
  none: "neutral", recommended: "blue", checked: "blue", approved: "green", released: "dark", refunded: "dark",
};

export const toneOf = (value: string): Tone => TONE[value] ?? "neutral";
export const label = (value: string) => value.replaceAll("_", " ");

export const RISK_TONE: Record<string, Tone> = { red: "red", amber: "amber", green: "green", unscored: "neutral" };

export const TYPE_LABEL: Record<string, string> = { fdr: "FDR", efdr: "e-FDR", bg: "Bank guarantee", ebg: "e-BG", dd: "Demand draft" };
