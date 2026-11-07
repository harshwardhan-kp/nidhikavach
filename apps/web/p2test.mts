import { eq } from "drizzle-orm";
import { db, schema, pg } from "@/db";
import { readScan } from "@/modules/verify/pipeline";
import { requestBankConfirmation } from "@/modules/verify/bank";
const [maker] = await db.select().from(schema.users).where(eq(schema.users.email, "dealing.wro@demo.nidhikavach.in"));
const actor = { id: maker.id, primaryRole: "maker" };
for (const caseNo of process.argv.slice(2)) {
  const [i] = await db.select().from(schema.instruments).where(eq(schema.instruments.caseNo, caseNo));
  const t = Date.now();
  const r = await readScan(i.id, actor);
  console.log(caseNo, "read in", Date.now() - t, "ms; readers", JSON.stringify(r.readers), "agreed", r.agreed, "tamper", r.tamperScore, "trust", r.result?.trust.score, r.result?.raised);
  for (const [k, v] of Object.entries(r.fields)) console.log("   ", k.padEnd(14), JSON.stringify(v.value), v.confidence, v.source, v.agree === false ? `DISAGREE di=${v.di} llm=${v.llm}` : "");
  const b = await requestBankConfirmation(i.id, actor);
  console.log("  bank:", JSON.stringify(b));
}
await pg.end();
