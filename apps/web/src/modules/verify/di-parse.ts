import type { FieldKey } from "@/lib/rules/fields";

/** Pure parsing of Document Intelligence output (no I/O, safe to unit-test). */
type KV = { key: { content: string }; value?: { content: string }; confidence: number };
export type DiResult = { content: string; keyValuePairs?: KV[]; pages?: { pageNumber: number; width: number; height: number }[] };

const KEY_PATTERNS: [FieldKey, RegExp][] = [
  ["instrumentNo", /(receipt|fdr?|deposit|account|a\/c)\s*(no|number|#)/i],
  ["amount", /(principal|deposit(ed)?)\s*amount|^amount\b|amount of deposit/i],
  ["issueDate", /(date of deposit|deposit date|issue date|date of issue|opening date|value date)/i],
  ["maturityDate", /(maturity date|due date|date of maturity)/i],
  ["depositorName", /(depositor|in the name of|customer name|name of the depositor)/i],
  ["lienHolder", /(lien|in favou?r of)/i],
  ["autoRenew", /auto.?renew/i],
  ["ifsc", /ifsc/i],
];

export type Reading = { value: string | null; confidence: number };

const DATE_RE = /\d{4}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{1,2}[\s-]*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s,.-]*\d{4}/gi;
// OCR often reads the IFSC's fixed fifth character (always zero) as the letter O.
const IFSC_LOOSE = /\b([A-Z]{4})[0O]([A-Z0-9]{6})\b/;

/** Pulls the field's actual value out of text that OCR may have run together with neighbours. */
function clean(field: FieldKey, raw: string): string | null {
  const v = raw.replace(/\s+/g, " ").trim();
  if (field === "issueDate" || field === "maturityDate") {
    const dates = v.match(DATE_RE);
    return dates ? dates[dates.length - 1] : null;
  }
  if (field === "amount") {
    const m = v.match(/(?:rs\.?|₹|inr)?\s*[\d,]{4,}(?:\.\d{1,2})?/i);
    return m ? m[0].trim() : null;
  }
  if (field === "ifsc") {
    const m = v.toUpperCase().match(IFSC_LOOSE);
    return m ? `${m[1]}0${m[2]}` : null;
  }
  if (field === "instrumentNo") {
    const tokens = v.toUpperCase().replace(/(\d)\s+(?=\d)/g, "$1").match(/[A-Z0-9/-]{6,24}/g);
    return tokens ? tokens.sort((a, b) => b.length - a.length)[0] : null;
  }
  return v || null;
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALE: Record<string, number> = { hundred: 100, thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, crore: 10_000_000, crores: 10_000_000 };

/** "Twenty Five Lakh Fifty Thousand" -> 2550000 (Indian numbering). Null if any word is unknown. */
export function wordsToRupees(words: string): number | null {
  let total = 0;
  let chunk = 0;
  for (const w of words.toLowerCase().replace(/-/g, " ").split(/\s+/).filter((x) => x && x !== "and")) {
    if (w in UNITS) chunk += UNITS[w];
    else if (w === "hundred") chunk *= 100;
    else if (w in SCALE) {
      total += (chunk || 1) * SCALE[w];
      chunk = 0;
    } else return null;
  }
  const n = total + chunk;
  return n > 0 ? n : null;
}

/** Maps Document Intelligence output onto our fields: key-value pairs first, then patterns over the full text. */
export function fieldsFromDi(r: DiResult): Partial<Record<FieldKey, Reading>> {
  const out: Partial<Record<FieldKey, Reading>> = {};
  for (const kv of r.keyValuePairs ?? []) {
    const key = kv.key.content.replace(/\s+/g, " ").trim();
    const value = kv.value?.content?.replace(/\s+/g, " ").trim();
    if (!value) continue;
    for (const [field, re] of KEY_PATTERNS) {
      if (re.test(key) && !out[field]) {
        // "Due Date of Maturity" must not be read as a deposit date.
        if (field === "issueDate" && /maturity|due/i.test(key)) continue;
        const cleaned = clean(field, value);
        if (cleaned) out[field] = { value: cleaned, confidence: cleaned === value ? kv.confidence : kv.confidence * 0.9 };
        break;
      }
    }
  }
  const text = r.content ?? "";
  if (!out.ifsc) {
    const m = text.match(IFSC_LOOSE);
    if (m) out.ifsc = { value: `${m[1]}0${m[2]}`, confidence: 0.8 };
  }
  if (!out.amount) {
    // The maturity value and interest are amounts too; never mistake them for the principal.
    const principalText = text.replace(/(maturity (value|amount)|interest)[^\n]*\n?[^\n]*/gi, "");
    const m = text.match(/PRINCIPAL AMOUNT[\s\S]{0,40}?(Rs\.?\s*[\d,]+(?:\.\d{2})?)/i) ?? principalText.match(/(?:Rs\.?|₹)\s*([\d,]{5,}(?:\.\d{2})?)/);
    if (m) out.amount = { value: m[1], confidence: 0.75 };
    else {
      const w = principalText.match(/rupees\s+([a-z\s-]+?)\s+only/i);
      const n = w ? wordsToRupees(w[1]) : null;
      if (n) out.amount = { value: String(n), confidence: 0.7 };
    }
  }
  if (!out.lienHolder) {
    const m = text.match(/IN FAVOU?R OF:?\s*\n?([^\n]{3,80})/i);
    if (m) out.lienHolder = { value: m[1].trim(), confidence: 0.75 };
  }
  return out;
}
