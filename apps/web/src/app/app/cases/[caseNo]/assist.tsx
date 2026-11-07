"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { briefAction, draftAction, sendDraftAction } from "@/modules/assist/actions";
import type { Brief } from "@/modules/assist/brief";

/** A4: one click, a cited five-line history. Citations jump to the audit trail entry. */
export function CaseBrief({ caseNo }: { caseNo: string }) {
  const [pending, start] = useTransition();
  const [brief, setBrief] = useState<(Brief & { cached: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = () =>
    start(async () => {
      setError(null);
      const r = await briefAction(caseNo);
      if (r.ok) setBrief(r.brief);
      else setError(r.message);
    });

  if (!brief) {
    return (
      <div>
        <Button variant="light" size="sm" onClick={run} disabled={pending}>
          {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {pending ? "[reading the record…]" : "[brief me on this case]"}
        </Button>
        {error ? <p className="mt-2 text-[12px] text-red">{error}</p> : null}
      </div>
    );
  }
  return (
    <div className="text-[13px]">
      <ol className="flex flex-col gap-2">
        {brief.lines.map((l, n) => (
          <li key={n} className="leading-snug">
            {l.text}{" "}
            {l.cites.map((c) => {
              const seq = c.match(/^#(\d+)$/)?.[1];
              return seq ? (
                <a key={c} href={`#ledger-${seq}`} className="tag mr-1 rounded bg-chip px-1 hover:text-ink">
                  {c}
                </a>
              ) : (
                <span key={c} className="tag mr-1 rounded bg-chip px-1">
                  {c}
                </span>
              );
            })}
          </li>
        ))}
      </ol>
      <p className="mt-3 rounded-[9px] border border-amber/40 bg-amber-soft/50 px-3 py-2 text-[12.5px]">
        <b>Blocking:</b> {brief.blocking}
      </p>
      <p className="tag mt-2">[gpt-6.1-terra · built only from this case&apos;s record · {brief.cached ? "from cache" : "fresh"} · advisory]</p>
    </div>
  );
}

const KINDS = [
  ["discrepancy_letter", "letter to the institution"],
  ["bank_request", "verification request to the bank"],
  ["escalation_note", "escalation note"],
] as const;

const field = "w-full rounded-[9px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-ink";

/** A6: the model drafts, the officer edits, then it goes to the outbox. */
export function DraftPanel({ caseNo, suggested }: { caseNo: string; suggested: (typeof KINDS)[number][0] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [kind, setKind] = useState<string>(suggested);
  const [lang, setLang] = useState("en");
  const [draft, setDraft] = useState<{ subject: string; body: string; callId: string; to: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const make = () =>
    start(async () => {
      setMsg(null);
      const r = await draftAction(caseNo, kind, lang);
      if (r.ok) setDraft({ ...r.draft, to: r.to });
      else setMsg({ ok: false, text: r.message });
    });
  const send = () =>
    start(async () => {
      if (!draft) return;
      const r = await sendDraftAction(caseNo, { kind, subject: draft.subject, body: draft.body, callId: draft.callId });
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        setDraft(null);
        router.refresh();
      }
    });

  return (
    <div className="text-[13px]">
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} className={cn(field, "w-auto")} disabled={pending || !!draft}>
          {KINDS.map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select value={lang} onChange={(e) => setLang(e.target.value)} className={cn(field, "w-auto")} disabled={pending || !!draft}>
          <option value="en">English</option>
          <option value="hi">हिन्दी</option>
        </select>
        {!draft ? (
          <Button size="sm" variant="light" onClick={make} disabled={pending}>
            {pending ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {pending ? "[drafting…]" : "[draft it]"}
          </Button>
        ) : null}
      </div>
      {draft ? (
        <div className="mt-3 flex flex-col gap-2">
          <div className="tag">[to: {draft.to}]</div>
          <input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={cn(field, "font-semibold")} aria-label="Subject" />
          <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} rows={12} className={field} aria-label="Letter" />
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={send} disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}[send to outbox]
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={pending}>
              [discard]
            </Button>
            <span className="tag ml-auto">[drafted by gpt-6.1-terra · you are the sender]</span>
          </div>
        </div>
      ) : null}
      {msg ? <p className={cn("mt-2 text-[12.5px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</p> : null}
    </div>
  );
}
