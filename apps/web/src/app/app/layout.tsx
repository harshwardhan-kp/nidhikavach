import { Search } from "lucide-react";
import { Logo } from "@/components/logo";
import { RoleSwitcher } from "@/components/role-switcher";
import { SidebarNav } from "@/components/sidebar";
import { Pill } from "@/components/ui";
import { can } from "@/lib/auth/roles";
import { requireUser } from "@/lib/auth/session";
import { getClockOffsetDays, today } from "@/lib/clock";
import { NAV } from "@/lib/nav";
import { formatDate } from "@/lib/utils";

export default async function PortalLayout({ children }: LayoutProps<"/app">) {
  const user = await requireUser();
  const [offset, todayIso] = await Promise.all([getClockOffsetDays(), today()]);
  const items = NAV.filter((i) => !i.perm || can(user.roles, i.perm));
  const scope = user.institutionName ?? (user.regionName ? `${user.regionName} region` : "all regions");

  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-[232px_1fr]">
      <aside className="hidden flex-col gap-6 border-r border-line bg-panel px-3 py-5 md:flex">
        <div className="px-2">
          <Logo href="/app" />
        </div>
        <SidebarNav items={items} />
        <div className="mt-auto rounded-[12px] border border-line bg-card p-3">
          <div className="tag">[scope]</div>
          <div className="mt-1 text-[12.5px] font-semibold">{scope}</div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/90 px-5 py-3 backdrop-blur md:px-8">
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-line bg-card px-3 py-2 text-[13px] text-mut">
            <Search size={15} className="shrink-0" />
            <span className="truncate">ask: “fdrs maturing in 60 days, not renewed”</span>
            <span className="tag ml-auto shrink-0">[p5]</span>
          </div>
          <div className="hidden items-center gap-2 lg:flex">
            <span className="tag text-[12px]">[{formatDate(todayIso)}]</span>
            {offset !== 0 ? <Pill tone="red">demo clock {offset > 0 ? `+${offset}` : offset}d</Pill> : null}
          </div>
          <RoleSwitcher user={user} />
        </header>
        <main className="flex-1 px-5 py-7 md:px-8">{children}</main>
      </div>
    </div>
  );
}
