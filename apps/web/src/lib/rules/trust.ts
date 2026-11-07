/**
 * Explainable trust score (0-100) from the three-source comparison.
 * Pure function; the weights come from the active rule set.
 */
import { FIELDS, type FieldKey, type FieldSources, isAicteLien, type Match, matchField } from "./fields";

export type TrustWeights = Record<FieldKey, number>;

export type TrustConfig = {
  weights: TrustWeights;
  noBankCap: number; // max score while the bank has not confirmed anything
  bands: { green: number; amber: number };
};

export const DEFAULT_TRUST: TrustConfig = {
  weights: { instrumentNo: 20, amount: 20, maturityDate: 15, issueDate: 10, ifsc: 10, depositorName: 10, lienHolder: 10, autoRenew: 5 },
  noBankCap: 70,
  bands: { green: 90, amber: 60 },
};

export type FieldInput = FieldSources & { scanConfidence?: number | null };

export type TrustLine = { field: FieldKey; match: Match; points: number; max: number; reason: string };
export type TrustPenalty = { reason: string; points: number };

export type TrustResult = {
  score: number | null;
  band: "green" | "amber" | "red" | "unscored";
  lines: TrustLine[];
  penalties: TrustPenalty[];
  capped: boolean;
};

const CRITICAL_MISMATCH_PENALTY = 10;

export function computeTrust(
  inputs: Partial<Record<FieldKey, FieldInput>>,
  opts: { tamperScore?: number | null; config?: TrustConfig } = {},
): TrustResult {
  const cfg = opts.config ?? DEFAULT_TRUST;
  const lines: TrustLine[] = [];
  const penalties: TrustPenalty[] = [];
  let anyScan = false;
  let anyBank = false;

  for (const f of FIELDS) {
    const s = inputs[f.key] ?? {};
    const max = cfg.weights[f.key];
    const hasScan = !!s.scan?.trim();
    const hasBank = !!s.bank?.trim();
    anyScan ||= hasScan;
    anyBank ||= hasBank;
    const match = matchField(f.key, s);
    let points = 0;
    let reason: string;

    if (match === "mismatch") {
      reason = hasBank ? "sources disagree, including the bank" : "declared value and scan disagree";
      if (f.critical) penalties.push({ reason: `${f.label}: critical field mismatch`, points: CRITICAL_MISMATCH_PENALTY });
    } else if (match === "missing") {
      reason = s.declared?.trim() ? "only one source so far" : "not declared";
      points = s.declared?.trim() ? Math.round(max * 0.3) : 0;
    } else {
      const soft = match === "soft_match" ? 0.9 : 1;
      if (hasBank) {
        points = max * soft;
        reason = match === "match" ? "bank confirms" : "bank confirms (formatting differs)";
      } else {
        const conf = s.scanConfidence ?? 1;
        points = max * 0.6 * soft * (conf < 0.6 ? 0.5 : 1);
        reason = conf < 0.6 ? "scan agrees, low read confidence" : "scan agrees, bank not yet confirmed";
      }
    }
    lines.push({ field: f.key, match, points: Math.round(points * 10) / 10, max, reason });
  }

  const lien = inputs.lienHolder;
  const lienValues = [lien?.declared, lien?.scan, lien?.bank].filter((v): v is string => !!v?.trim());
  if (lienValues.length && lienValues.some((v) => !isAicteLien(v))) {
    penalties.push({ reason: "Lien is not marked in favour of AICTE", points: 15 });
  }

  if (!anyScan && !anyBank) {
    return { score: null, band: "unscored", lines, penalties, capped: false };
  }

  const tamper = opts.tamperScore ?? 0;
  if (tamper >= 30) penalties.push({ reason: `Tamper scan flagged the document (${tamper}/100)`, points: Math.min(30, Math.round(tamper * 0.4)) });

  let score = lines.reduce((a, l) => a + l.points, 0) - penalties.reduce((a, p) => a + p.points, 0);
  let capped = false;
  if (!anyBank && score > cfg.noBankCap) {
    score = cfg.noBankCap;
    capped = true;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const band = score >= cfg.bands.green ? "green" : score >= cfg.bands.amber ? "amber" : "red";
  return { score, band, lines, penalties, capped };
}
