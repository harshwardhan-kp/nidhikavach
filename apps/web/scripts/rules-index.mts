/** Embeds the A7 handbook notes into rule_notes (pgvector). Run after a reseed or when notes change. */
import { notInArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { RULE_NOTES } from "@/db/seed/rule-notes";
import { embed } from "@/lib/ai/client";

const vectors = await embed(RULE_NOTES.map((n) => `${n.title}. ${n.body} (${n.clause})`));
for (const [k, n] of RULE_NOTES.entries()) {
  await db
    .insert(schema.ruleNotes)
    .values({ ...n, embedding: vectors[k] })
    .onConflictDoUpdate({ target: schema.ruleNotes.id, set: { clause: n.clause, title: n.title, body: n.body, embedding: vectors[k], updatedAt: new Date() } });
}
await db.delete(schema.ruleNotes).where(notInArray(schema.ruleNotes.id, RULE_NOTES.map((n) => n.id)));
console.log({ notes: RULE_NOTES.length });
process.exit(0);
