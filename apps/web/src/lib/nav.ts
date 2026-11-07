import type { Permission } from "./auth/roles";

export type NavItem = { href: string; label: string; icon: string; perm?: Permission; phase?: string };

// Order and wording follow the deck's overview mock.
export const NAV: NavItem[] = [
  { href: "/app", label: "overview", icon: "layout" },
  { href: "/app/cases", label: "cases", icon: "folder" },
  { href: "/app/submit", label: "submit an fdr", icon: "upload", perm: "instrument.submit" },
  { href: "/app/import", label: "legacy import", icon: "sheet", perm: "instrument.import" },
  { href: "/app/verification", label: "verification", icon: "scan", perm: "reports.view" },
  { href: "/app/maturity", label: "maturity watch", icon: "clock" },
  { href: "/app/renewals", label: "renewals", icon: "refresh" },
  { href: "/app/releases", label: "releases", icon: "handshake", phase: "p4" },
  { href: "/app/reports", label: "reports", icon: "chart", perm: "reports.view", phase: "p5" },
  { href: "/app/inbox", label: "inbox", icon: "bell" },
  { href: "/app/outbox", label: "email outbox", icon: "mail" },
  { href: "/app/audit", label: "audit ledger", icon: "link", perm: "ledger.view" },
  { href: "/app/admin", label: "admin", icon: "settings", perm: "admin.clock" },
];
