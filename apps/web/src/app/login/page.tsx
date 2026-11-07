import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { Card, Simulated } from "@/components/ui";
import { demoAccounts, demoSignIn } from "@/lib/auth/actions";
import { ROLE_LABEL } from "@/lib/auth/roles";
import { getSessionUser } from "@/lib/auth/session";
import { DEMO_PASSWORD } from "@/db/seed/data";
import { LangToggle } from "@/components/lang-toggle";
import { tr } from "@/lib/i18n";
import { getLang } from "@/lib/lang";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next } = await searchParams;
  const nextPath = typeof next === "string" ? next : undefined;
  if (await getSessionUser()) redirect(nextPath ?? "/app");
  const accounts = await demoAccounts();
  const lang = await getLang();

  return (
    <main className="mx-auto grid min-h-screen max-w-[1040px] items-center gap-10 px-6 py-12 md:grid-cols-[1fr_1.1fr]">
      <div>
        <div className="flex items-center justify-between">
          <Logo />
          <LangToggle lang={lang} />
        </div>
        <h1 className="mt-10 font-serif text-[52px] leading-none tracking-[-1px]">
          {tr(lang, "every deposit, released")} <i>{tr(lang, "right")}</i>
        </h1>
        <p className="mt-4 max-w-[380px] text-[15px] leading-relaxed text-txt">
          {tr(lang, "Security deposit & FDR portal for the AICTE Regulation Bureau. Sign in with your portal account.")}
        </p>
        <Card className="mt-8 max-w-[380px] p-5">
          <LoginForm next={nextPath} />
        </Card>
        <p className="tag mt-4">[sih 2026 · ps sih26265 · team ait_g_spark]</p>
      </div>

      {accounts.length ? (
        <div>
          <div className="mb-3 flex items-center gap-2">
            <span className="kicker">{tr(lang, "demo accounts")}</span>
            <Simulated what="pitch prototype" />
          </div>
          <p className="mb-4 text-[13px] text-txt">
            {tr(lang, "One click signs you in as each role. Password for all six:")} <code className="font-mono text-ink">{DEMO_PASSWORD}</code>
          </p>
          <div className="flex flex-col gap-2">
            {accounts.map((a) => (
              <form key={a.id} action={demoSignIn}>
                <input type="hidden" name="userId" value={a.id} />
                <input type="hidden" name="next" value={nextPath ?? ""} />
                <button
                  type="submit"
                  className="group flex w-full items-center justify-between gap-4 rounded-[12px] border border-line bg-card px-4 py-3 text-left transition-colors hover:border-ink"
                >
                  <span>
                    <span className="block text-[14px] font-semibold">{a.name}</span>
                    <span className="block text-[12.5px] text-txt">{a.designation}</span>
                  </span>
                  <span className="tag shrink-0 text-[11px] group-hover:text-ink">[{ROLE_LABEL[a.role].toLowerCase()}] →</span>
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
    </main>
  );
}
