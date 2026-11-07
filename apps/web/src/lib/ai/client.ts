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

/** Embeddings for retrieval (A7). One call for a batch of texts. */
export async function embed(texts: string[]): Promise<number[][]> {
  const { MODELS } = await import("./models");
  const res = await openai().embeddings.create({ model: MODELS.embedding, input: texts });
  return res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export type ToolDef = { name: string; description: string; parameters: Record<string, unknown>; run: (args: Record<string, unknown>) => Promise<unknown> };

/**
 * A tool-using conversation (A5): the model may call only the tools given,
 * each bound server-side to one record. Logged to ai_calls like every call.
 */
export async function runWithTools(call: {
  feature: AiFeature;
  model: string;
  instructions: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: ToolDef[];
  actorId?: string | null;
  instrumentId?: string | null;
  maxSteps?: number;
}) {
  const t0 = Date.now();
  const used: string[] = [];
  const input: OpenAI.Responses.ResponseInput = call.messages.map((m) => ({ role: m.role, content: m.content }));
  const tools = call.tools.map((t) => ({ type: "function" as const, name: t.name, description: t.description, parameters: t.parameters, strict: true }));
  let inTok = 0;
  let outTok = 0;
  try {
    for (let step = 0; step < (call.maxSteps ?? 5); step++) {
      const res = await openai().responses.create({ model: call.model, instructions: call.instructions, input, tools, reasoning: { effort: "low" } });
      inTok += res.usage?.input_tokens ?? 0;
      outTok += res.usage?.output_tokens ?? 0;
      const calls = res.output.filter((o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === "function_call");
      if (!calls.length) {
        const answer = res.output_text;
        await db.insert(schema.aiCalls).values({
          feature: call.feature,
          model: call.model,
          inputHash: createHash("sha256").update(JSON.stringify(call.messages)).digest("hex"),
          output: { answer, tools: used },
          inputTokens: inTok,
          outputTokens: outTok,
          latencyMs: Date.now() - t0,
          actorId: call.actorId ?? null,
          instrumentId: call.instrumentId ?? null,
        });
        return { answer, tools: used };
      }
      // Carry the reasoning and function calls forward so the model sees its own steps.
      input.push(...(res.output as OpenAI.Responses.ResponseInputItem[]));
      for (const c of calls) {
        const tool = call.tools.find((t) => t.name === c.name);
        used.push(c.name);
        let output: unknown;
        try {
          output = tool ? await tool.run(JSON.parse(c.arguments || "{}")) : { error: "unknown tool" };
        } catch (e) {
          output = { error: e instanceof Error ? e.message : "tool failed" };
        }
        input.push({ type: "function_call_output", call_id: c.call_id, output: JSON.stringify(output) });
      }
    }
    throw new Error("Too many steps without an answer");
  } catch (e) {
    await db.insert(schema.aiCalls).values({ feature: call.feature, model: call.model, inputHash: "-", error: (e instanceof Error ? e.message : String(e)).slice(0, 500), latencyMs: Date.now() - t0, actorId: call.actorId ?? null, instrumentId: call.instrumentId ?? null });
    throw e;
  }
}
