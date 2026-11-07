/**
 * Release / refund checklist, evaluated from the record (pure).
 * Paraphrases APH 2024-27: cl. 1.12(iv) ten-year hold; cl. 6.46(a)-(c)
 * documents and cell clearances before the NOC; cl. 6.46(h)-(i) progressive
 * closure / merger with a university or board certificate; cl. 2.21(h)-(i)
 * closure penalties; Affidavit 6 conditions.
 */
import { addDays } from "./lanes";

export const HOLD_YEARS = 10;

export type ReleaseKind = "release" | "refund";
export const KIND_LABEL: Record<ReleaseKind, string> = {
  release: "release after the 10-year hold",
  refund: "refund on closure or merger",
};

export type ConditionKey = "hold_or_closure" | "bank_confirmed" | "no_open_discrepancy" | "documents" | "cell_clearances" | "no_dues_or_penalty";

export type Condition = {
  key: ConditionKey;
  label: string;
  clause: string;
  /** true / false from the record; null = an officer must attest it (simulated clearance). */
  met: boolean | null;
  detail: string;
};

export type ReleaseFacts = {
  kind: ReleaseKind;
  issueDate: string | null;
  today: string;
  verificationStatus: string;
  openDiscrepancies: number;
  documentsAttached: number;
  attested?: Partial<Record<"cell_clearances" | "no_dues_or_penalty", boolean>>;
};

/** Same calendar date ten years on (29 Feb rolls to 1 Mar). */
export function holdEnds(issueDate: string) {
  const y = Number(issueDate.slice(0, 4)) + HOLD_YEARS;
  const md = issueDate.slice(5);
  return md === "02-29" ? addDays(`${y}-02-28`, 1) : `${y}-${md}`;
}

export function evaluateRelease(f: ReleaseFacts): Condition[] {
  const holdEnd = f.issueDate ? holdEnds(f.issueDate) : null;
  const holdDone = !!holdEnd && holdEnd <= f.today;
  return [
    f.kind === "release"
      ? {
          key: "hold_or_closure",
          label: "Ten-year hold period completed",
          clause: "APH 2024-27 cl. 1.12(iv)",
          met: holdDone,
          detail: holdEnd ? (holdDone ? `Hold ended on ${holdEnd}.` : `Hold runs until ${holdEnd}; before that, only a closure or merger refund applies.`) : "Issue date not on record.",
        }
      : {
          key: "hold_or_closure",
          label: "Closure or merger certified: no students studying",
          clause: "APH 2024-27 cl. 6.46(h)-(i)",
          met: f.documentsAttached > 0,
          detail: f.documentsAttached > 0 ? "Certificate from the affiliating university / board is in the dossier." : "Upload the university / board certificate that no students are studying.",
        },
    {
      key: "bank_confirmed",
      label: "Deposit confirmed by the issuing bank",
      clause: "Affidavit 6 (FDR not mortgaged or renewed)",
      met: ["bank_confirmed", "manual_confirmed"].includes(f.verificationStatus),
      detail: ["bank_confirmed", "manual_confirmed"].includes(f.verificationStatus) ? "The bank confirmed the deposit and the lien." : `Bank status: ${f.verificationStatus.replaceAll("_", " ")}.`,
    },
    {
      key: "no_open_discrepancy",
      label: "No open discrepancy on the instrument",
      clause: "Affidavit 6 (no inquiry or adverse action pending)",
      met: f.openDiscrepancies === 0,
      detail: f.openDiscrepancies ? `${f.openDiscrepancies} open discrepanc${f.openDiscrepancies > 1 ? "ies" : "y"}.` : "None open.",
    },
    {
      key: "documents",
      label: "Request letter, Affidavit 6, FDR copy and latest LoA / EoA uploaded",
      clause: "APH 2024-27 cl. 6.46(a)",
      met: f.documentsAttached > 0,
      detail: f.documentsAttached > 0 ? `${f.documentsAttached} document(s) in the release dossier.` : "No dossier uploaded with the request.",
    },
    {
      key: "cell_clearances",
      label: "Cleared by PGRC, Vigilance and other cells / bureaus",
      clause: "APH 2024-27 cl. 6.46(b)-(c)",
      met: f.attested?.cell_clearances ?? null,
      detail: f.attested?.cell_clearances ? "Attested by the dealing officer." : "The dealing officer attests this when recommending [simulated clearance].",
    },
    {
      key: "no_dues_or_penalty",
      label: "No embezzlement complaint, fee-refund case or unpaid closure penalty",
      clause: "APH 2024-27 cl. 6.46, cl. 2.21(h)-(i); Affidavit 6",
      met: f.attested?.no_dues_or_penalty ?? null,
      detail: f.attested?.no_dues_or_penalty ? "Attested by the dealing officer." : "The dealing officer attests this when recommending.",
    },
  ];
}

/** Ready for a decision once every condition is met (attested ones included). */
export const allMet = (c: Condition[]) => c.every((x) => x.met === true);
/** Blocks the request itself (attestations come later). */
export const blockers = (c: Condition[]) => c.filter((x) => x.met === false);
