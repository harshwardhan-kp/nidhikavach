import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import { LANE_VALUES } from "@/modules/cases/labels";

const lane = <T extends readonly string[]>(v: T) => z.enum(v as unknown as [string, ...string[]]).nullable();

/** Allow-listed filters only: the model can express nothing the filter bar cannot. */
export const askSchema = z.object({
  text: z.string().nullable().describe("free-text match on case no., FDR no., institution name or AICTE id; null if none"),
  risk: z.enum(["red", "amber", "green", "unscored"]).nullable(),
  record: lane(LANE_VALUES.record),
  verification: lane(LANE_VALUES.verification),
  validity: lane(LANE_VALUES.validity),
  renewal: lane(LANE_VALUES.renewal),
  release: lane(LANE_VALUES.release),
  regionCode: z.enum(["NRO", "NWRO", "WRO", "CRO", "ERO", "SRO", "SWRO", "SCRO"]).nullable(),
  maturesWithinDays: z.number().int().nullable(),
  maturedAtLeastDaysAgo: z.number().int().nullable(),
  minAmountLakh: z.number().nullable(),
  view: z.enum(["open", "action", "mine", "all"]).nullable(),
  sort: z.enum(["risk", "maturity", "amount", "recent"]).nullable(),
});
export type Ask = z.infer<typeof askSchema>;

/** A3: plain words -> filter chips. Only the question is sent; no records. */
export async function parseAsk(question: string, actorId: string) {
  const { data } = await structured({
    feature: "A3.search",
    model: MODELS.fast,
    schemaName: "case_filters",
    schema: askSchema,
    effort: "low",
    actorId,
    instructions: [
      "Turn an AICTE officer's question about security-deposit FDR cases into filters. Set only what the question asks for; everything else null.",
      "Lanes: record (draft, submitted, under_scrutiny, accepted, returned, rejected); verification (unverified, pending_bank, bank_confirmed, mismatch, unavailable, manual_confirmed);",
      "validity (valid, expiring, matured, expired, lien_unknown); renewal (not_due, due, requested, renewed, replaced, overdue); release (none, requested, recommended, checked, approved, released, refunded, rejected).",
      "'not renewed' with a maturity window means renewal = due. 'Overdue' renewals means renewal = overdue. 'Bank has not confirmed' means verification = unverified or pending_bank: pick pending_bank if they say 'waiting', else unverified.",
      "'mismatch', 'fake', 'forged' or 'tampered' usually means verification = mismatch or risk = red. 'High value' without a number means minAmountLakh = 25. 'Mine' or 'assigned to me' means view = mine.",
      "Regions: NRO Northern, NWRO North-Western, WRO Western, CRO Central, ERO Eastern, SRO Southern, SWRO South-Western, SCRO South-Central.",
      "If a maturity window is asked, also set sort = maturity unless another sort is asked.",
    ].join(" "),
    input: question,
  });
  return data;
}
