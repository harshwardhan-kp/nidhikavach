import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import type { briefingFacts } from "@/modules/oversight/queries";

export const briefingSchema = z.object({
  headline: z.string(),
  points: z.array(z.object({ text: z.string(), tone: z.enum(["risk", "progress", "watch"]) })),
  asks: z.array(z.string()),
});
export type Briefing = z.infer<typeof briefingSchema>;

/** A10: the weekly brief for the Regulation Bureau head, from aggregates only. Regenerates when the facts (or the demo clock) change. */
export async function bureauBriefing(facts: Awaited<ReturnType<typeof briefingFacts>>, actorId: string) {
  const { data, cached } = await structured({
    feature: "A10.briefing",
    model: MODELS.quality,
    schemaName: "bureau_briefing",
    schema: briefingSchema,
    effort: "low",
    actorId,
    instructions: [
      "You write the weekly security-deposit briefing for the head of AICTE's Regulation Bureau.",
      "headline: one sentence, the single most important fact this week.",
      "points: 4 to 5 short bullets mixing what matures soon, where renewals or discrepancies are slipping (name the regions), what progressed this week, and any stuck high-value case (by case number). tone = risk, progress or watch.",
      "asks: up to 2 decisions or nudges the bureau head should make (e.g. which regional office to follow up with).",
      "Use only the numbers given; amounts in crore or lakh, Indian style. No preamble.",
    ].join(" "),
    input: JSON.stringify(facts),
  });
  return { ...data, cached };
}
