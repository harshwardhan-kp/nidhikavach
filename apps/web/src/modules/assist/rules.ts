import "server-only";
import { cosineDistance, desc, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { embed, structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";

export const answerSchema = z.object({
  answer: z.string(),
  verdict: z.enum(["yes", "no", "depends", "not_covered"]),
  cites: z.array(z.string()),
  checkNext: z.array(z.string()),
});
export type HandbookAnswer = z.infer<typeof answerSchema> & { notes: { id: string; clause: string; title: string; body: string }[]; cached: boolean };

/** Nearest handbook notes by meaning (pgvector cosine). */
export async function retrieve(question: string, k = 6) {
  const [v] = await embed([question]);
  const similarity = sql<number>`1 - (${cosineDistance(schema.ruleNotes.embedding, v)})`;
  return db
    .select({ id: schema.ruleNotes.id, clause: schema.ruleNotes.clause, title: schema.ruleNotes.title, body: schema.ruleNotes.body, similarity })
    .from(schema.ruleNotes)
    .orderBy(desc(similarity))
    .limit(k);
}

/** A7: answers only from the retrieved notes (plus case facts when given), citing note ids. */
export async function askHandbook(question: string, caseFacts: object | null, actorId: string, instrumentId: string | null): Promise<HandbookAnswer> {
  const notes = await retrieve(question);
  const { data, cached } = await structured({
    feature: "A7.rules",
    model: MODELS.quality,
    schemaName: "handbook_answer",
    schema: answerSchema,
    effort: "low",
    actorId,
    instrumentId,
    instructions: [
      "You answer AICTE officers' questions about security deposits using ONLY the handbook notes provided (paraphrases of the AICTE Approval Process Handbook 2024-27 with clause references) and, if given, the facts of one case.",
      "Answer in 2 to 4 plain sentences. Name the clause numbers in the text. `cites` lists the note ids you relied on.",
      "`verdict`: yes / no for a yes-no question the notes settle, 'depends' when it turns on facts not given, 'not_covered' when the notes do not address it (then say so; never guess).",
      "`checkNext`: up to 3 concrete things the officer should verify or obtain. The officer decides; you advise.",
    ].join(" "),
    input: JSON.stringify({ question, notes: notes.map((n) => ({ id: n.id, clause: n.clause, title: n.title, body: n.body })), case: caseFacts }),
  });
  const cited = data.cites.length ? await db.select().from(schema.ruleNotes).where(inArray(schema.ruleNotes.id, data.cites)) : [];
  return { ...data, notes: cited.map(({ id, clause, title, body }) => ({ id, clause, title, body })), cached };
}
