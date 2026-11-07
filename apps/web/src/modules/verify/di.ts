import "server-only";
import { env } from "@/lib/env";
import type { FieldKey } from "@/lib/rules/fields";

/**
 * Azure AI Document Intelligence (prebuilt-layout + key-value pairs).
 * The document is passed by a short-lived signed URL, so no bytes flow
 * through Vercel. F0 tier: first two pages of each document.
 */
const API = "2024-11-30";

type KV = { key: { content: string }; value?: { content: string }; confidence: number };
export type DiResult = { content: string; keyValuePairs?: KV[]; pages?: { pageNumber: number; width: number; height: number }[] };

export async function analyzeLayout(url: string): Promise<DiResult> {
  if (!env.AZURE_DI_ENDPOINT || !env.AZURE_DI_KEY) throw new Error("Document Intelligence is not configured");
  const start = await fetch(`${env.AZURE_DI_ENDPOINT}/documentintelligence/documentModels/prebuilt-layout:analyze?api-version=${API}&features=keyValuePairs`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": env.AZURE_DI_KEY, "content-type": "application/json" },
    body: JSON.stringify({ urlSource: url }),
  });
  if (start.status !== 202) throw new Error(`Document Intelligence ${start.status}: ${(await start.text()).slice(0, 200)}`);
  const op = start.headers.get("operation-location")!;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, i < 3 ? 1200 : 1000));
    const res = await fetch(op, { headers: { "Ocp-Apim-Subscription-Key": env.AZURE_DI_KEY } });
    const j = await res.json();
    if (j.status === "succeeded") return j.analyzeResult as DiResult;
    if (j.status === "failed") throw new Error(`Document Intelligence failed: ${JSON.stringify(j.error).slice(0, 200)}`);
  }
  throw new Error("Document Intelligence timed out");
}

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
    const m = text.match(/PRINCIPAL AMOUNT[\s\S]{0,40}?(Rs\.?\s*[\d,]+(?:\.\d{2})?)/i) ?? text.match(/(?:Rs\.?|₹)\s*([\d,]{5,}(?:\.\d{2})?)/);
    if (m) out.amount = { value: m[1], confidence: 0.75 };
  }
  if (!out.lienHolder) {
    const m = text.match(/IN FAVOU?R OF:?\s*\n?([^\n]{3,80})/i);
    if (m) out.lienHolder = { value: m[1].trim(), confidence: 0.75 };
  }
  return out;
}
