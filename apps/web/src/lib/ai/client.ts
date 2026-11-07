import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { db, schema } from "@/db";
import { env } from "@/lib/env";
import type { AiFeature } from "./models";

let client: OpenAI | null = null;
const openai = () => {
  if (!env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not set");
  return (client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 2 }));
};

export type StructuredCall<T extends z.ZodType> = {
  feature: AiFeature;
  model: string;
  schema: T;
  schemaName: string;
  instructions: string;
  input: string | OpenAI.Responses.ResponseInput;
  actorId?: string | null;
  instrumentId?: string | null;
  /** Reuse an earlier identical answer (same feature, model and input). Default true. */
  cache?: boolean;
  /** Reasoning effort for reasoning models; "low" keeps interactive calls fast. */
  effort?: "low" | "medium" | "high";
};

/**
 * One structured-output call with logging. Every call is recorded in ai_calls
 * (model, input hash, output, tokens, latency) so AI suggestions are auditable,
 * and identical inputs are served from that log so demos never wait twice.
 */
export async function structured<T extends z.ZodType>(call: StructuredCall<T>): Promise<{ data: z.infer<T>; cached: boolean; callId: string }> {
  const inputHash = createHash("sha256")
    .update(JSON.stringify([call.schemaName, call.instructions, call.input]))
    .digest("hex");

  if (call.cache !== false) {
    const [hit] = await db
      .select({ id: schema.aiCalls.id, output: schema.aiCalls.output })
      .from(schema.aiCalls)
      .where(and(eq(schema.aiCalls.feature, call.feature), eq(schema.aiCalls.model, call.model), eq(schema.aiCalls.inputHash, inputHash), isNull(schema.aiCalls.error)))
      .orderBy(desc(schema.aiCalls.createdAt))
      .limit(1);
    if (hit?.output) {
      const parsed = call.schema.safeParse(hit.output);
      if (parsed.success) return { data: parsed.data, cached: true, callId: hit.id };
    }
  }

  const t0 = Date.now();
  try {
    const res = await openai().responses.parse({
      model: call.model,
      instructions: call.instructions,
      input: call.input,
      text: { format: zodTextFormat(call.schema, call.schemaName) },
      ...(call.effort ? { reasoning: { effort: call.effort } } : {}),
    });
    const data = res.output_parsed as z.infer<T> | null;
    if (!data) throw new Error("model returned no structured output");
    const [row] = await db
      .insert(schema.aiCalls)
      .values({
        feature: call.feature,
        model: call.model,
        inputHash,
        output: data as object,
        inputTokens: res.usage?.input_tokens ?? null,
        outputTokens: res.usage?.output_tokens ?? null,
        latencyMs: Date.now() - t0,
        actorId: call.actorId ?? null,
        instrumentId: call.instrumentId ?? null,
      })
      .returning({ id: schema.aiCalls.id });
    return { data, cached: false, callId: row.id };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.insert(schema.aiCalls).values({
      feature: call.feature,
      model: call.model,
      inputHash,
      error: message.slice(0, 500),
      latencyMs: Date.now() - t0,
      actorId: call.actorId ?? null,
      instrumentId: call.instrumentId ?? null,
    });
    throw e;
  }
}
