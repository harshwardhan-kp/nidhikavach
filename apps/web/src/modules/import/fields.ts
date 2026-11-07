/** Target fields for legacy register import. Pure (client-safe). */
export const IMPORT_FIELDS = [
  { key: "institutionName", label: "Institution name", required: true },
  { key: "aicteId", label: "AICTE id", required: false },
  { key: "programme", label: "Programme", required: false },
  { key: "instrumentNo", label: "FDR number", required: true },
  { key: "amount", label: "Amount", required: true },
  { key: "issueDate", label: "Date of deposit", required: false },
  { key: "maturityDate", label: "Maturity date", required: false },
  { key: "bankName", label: "Bank", required: false },
  { key: "ifsc", label: "IFSC", required: false },
  { key: "depositorName", label: "Depositor", required: false },
  { key: "lienHolder", label: "Lien in favour of", required: false },
  { key: "autoRenew", label: "Auto-renewal", required: false },
  { key: "remarks", label: "Remarks", required: false },
] as const;

export type ImportFieldKey = (typeof IMPORT_FIELDS)[number]["key"];
export type Mapping = Partial<Record<ImportFieldKey, string | null>>;
export type MappingSuggestion = { field: ImportFieldKey; column: string | null; confidence: number; note: string };

export type RowResult = {
  row: number;
  status: "ok" | "review" | "error";
  institution: { id: string; name: string; similarity: number } | null;
  values: Partial<Record<ImportFieldKey, string | null>>;
  issues: string[];
};
