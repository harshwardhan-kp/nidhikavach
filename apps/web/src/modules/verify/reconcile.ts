import { compare, FIELDS, type FieldKey } from "@/lib/rules/fields";
import type { Reading } from "./di-parse";

/** What the vision model returns per field (subset used here). */
type ModelRead = { fields: Partial<Record<FieldKey, { value: string | null; confidence: number } | null>> };

export type Reconciled = { value: string | null; confidence: number; source: "di+llm" | "di" | "llm" | null; agree: boolean | null; di: string | null; llm: string | null };

/** A1: two independent readers; agreement raises confidence, disagreement flags the field. */
/**
 * On disagreement the reading that matches an independent reference (the
 * declaration or the bank's answer) is kept, at reduced confidence; with no
 * such tie-break the more confident reader wins.
 */
export function reconcile(di: Partial<Record<FieldKey, Reading>>, llm: ModelRead | null, refs: Partial<Record<FieldKey, (string | null | undefined)[]>> = {}): Record<FieldKey, Reconciled> {
  const out = {} as Record<FieldKey, Reconciled>;
  for (const f of FIELDS) {
    const a = di[f.key];
    const b = llm?.fields[f.key];
    const av = a?.value?.trim() || null;
    const bv = b?.value?.trim() || null;
    if (av && bv) {
      const c = compare(f.key, av, bv);
      if (c !== "mismatch") {
        out[f.key] = { value: av, confidence: Math.min(0.99, Math.max(a!.confidence, b!.confidence) + 0.05), source: "di+llm", agree: true, di: av, llm: bv };
      } else {
        const ref = (refs[f.key] ?? []).filter((r): r is string => !!r);
        const backs = (v: string) => ref.some((r) => compare(f.key, r, v) !== "mismatch");
        const tie = backs(av) !== backs(bv) ? (backs(av) ? av : bv) : null;
        const pick = tie ?? ((b!.confidence ?? 0) > (a!.confidence ?? 0) ? bv : av);
        out[f.key] = { value: pick, confidence: tie ? 0.6 : 0.4, source: pick === av ? "di" : "llm", agree: false, di: av, llm: bv };
      }
    } else if (av || bv) {
      out[f.key] = { value: av ?? bv, confidence: Math.round((av ? a!.confidence : b!.confidence) * 0.8 * 100) / 100, source: av ? "di" : "llm", agree: null, di: av, llm: bv };
    } else {
      out[f.key] = { value: null, confidence: 0, source: null, agree: null, di: null, llm: null };
    }
  }
  return out;
}
