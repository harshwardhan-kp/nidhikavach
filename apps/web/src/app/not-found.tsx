import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-[520px] flex-col justify-center gap-6 px-6">
      <Logo href="/app" />
      <div>
        <div className="kicker">404 · not found</div>
        <h1 className="mt-3 font-serif text-[40px] leading-none">nothing here, or not in your scope</h1>
        <p className="mt-3 text-[14px] text-txt">
          The record may not exist, or it belongs to an institution or region outside what your role can see.
        </p>
      </div>
      <Link href="/app/cases" className="w-fit rounded-[10px] bg-ink-2 px-4 py-2.5 font-mono text-[13px] text-white hover:opacity-85">
        [back to cases]
      </Link>
    </main>
  );
}
