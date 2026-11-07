import "server-only";
import { and, count, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db, schema } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

const N = schema.notifications;

export async function unreadCount(user: SessionUser) {
  const [r] = await db.select({ n: count() }).from(N).where(and(eq(N.channel, "inbox"), eq(N.userId, user.id), isNull(N.readAt)));
  return r.n;
}

export function inbox(user: SessionUser, limit = 80) {
  return db.select().from(N).where(and(eq(N.channel, "inbox"), eq(N.userId, user.id))).orderBy(desc(N.createdAt)).limit(limit);
}

/** The simulated email outbox. Officers and HQ see everything; an institution sees only mail addressed to it. */
export function outbox(user: SessionUser, limit = 100) {
  const where: SQL[] = [eq(N.channel, "email")];
  if (!can(user.roles, "reports.view")) where.push(user.institutionId ? eq(N.institutionId, user.institutionId) : eq(N.id, "00000000-0000-0000-0000-000000000000"));
  return db
    .select({ n: N, sender: schema.users.name, caseNo: schema.instruments.caseNo })
    .from(N)
    .leftJoin(schema.users, eq(schema.users.id, N.sentBy))
    .leftJoin(schema.instruments, eq(schema.instruments.id, N.instrumentId))
    .where(and(...where))
    .orderBy(desc(N.createdAt))
    .limit(limit);
}
