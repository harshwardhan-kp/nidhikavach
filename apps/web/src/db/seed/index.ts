/**
 * Seeds the prototype database.
 *   npm run db:seed            -> idempotent base seed
 *   npm run db:seed -- --reset -> wipe everything owned by the app role, re-migrate, seed
 */
import { config } from "dotenv";
import { hash } from "@node-rs/argon2";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "../schema";
import { DEMO_INSTITUTION, DEMO_PASSWORD, DEMO_USERS, REGIONS, RULE_SET_V1 } from "./data";

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

  const counts = await db.execute(sql`select
    (select count(*) from regions) regions, (select count(*) from users) users,
    (select count(*) from institutions) institutions, (select count(*) from audit_ledger) ledger`);
  console.log("seeded:", counts[0]);
  const v = await db.execute(sql`select * from ledger_verify()`);
  console.log("ledger:", v[0]);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
