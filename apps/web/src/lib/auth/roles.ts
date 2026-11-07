/**
 * Roles and permissions. Pure module (safe on client and server).
 * Separation of duties is enforced twice: by role here, and by user id on
 * each record (a person can never act on a step they performed earlier).
 */
export const ROLES = ["institution", "maker", "checker", "authority", "auditor", "admin"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  institution: "Institution",
  maker: "Dealing officer · maker",
  checker: "Regional officer · checker",
  authority: "Competent authority",
  auditor: "Auditor",
  admin: "System admin",
};

export type Permission =
  | "instrument.submit"
  | "instrument.view_own"
  | "instrument.view_scope"
  | "instrument.view_all"
  | "instrument.scrutinise"
  | "verification.request"
  | "verification.confirm"
  | "discrepancy.raise"
  | "discrepancy.respond"
  | "discrepancy.close"
  | "renewal.request"
  | "release.request"
  | "release.recommend"
  | "release.check"
  | "release.approve"
  | "reports.view"
  | "ledger.view"
  | "ledger.verify"
  | "admin.users"
  | "admin.rules"
  | "admin.clock";

const P: Record<Role, Permission[]> = {
  institution: [
    "instrument.submit",
    "instrument.view_own",
    "discrepancy.respond",
    "renewal.request",
    "release.request",
  ],
  maker: [
    "instrument.view_scope",
    "instrument.scrutinise",
    "verification.request",
    "discrepancy.raise",
    "release.recommend",
    "reports.view",
    "ledger.view",
  ],
  checker: [
    "instrument.view_scope",
    "verification.confirm",
    "discrepancy.close",
    "release.check",
    "reports.view",
    "ledger.view",
  ],
  authority: ["instrument.view_all", "release.approve", "reports.view", "ledger.view"],
  auditor: ["instrument.view_all", "reports.view", "ledger.view", "ledger.verify"],
  admin: ["instrument.view_all", "reports.view", "ledger.view", "ledger.verify", "admin.users", "admin.rules", "admin.clock"],
};

export function can(roles: readonly Role[], perm: Permission) {
  return roles.some((r) => P[r].includes(perm));
}

export function permissionsOf(roles: readonly Role[]) {
  return [...new Set(roles.flatMap((r) => P[r]))];
}

/** The role whose workspace a user lands in (first match wins). */
export function primaryRole(roles: readonly Role[]): Role {
  const order: Role[] = ["authority", "checker", "maker", "auditor", "admin", "institution"];
  return order.find((r) => roles.includes(r)) ?? "institution";
}

/** Separation of duties: may `actorId` take this step, given who did earlier steps? */
export function distinctActor(actorId: string, earlierActorIds: (string | null | undefined)[]) {
  return !earlierActorIds.some((id) => id && id === actorId);
}
