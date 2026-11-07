import "server-only";
import { z } from "zod";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import type { TamperFinding } from "@/lib/sidecar";

const field = z.object({ value: z.string().nullable(), confidence: z.number() });

export const visionReadSchema = z.object({
  isFixedDepositReceipt: z.boolean(),
  fields: z.object({
    instrumentNo: field,
    amount: field,
    issueDate: field,
    maturityDate: field,
    ifsc: field,
    depositorName: field,
    lienHolder: field,
    autoRenew: field,
  }),
  amountInWords: z.string().nullable(),
  wordsMatchFigures: z.boolean().nullable(),
  bankName: z.string().nullable(),
  stampPresent: z.boolean(),
  signaturePresent: z.boolean(),
  notes: z.string(),
});
export type VisionRead = z.infer<typeof visionReadSchema>;

const docInput = (url: string, mime: string, text: string) => [
  {
    role: "user" as const,
    content: [
      { type: "input_text" as const, text },
      mime === "application/pdf"
        ? { type: "input_file" as const, file_url: url }
        : { type: "input_image" as const, image_url: url, detail: "high" as const },
    ],
  },
];

/** A1: second, independent reader of the scan (gpt-6.1-terra vision). */
export function visionRead(url: string, mime: string, ctx: { actorId: string | null; instrumentId: string; docSha: string | null }) {
  return structured({
    feature: "A1.extract",
    model: MODELS.quality,
    effort: "low",
    schemaName: "fdr_reading",
    schema: visionReadSchema,
    actorId: ctx.actorId,
    instrumentId: ctx.instrumentId,
    instructions: [
      "You read scanned Indian bank fixed deposit receipts (FDRs) for a regulator.",
      "Copy each value exactly as printed (keep the printed date and amount formats). Use null when a value is not on the document; never guess.",
      "confidence is 0 to 1 for how clearly you could read that value.",
      "amount is the principal (not the maturity value). lienHolder is whoever the deposit is marked in favour of.",
      "wordsMatchFigures: does the amount written in words equal the amount in figures?",
      "Ignore watermarks such as SPECIMEN.",
    ].join("\n"),
    // The document hash makes the cache key specific to this exact file.
    input: docInput(url, mime, `Read this FDR. (document sha256 ${ctx.docSha})`),
  });
}

export const tamperOpinionSchema = z.object({
  verdict: z.enum(["likely_genuine", "suspicious", "likely_altered"]),
  score: z.number(),
  observations: z.array(
    z.object({
      area: z.string(),
      what: z.string(),
      severity: z.enum(["low", "medium", "high"]),
      box: z.array(z.number()).nullable(),
    }),
  ),
  summary: z.string(),
});
export type TamperOpinion = z.infer<typeof tamperOpinionSchema>;

/** A2: second opinion on tampering, given the heuristic findings. Advisory only. */
export function tamperOpinion(url: string, mime: string, findings: TamperFinding[], ctx: { actorId: string | null; instrumentId: string; docSha: string | null }) {
  return structured({
    feature: "A2.tamper",
    model: MODELS.quality,
    effort: "low",
    schemaName: "tamper_opinion",
    schema: tamperOpinionSchema,
    actorId: ctx.actorId,
    instrumentId: ctx.instrumentId,
    instructions: [
      "You assist a regulator's officer by looking for signs that a scanned fixed deposit receipt was altered: pasted or retyped figures, mismatched fonts or alignment, patches of different paper tone, amounts in words that disagree with figures, overwritten dates.",
      "You are given automated compression-analysis findings with normalised boxes [x, y, width, height] (0-1). Confirm or question them by looking at the image.",
      "score 0-100 is your suspicion. box is [x, y, width, height] normalised to the image, or null.",
      "Be specific and brief. Never claim certainty: a human officer decides. Ignore SPECIMEN watermarks.",
    ].join("\n"),
    input: docInput(url, mime, `Automated findings: ${JSON.stringify(findings)}\n(document sha256 ${ctx.docSha})`),
  });
}
