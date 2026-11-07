/**
 * Seeds the prototype database.
 *   npm run db:seed            -> idempotent base seed
 *   npm run db:seed -- --reset -> wipe everything owned by the app role, re-migrate, seed
 *   add --full                 -> also generate the synthetic dataset (~1,200 institutions, ~8k FDRs)
 */
import { config } from "dotenv";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../schema";
import { DEMO_INSTITUTION, DEMO_PASSWORD, DEMO_USERS, REGIONS, RULE_SET_V1 } from "./data";
import { generate } from "./generate";
import ifscSample from "./ifsc-sample.json";

config({ path: ".env.local" });

async function main() {
  const reset = process.argv.includes("--reset");
  const client = postgres(process.env.DATABASE_URL!, { ssl: "require", max: 1, onnotice: () => {} });
  const db = drizzle(client, { schema });

  if (reset) {
    console.log("resetting: dropping all objects owned by the app role");
    await client.unsafe("DROP OWNED BY CURRENT_USER CASCADE");
    await migrate(db, { migrationsFolder: "./drizzle" });
  }

  const ledger = (action: string, entity: string, entityId: string | null, payload: object) =>
    db.execute(sql`select * from ledger_append(null, 'system', ${action}, ${entity}, ${entityId}, ${JSON.stringify(payload)}::jsonb)`);

  // Regions
  for (const r of REGIONS) {
    await db
      .insert(schema.regions)
      .values({ code: r.code, name: r.name, hqCity: r.hqCity, states: [...r.states] })
      .onConflictDoNothing({ target: schema.regions.code });
  }
  const regionRows = await db.select().from(schema.regions);
  const regionId = (code: string | null) => (code ? regionRows.find((r) => r.code === code)!.id : null);

  // Rule set v1
  const inserted = await db
    .insert(schema.ruleSets)
    .values({ version: 1, effectiveFrom: "2024-04-01", body: RULE_SET_V1, notes: "Initial rules from APH 2024-27 (as cited in the deck)" })
    .onConflictDoNothing({ target: schema.ruleSets.version })
    .returning({ id: schema.ruleSets.id });
  if (inserted.length) await ledger("rules.published", "rule_set", "1", { version: 1, effectiveFrom: "2024-04-01" });

  // Demo institution
  await db
    .insert(schema.institutions)
    .values({ ...DEMO_INSTITUTION, regionId: regionId(DEMO_INSTITUTION.region)!, nodalEmail: DEMO_USERS[0].email })
    .onConflictDoNothing({ target: schema.institutions.aicteId });
  const [inst] = await db.select().from(schema.institutions).where(sql`${schema.institutions.aicteId} = ${DEMO_INSTITUTION.aicteId}`);

  // Demo users (one per role)
  const passwordHash = await hash(DEMO_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  for (const u of DEMO_USERS) {
    const [row] = await db
      .insert(schema.users)
      .values({
        email: u.email,
        name: u.name,
        designation: u.designation,
        passwordHash,
        institutionId: "institution" in u && u.institution ? inst.id : null,
        regionId: regionId(u.region),
        isDemo: true,
      })
      .onConflictDoNothing({ target: schema.users.email })
      .returning({ id: schema.users.id });
    if (row) {
      for (const role of u.roles) await db.insert(schema.userRoles).values({ userId: row.id, role }).onConflictDoNothing();
      await ledger("user.created", "user", row.id, { email: u.email, roles: u.roles, demo: true });
    }
  }

  await db
    .insert(schema.settings)
    .values({ key: "demo_clock", value: { offsetDays: 0 } })
    .onConflictDoNothing({ target: schema.settings.key });

  if (process.argv.includes("--full")) await seedFull(db);

  const counts = await db.execute(sql`select
    (select count(*) from regions) regions, (select count(*) from users) users,
    (select count(*) from institutions) institutions, (select count(*) from instruments) instruments,
    (select count(*) from discrepancies) discrepancies, (select count(*) from audit_ledger) ledger`);
  console.log("seeded:", counts[0]);
  const v = await db.execute(sql`select * from ledger_verify()`);
  console.log("ledger:", v[0]);
  await client.end();
}

type DB = ReturnType<typeof drizzle<typeof schema>>;

async function insertChunked<T extends Record<string, unknown>>(db: DB, table: Parameters<DB["insert"]>[0], rows: T[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    await db.insert(table).values(rows.slice(i, i + size) as never);
  }
}

async function seedFull(db: DB) {
  const [{ n }] = await db.execute<{ n: string }>(sql`select count(*) n from instruments`);
  if (Number(n) > 0) {
    console.log(`full dataset already present (${n} instruments); use --reset --full to regenerate`);
    return;
  }
  const t0 = Date.now();
  await insertChunked(db, schema.ifscBranches, ifscSample as (typeof schema.ifscBranches.$inferInsert)[], 1000);

  const regions = await db.select().from(schema.regions);
  const [demoInst] = await db.select().from(schema.institutions).where(sql`${schema.institutions.aicteId} = ${DEMO_INSTITUTION.aicteId}`);
  const users = await db.select({ id: schema.users.id, email: schema.users.email }).from(schema.users);
  const uid = (key: string) => users.find((u) => u.email === DEMO_USERS.find((d) => d.key === key)!.email)!.id;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  const ds = generate({
    today,
    regions: regions.map((r) => ({ id: r.id, code: r.code, states: r.states })),
    demoInstitution: { ...demoInst, id: demoInst.id },
    users: { maker: uid("maker"), checker: uid("checker"), authority: uid("authority"), institution: uid("institution") },
  });
  const demoId = demoInst.id;
  console.log(`generated in ${Date.now() - t0}ms: ${ds.institutions.length} institutions, ${ds.instruments.length} instruments`);

  await insertChunked(db, schema.institutions, ds.institutions.filter((i) => i.id !== demoId));
  // Insert chains oldest-first so every replaces_instrument_id already exists.
  await insertChunked(db, schema.instruments, ds.instruments, 400);
  await insertChunked(db, schema.instrumentFields, ds.fields, 2000);
  await insertChunked(db, schema.documents, ds.documents, 1000);
  await insertChunked(db, schema.verifications, ds.verifications, 1000);
  await insertChunked(db, schema.discrepancies, ds.discrepancies);
  await insertChunked(db, schema.releaseRequests, ds.releases);
  await insertChunked(db, schema.approvals, ds.approvals);

  // One ledger entry per imported record, in submission order.
  await db.execute(sql`
    select count(*) from (
      select ledger_append(null, 'system', 'instrument.imported', 'instrument', s.id::text,
        jsonb_build_object('caseNo', s.case_no, 'source', 'legacy register import (synthetic)',
          'amountPaise', s.amount_paise, 'maturityDate', s.maturity_date,
          'lanes', jsonb_build_object('record', s.record_status, 'verification', s.verification_status,
            'validity', s.validity_status, 'renewal', s.renewal_status, 'release', s.release_status)))
      from (select * from instruments order by submitted_at nulls last, case_no) s
    ) x`);
  await db.execute(sql`analyze`);
  console.log(`full dataset inserted in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
