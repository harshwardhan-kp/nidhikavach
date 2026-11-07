"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import type { Lang } from "@/lib/i18n";
import { setLang } from "@/lib/lang-actions";
import { cn } from "@/lib/utils";

/** EN / हिं switch: a cookie the server reads; the page re-renders in place. */
export function LangToggle({ lang }: { lang: Lang }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const set = (l: Lang) =>
    start(async () => {
      await setLang(l);
      router.refresh();
    });
  return (
    <div className="flex overflow-hidden rounded-[10px] border border-line bg-card font-mono text-[11.5px]" role="group" aria-label="Language">
      {(["en", "hi"] as const).map((l) => (
        <button key={l} type="button" disabled={pending} onClick={() => set(l)} aria-pressed={lang === l} className={cn("px-2 py-1.5", lang === l ? "bg-ink-2 text-white" : "text-txt hover:text-ink")}>
          {l === "en" ? "EN" : "हिं"}
        </button>
      ))}
    </div>
  );
}
