import type { Permission } from "./auth/roles";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission; phase?: string };

// Order and wording follow the deck's overview mock.
export const NAV: NavItem[] = [
  { href: "/app", label: "overview", icon: "layout" },
  { href: "/app/cases", label: "cases", icon: "folder" },
  { href: "/app/verification", label: "verification", icon: "scan", phase: "p2" },
  { href: "/app/maturity", label: "maturity watch", icon: "clock", phase: "p3" },
  { href: "/app/renewals", label: "renewals", icon: "refresh", phase: "p3" },
  { href: "/app/releases", label: "releases", icon: "handshake", phase: "p4" },
  { href: "/app/reports", label: "reports", icon: "chart", perm: "reports.view", phase: "p5" },
  { href: "/app/audit", label: "audit ledger", icon: "link", perm: "ledger.view" },
  { href: "/app/admin", label: "admin", icon: "settings", perm: "admin.clock" },
];
