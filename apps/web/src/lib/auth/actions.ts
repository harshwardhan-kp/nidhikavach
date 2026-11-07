"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { demoMode } from "@/lib/env";
import { appendLedger } from "@/lib/ledger";
import { verifyPassword } from "./password";
import { primaryRole, type Role } from "./roles";
import { endSession, getSessionUser, startSession } from "./session";

export type LoginState = { error?: string; email?: string } | undefined;

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
  next: z.string().optional(),
});

function safeNext(next: string | undefined) {
  return next && next.startsWith("/app") && !next.startsWith("//") ? next : "/app";
}

async function rolesOf(userId: string) {
  const rows = await db.select({ role: schema.userRoles.role }).from(schema.userRoles).where(eq(schema.userRoles.userId, userId));
  return rows.map((r) => r.role as Role);
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a valid email and password.", email: String(formData.get("email") ?? "") };
  const { email, password, next } = parsed.data;

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const ok = user?.active ? await verifyPassword(user.passwordHash, password) : false;
  if (!user || !ok) {
    await appendLedger({ actor: null, action: "auth.login_failed", entity: "user", entityId: user?.id ?? null, payload: { email } });
    return { error: "Email or password is incorrect.", email };
  }

  await startSession(user.id);
  await appendLedger({
    actor: { id: user.id, primaryRole: primaryRole(await rolesOf(user.id)) },
    action: "auth.login",
    entity: "user",
    entityId: user.id,
    payload: {},
  });
  redirect(safeNext(next));
}

/** Demo only: sign in as one of the seeded demo accounts with one click. */
export async function demoSignIn(formData: FormData) {
  if (!demoMode) throw new Error("demo mode is off");
  const userId = z.string().uuid().parse(formData.get("userId"));
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!user?.isDemo || !user.active) throw new Error("not a demo account");

  const current = await getSessionUser();
  await startSession(user.id);
  await appendLedger({
    actor: { id: user.id, primaryRole: primaryRole(await rolesOf(user.id)) },
    action: current ? "auth.demo_role_switch" : "auth.demo_login",
    entity: "user",
    entityId: user.id,
    payload: current ? { from: current.id } : {},
  });
  redirect(safeNext(formData.get("next")?.toString()));
}

export async function logout() {
  const user = await getSessionUser();
  if (user) await appendLedger({ actor: user, action: "auth.logout", entity: "user", entityId: user.id, payload: {} });
  await endSession();
  redirect("/login");
}

export async function demoAccounts() {
  if (!demoMode) return [];
  const users = await db
    .select({ id: schema.users.id, name: schema.users.name, designation: schema.users.designation, email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.isDemo, true));
  const withRoles = await Promise.all(users.map(async (u) => ({ ...u, role: primaryRole(await rolesOf(u.id)) })));
  const order: Role[] = ["institution", "maker", "checker", "authority", "auditor", "admin"];
  return withRoles.sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}
