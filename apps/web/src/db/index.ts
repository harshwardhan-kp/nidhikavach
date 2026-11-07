import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

// One small pool per server instance; the VM Postgres allows 40 connections in total.
const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

export const pg =
  globalForDb.pg ??
  postgres(env.DATABASE_URL, {
    ssl: "require",
    max: 4,
    idle_timeout: 20,
    max_lifetime: 60 * 5,
    connect_timeout: 10,
    onnotice: () => {},
  });

if (process.env.NODE_ENV !== "production") globalForDb.pg = pg;

export const db = drizzle(pg, { schema });
export type Db = typeof db;
export { schema };
