import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";
import { db, schema } from "@/db";
import { can, primaryRole, type Permission, type Role } from "./roles";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, signSessionToken, verifySessionToken } from "./token";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  designation: string;
  roles: Role[];
  primaryRole: Role;
  institutionId: string | null;
  institutionName: string | null;
  regionId: number | null;
  regionName: string | null;
  isDemo: boolean;
};

/** Current user for this request, re-read from the DB so deactivation takes effect at once. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const claims = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!claims) return null;

  const rows = await db
    .select({
      user: schema.users,
      institutionName: schema.institutions.name,
      regionName: schema.regions.name,
    })
    .from(schema.users)
    .leftJoin(schema.institutions, eq(schema.institutions.id, schema.users.institutionId))
    .leftJoin(schema.regions, eq(schema.regions.id, schema.users.regionId))
    .where(eq(schema.users.id, claims.sub))
    .limit(1);
  const row = rows[0];
  if (!row || !row.user.active) return null;

  const roleRows = await db.select({ role: schema.userRoles.role }).from(schema.userRoles).where(eq(schema.userRoles.userId, row.user.id));
  const roles = roleRows.map((r) => r.role as Role);

  return {
    id: row.user.id,
    name: row.user.name,
    email: row.user.email,
    designation: row.user.designation,
    roles,
    primaryRole: primaryRole(roles),
    institutionId: row.user.institutionId,
    institutionName: row.institutionName,
    regionId: row.user.regionId,
    regionName: row.regionName,
    isDemo: row.user.isDemo,
  };
});

/** For pages and actions: the signed-in user, or a redirect to /login. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

/** The signed-in user if they hold `permission`; otherwise a 403 (app/forbidden.tsx). */
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.roles, permission)) forbidden();
  return user;
}

export async function startSession(userId: string) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  const roleRows = await db.select({ role: schema.userRoles.role }).from(schema.userRoles).where(eq(schema.userRoles.userId, userId));
  const token = await signSessionToken({
    sub: user.id,
    name: user.name,
    roles: roleRows.map((r) => r.role as Role),
    institutionId: user.institutionId,
    regionId: user.regionId,
    demo: user.isDemo,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  await db.update(schema.users).set({ lastLoginAt: new Date() }).where(eq(schema.users.id, userId));
}

export async function endSession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
