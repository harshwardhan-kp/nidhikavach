/**
 * Model choices in one place. GPT-6 tiers beat gpt-5.5 at a fraction of the
 * price; no Pro or flagship-priced models are used anywhere.
 */
export const MODELS = {
  /** Quality calls: scan reading, tamper second opinion, briefs, drafting. $1 / $5 per 1M tokens. */
  quality: "gpt-6.1-terra",
  /** Fast calls: search parsing, column mapping, one-liners. $0.10 / $0.50 per 1M tokens. */
  fast: "gpt-6-luna",
  embedding: "text-embedding-3-small",
} as const;

/** Feature keys from the build plan (section 7a), used for logging and caching. */
export type AiFeature =
  | "A1.extract"
  | "A2.tamper"
  | "A3.search"
  | "A4.brief"
  | "A5.ask"
  | "A6.draft"
  | "A7.rules"
  | "A8.import_mapping"
  | "A9.risk"
  | "A10.briefing";
