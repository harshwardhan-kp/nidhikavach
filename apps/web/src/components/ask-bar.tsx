"use client";

import { Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { askSearchAction } from "@/modules/assist/actions";

const EXAMPLES = ["fdrs maturing in 60 days, not renewed", "red cases in the western region", "bank mismatches above ₹20 lakh", "renewals overdue, high value"];

/** A3: plain-language ask in the top bar; lands on the cases list with editable chips. */
export function AskBar() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [hint] = useState(() => EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)]);
  return (
    <form
      className="flex min-w-0 flex-1 items-center gap-2 rounded-[12px] border border-line bg-card px-3 py-2 text-[13px] focus-within:border-ink"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        start(async () => {
          setError(null);
          const r = await askSearchAction(text);
          if (r.ok) router.push(r.url);
          else setError(r.message);
        });
      }}
    >
      {pending ? <Loader2 size={15} className="shrink-0 animate-spin text-mut" /> : <Search size={15} className="shrink-0 text-mut" />}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={`ask: “${hint}”`}
        aria-label="Ask in plain language"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-mut"
      />
      {error ? <span className="shrink-0 text-[11.5px] text-red">{error}</span> : <span className="tag shrink-0">[a3]</span>}
    </form>
  );
}
