import Link from "next/link";
import { Logo } from "@/components/logo";

export default function Forbidden() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-6 px-6">
      <Logo href="/app" />
      <div>
        <div className="kicker">403 · not allowed</div>
        <h1 className="mt-3 font-serif text-[40px] leading-none">this page isn&apos;t part of your role</h1>
        <p className="mt-3 text-[14px] text-txt">
          Access follows the permission matrix: each role sees only what it needs. In the demo you can switch role from the top-right menu.
        </p>
      </div>
      <Link href="/app" className="w-fit rounded-[10px] bg-ink-2 px-4 py-2.5 font-mono text-[13px] text-white hover:opacity-85">
        [back to overview]
      </Link>
    </main>
  );
}
