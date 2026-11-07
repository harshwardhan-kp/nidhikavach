/**
 * Instrument fields compared across the three sources (declared, scan, bank),
 * plus the normalisers that decide whether two values agree. Pure module.
 */
export const FIELDS = [
  { key: "instrumentNo", label: "FDR number", critical: true },
  { key: "amount", label: "Amount", critical: true },
  { key: "issueDate", label: "Issue date", critical: false },
  { key: "maturityDate", label: "Maturity date", critical: true },
  { key: "ifsc", label: "IFSC / branch", critical: false },
  { key: "depositorName", label: "Depositor", critical: false },
  { key: "lienHolder", label: "Lien in favour of", critical: true },
  { key: "autoRenew", label: "Auto-renewal", critical: false },
] as const;

export type FieldKey = (typeof FIELDS)[number]["key"];
export type Match = "match" | "soft_match" | "mismatch" | "missing";

export const FIELD_LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label])) as Record<FieldKey, string>;

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

/** Any common Indian date spelling -> YYYY-MM-DD, or null. */
export function normaliseDate(v: string): string | null {
  const s = v.trim().toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1");
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  m = s.match(/^(\d{1,2})[\s.-]*([a-z]{3})[a-z]*[\s.,-]*(\d{4})$/);
  if (m && MONTHS[m[2]]) return `${m[3]}-${MONTHS[m[2]]}-${m[1].padStart(2, "0")}`;
  return null;
}

/** "₹10,00,000.00" / "1000000" / "10 lakh" -> rupees (integer), or null. */
export function normaliseAmount(v: string): number | null {
  const s = v.toLowerCase().replace(/rs\.?|inr|₹|\/-|,|\s/g, "");
  const lakh = s.match(/^([\d.]+)(lakh|lac|l)$/);
  if (lakh) return Math.round(parseFloat(lakh[1]) * 1e5);
  const crore = s.match(/^([\d.]+)(crore|cr)$/);
  if (crore) return Math.round(parseFloat(crore[1]) * 1e7);
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s));
}

const words = (v: string) =>
  v
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !["the", "of", "m", "s", "ms", "shri", "smt"].includes(w));

/** Token-set similarity in [0, 1]. */
export function nameSimilarity(a: string, b: string) {
  const A = new Set(words(a));
  const B = new Set(words(b));
  if (!A.size || !B.size) return 0;
  let common = 0;
  for (const w of A) if (B.has(w)) common++;
  return (2 * common) / (A.size + B.size);
}

export function isAicteLien(v: string | null | undefined) {
  if (!v) return false;
  const s = v.toLowerCase();
  return s.includes("aicte") || s.includes("all india council for technical education");
}

function parseBool(v: string): boolean | null {
  const s = v.trim().toLowerCase();
  if (["yes", "y", "true", "1", "auto renewal", "auto-renew", "auto renew"].includes(s)) return true;
  if (["no", "n", "false", "0", "none", "no auto renewal"].includes(s)) return false;
  return null;
}

/** Compares two raw values of one field: exact, equal after normalising (soft), or different. */
export function compare(field: FieldKey, a: string, b: string): Exclude<Match, "missing"> {
  if (a.trim() === b.trim()) return "match";
  switch (field) {
    case "instrumentNo": {
      const n = (x: string) => x.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^0+/, "");
      return n(a) === n(b) ? "soft_match" : "mismatch";
    }
    case "amount": {
      const x = normaliseAmount(a);
      const y = normaliseAmount(b);
      return x !== null && x === y ? "soft_match" : "mismatch";
    }
    case "issueDate":
    case "maturityDate": {
      const x = normaliseDate(a);
      const y = normaliseDate(b);
      return x !== null && x === y ? "soft_match" : "mismatch";
    }
    case "ifsc":
      return a.trim().toUpperCase() === b.trim().toUpperCase() ? "soft_match" : "mismatch";
    case "depositorName":
      return nameSimilarity(a, b) >= 0.85 ? "soft_match" : "mismatch";
    case "lienHolder":
      return isAicteLien(a) === isAicteLien(b) && nameSimilarity(a, b) >= 0.6 ? "soft_match" : "mismatch";
    case "autoRenew": {
      const x = parseBool(a);
      return x !== null && x === parseBool(b) ? "soft_match" : "mismatch";
    }
  }
}

export type FieldSources = { declared?: string | null; scan?: string | null; bank?: string | null };

/** Combines every available pair: any disagreement is a mismatch; nothing to compare is "missing". */
export function matchField(field: FieldKey, s: FieldSources): Match {
  const present = [s.declared, s.scan, s.bank].filter((v): v is string => v != null && v.trim() !== "");
  if (!s.declared?.trim() || present.length < 2) return "missing";
  let result: Match = "match";
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      const c = compare(field, present[i], present[j]);
      if (c === "mismatch") return "mismatch";
      if (c === "soft_match") result = "soft_match";
    }
  }
  return result;
}
