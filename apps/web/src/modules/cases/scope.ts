import "server-only";
import { eq, type SQL, sql } from "drizzle-orm";
import { schema } from "@/db";
import type { SessionUser } from "@/lib/auth/session";
import { can } from "@/lib/auth/roles";

/**
 * Row-level scope for instruments: institutions see their own, regional
 * officers their region, HQ roles everything. Every instrument query must
 * include this condition (joined with institutions).
 */
export function instrumentScope(user: SessionUser): SQL | undefined {
  if (can(user.roles, "instrument.view_all")) return undefined;
  if (can(user.roles, "instrument.view_scope") && user.regionId) return eq(schema.institutions.regionId, user.regionId);
  if (user.institutionId) return eq(schema.instruments.institutionId, user.institutionId);
  return sql`false`;
}

export function scopeLabel(user: SessionUser) {
  if (can(user.roles, "instrument.view_all")) return "all regions";
  if (user.regionName && can(user.roles, "instrument.view_scope")) return `${user.regionName} region`;
  return user.institutionName ?? "your institution";
}
