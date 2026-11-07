"use client";

import { Loader2, Send, Wrench } from "lucide-react";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { askCaseAction } from "@/modules/assist/actions";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[] };

/** Just enough markdown for chat answers: **bold** and "- " bullets. */
function Rich({ text }: { text: string }) {
  const inline = (t: string) => t.split(/(\*\*[^*]+\*\*)/g).map((part, k) => (part.startsWith("**") && part.endsWith("**") ? <b key={k}>{part.slice(2, -2)}</b> : part));
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (bullets.length) blocks.push(<ul key={`u${blocks.length}`} className="my-1 list-disc pl-4">{bullets.map((b, k) => <li key={k}>{inline(b)}</li>)}</ul>);
    bullets = [];
  };
  for (const line of text.split("\n")) {
    if (/^\s*[-*] /.test(line)) bullets.push(line.replace(/^\s*[-*] /, ""));
    else {
      flush();
      if (line.trim()) blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>);
    }
  }
  flush();
  return <div className="flex flex-col gap-1">{blocks}</div>;
}

const STARTERS = ["Why is the trust score what it is?", "What has happened on this case so far?", "Can this deposit be released?", "What should I do next, and why?"];

/** A5: chat about this case; the model reads through read-only tools bound to it. */
export function AskCase({ caseNo }: { caseNo: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const send = (q: string) => {
    if (!q.trim()) return;
    const next: Msg[] = [...msgs, { role: "user", content: q.trim() }];
    setMsgs(next);
    setText("");
    setError(null);
    start(async () => {
      const r = await askCaseAction(caseNo, next.map(({ role, content }) => ({ role, content })));
      if (r.ok) setMsgs([...next, { role: "assistant", content: r.answer, tools: r.tools }]);
      else setError(r.message);
    });
  };

  return (
    <div className="flex flex-col gap-3 text-[13px]">
      {msgs.length ? (
        <ol className="flex max-h-[420px] flex-col gap-2.5 overflow-y-auto pr-1">
          {msgs.map((m, k) => (
            <li key={k} className={cn("rounded-[10px] px-3 py-2", m.role === "user" ? "ml-8 bg-ink-2 text-white" : "mr-4 border border-line-2 bg-panel")}>
              {m.role === "assistant" ? <Rich text={m.content} /> : <p className="whitespace-pre-wrap">{m.content}</p>}
              {m.tools?.length ? (
                <p className="tag mt-1 flex flex-wrap items-center gap-1">
                  <Wrench size={10} /> read: {m.tools.join(", ")}
                </p>
              ) : null}
            </li>
          ))}
          {pending ? (
            <li className="mr-4 flex items-center gap-2 rounded-[10px] border border-line-2 bg-panel px-3 py-2 text-txt">
              <Loader2 size={13} className="animate-spin" /> looking it up…
            </li>
          ) : null}
        </ol>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {STARTERS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)} disabled={pending} className="rounded-full bg-chip px-2.5 py-1 text-left text-[12px] text-txt hover:text-ink">
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-2 rounded-[10px] border border-line bg-white px-2.5 py-1.5 focus-within:border-ink"
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask about this case…" className="min-w-0 flex-1 bg-transparent py-1 outline-none" disabled={pending} />
        <button type="submit" disabled={pending || !text.trim()} className="text-txt hover:text-ink disabled:opacity-40" aria-label="Send">
          <Send size={15} />
        </button>
      </form>
      {error ? <p className="text-[12px] text-red">{error}</p> : null}
      <p className="tag">[gpt-6.1-terra · read-only tools for this case and the handbook · advisory]</p>
    </div>
  );
}
