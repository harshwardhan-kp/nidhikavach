import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import type { TrustResult } from "@/lib/rules/trust";

/** A9: one plain sentence on why a case is risky, built only from facts already on the record. */
export async function riskLine(input: { caseNo: string; trust: TrustResult; discrepancies: string[]; lanes: Record<string, string>; tamperScore: number | null }) {
  const facts = {
    score: input.trust.score,
    band: input.trust.band,
    weakFields: input.trust.lines.filter((l) => l.points < l.max * 0.7).map((l) => `${l.field}: ${l.reason}`),
    penalties: input.trust.penalties.map((p) => p.reason),
    openDiscrepancies: input.discrepancies,
    lanes: input.lanes,
    tamperScore: input.tamperScore,
  };
  const { data } = await structured({
    feature: "A9.risk",
    model: MODELS.fast,
    schemaName: "risk_line",
    schema: z.object({ line: z.string() }),
    effort: "low",
    instructions:
      "Write one sentence (max 30 words) telling a regulator's officer why this security-deposit case needs attention and what to check first. Use only the facts given. No hedging words, no preamble, plain English.",
    input: JSON.stringify(facts),
  });
  return data.line;
}
