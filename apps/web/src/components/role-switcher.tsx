import { ChevronDown, LogOut } from "lucide-react";
import { demoAccounts, demoSignIn, logout } from "@/lib/auth/actions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

function initials(name: string) {
  return name
    .replace(/^Dr\.\s*/, "")
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** User chip with a demo role switcher (native <details>, no client JS needed). */
export async function RoleSwitcher({ user }: { user: SessionUser }) {
  const accounts = user.isDemo ? await demoAccounts() : [];
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 rounded-[12px] border border-line bg-card px-2.5 py-1.5 hover:border-ink [&::-webkit-details-marker]:hidden">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-ink-2 font-mono text-[11px] text-white">{initials(user.name)}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold">{user.name}</span>
          <span className="tag block">{ROLE_LABEL[user.primaryRole].toLowerCase()}</span>
        </span>
        <ChevronDown size={14} className="text-mut transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[320px] rounded-[14px] border border-line bg-card p-2 shadow-[0_12px_40px_rgba(0,0,0,0.08)]">
        <div className="px-2.5 py-2">
          <div className="text-[13px] font-semibold">{user.name}</div>
          <div className="text-[12px] text-txt">{user.designation}</div>
          <div className="tag mt-1">{user.email}</div>
        </div>
        {accounts.length ? (
          <>
            <div className="tag mt-1 border-t border-line-2 px-2.5 pt-2.5 pb-1">[switch role · demo]</div>
            {accounts.map((a) => (
              <form key={a.id} action={demoSignIn}>
                <input type="hidden" name="userId" value={a.id} />
                <button
                  type="submit"
                  disabled={a.id === user.id}
                  className={cn(
                    "flex w-full items-center justify-between rounded-[9px] px-2.5 py-2 text-left text-[13px] hover:bg-chip disabled:bg-chip",
                  )}
                >
                  <span>{a.name}</span>
                  <span className="tag">{a.id === user.id ? "[current]" : `[${a.role}]`}</span>
                </button>
              </form>
            ))}
          </>
        ) : null}
        <form action={logout} className="mt-1 border-t border-line-2 pt-1">
          <button type="submit" className="flex w-full items-center gap-2 rounded-[9px] px-2.5 py-2 text-left text-[13px] text-txt hover:bg-chip">
            <LogOut size={14} /> sign out
          </button>
        </form>
      </div>
    </details>
  );
}
