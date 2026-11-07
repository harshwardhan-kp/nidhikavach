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
  { href: "/app/releases", label: "releases", icon: "handshake", perm: "reports.view" },
  { href: "/app/rules", label: "ask the handbook", icon: "book", perm: "reports.view" },
  { href: "/app/reports", label: "reports", icon: "chart", perm: "reports.view" },
  { href: "/app/metrics", label: "metrics", icon: "gauge", perm: "reports.view" },
  { href: "/app/inbox", label: "inbox", icon: "bell" },
  { href: "/app/outbox", label: "email outbox", icon: "mail" },
  { href: "/app/audit", label: "audit ledger", icon: "link", perm: "ledger.view" },
  { href: "/app/integrations", label: "integrations", icon: "plug" },
  { href: "/app/security", label: "security", icon: "shield" },
  { href: "/app/admin", label: "admin", icon: "settings", perm: "admin.clock" },
];
