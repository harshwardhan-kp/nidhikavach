"use client";

import {
  BarChart3,
  Clock,
  FolderOpen,
  Handshake,
  LayoutGrid,
  Link2,
  RefreshCw,
  ScanLine,
  Settings,
  FileSpreadsheet,
  Upload,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  layout: LayoutGrid,
  folder: FolderOpen,
  scan: ScanLine,
  clock: Clock,
  refresh: RefreshCw,
  handshake: Handshake,
  chart: BarChart3,
  link: Link2,
  settings: Settings,
  upload: Upload,
  sheet: FileSpreadsheet,
};

export function SidebarNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5" aria-label="Portal">
      {items.map((item) => {
        const Icon = ICONS[item.icon] ?? LayoutGrid;
        const active = item.href === "/app" ? pathname === "/app" : pathname.startsWith(item.href);
        if (item.phase) {
          return (
            <span
              key={item.href}
              className="flex cursor-default items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] text-mut"
              title={`Arrives in phase ${item.phase.toUpperCase()}`}
            >
              <Icon size={15} strokeWidth={1.6} />
              <span className="flex-1">{item.label}</span>
              <span className="tag text-[10px]">[{item.phase}]</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[9px] px-3 py-2 text-[13.5px] text-txt transition-colors hover:bg-chip hover:text-ink",
              active && "bg-chip font-semibold text-ink",
            )}
          >
            <Icon size={15} strokeWidth={1.6} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
