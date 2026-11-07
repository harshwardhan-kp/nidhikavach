"use client";

import { BookOpen, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button, Card, Pill } from "@/components/ui";
import { askHandbookAction } from "@/modules/assist/actions";
import type { HandbookAnswer } from "@/modules/assist/rules";

const VERDICT = { yes: ["green", "yes"], no: ["red", "no"], depends: ["amber", "depends on the facts"], not_covered: ["neutral", "not covered by the notes"] } as const;

export function HandbookChat({ initialQuestion, caseNo, suggested }: { initialQuestion: string; caseNo: string | null; suggested: string[] }) {
  const [question, setQuestion] = useState(initialQuestion);
  const [pending, start] = useTransition();
  const [answer, setAnswer] = useState<HandbookAnswer | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const auto = useRef(false);

  const ask = (q: string) =>
    start(async () => {
      setError(null);
      setAsked(q);
      const r = await askHandbookAction(q, caseNo);
      if (r.ok) setAnswer(r.answer);
      else {
        setAnswer(null);
        setError(r.message);
      }
    });

  // Questions linked from a case page are asked straight away.
  useEffect(() => {
    if (initialQuestion && !auto.current) {
      auto.current = true;
      ask(initialQuestion);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="flex flex-col gap-4">
        <Card className="p-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
            className="flex flex-col gap-3"
          >
            {caseNo ? (
              <p className="tag text-[12px]">
                [about{" "}
                <Link href={`/app/cases/${caseNo}`} className="underline hover:text-ink">
                  {caseNo}
                </Link>
                : its dates, lanes and release checklist are given to the model]
              </p>
            ) : null}
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={3}
              placeholder="e.g. Can this deposit be released before ten years?"
              className="w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] outline-none focus:border-ink"
            />
            <Button disabled={pending || question.trim().length < 8} className="w-fit">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              {pending ? "[reading the handbook…]" : "[ask]"}
            </Button>
          </form>
        </Card>

        {error ? <p className="text-[13px] text-red">{error}</p> : null}
        {answer && asked ? (
          <Card className="p-5">
            <div className="tag">[question]</div>
            <p className="mt-1 text-[14px] font-semibold">{asked}</p>
            <div className="mt-4 flex items-center gap-2">
              <Pill tone={VERDICT[answer.verdict][0]}>{VERDICT[answer.verdict][1]}</Pill>
              <span className="tag">gpt-6.1-terra · {answer.cached ? "from cache" : "fresh"} · advisory</span>
            </div>
            <p className="mt-2 text-[14px] leading-relaxed">{answer.answer}</p>
            {answer.checkNext.length ? (
              <>
                <div className="tag mt-4">[check next]</div>
                <ul className="mt-1 list-disc pl-5 text-[13px]">
                  {answer.checkNext.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {answer.notes.length ? (
              <>
                <div className="tag mt-4">[sources]</div>
                <ul className="mt-1 flex flex-col gap-2">
                  {answer.notes.map((n) => (
                    <li key={n.id} className="rounded-[9px] border border-line-2 bg-panel px-3 py-2 text-[12.5px]">
                      <div className="flex items-center gap-2 font-semibold">
                        <BookOpen size={13} /> {n.clause} · {n.title}
                      </div>
                      <p className="mt-0.5 text-txt">{n.body}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </Card>
        ) : null}
      </div>

      <Card className="h-fit p-5">
        <div className="kicker">try</div>
        <ul className="mt-2 flex flex-col gap-1.5">
          {suggested.map((s) => (
            <li key={s}>
              <button
                type="button"
                className="text-left text-[13px] text-txt underline-offset-2 hover:text-ink hover:underline"
                onClick={() => {
                  setQuestion(s);
                  ask(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
        <p className="tag mt-4 text-[11.5px]">
          Sources are our paraphrase of the handbook&apos;s security-deposit clauses (1.12, 2.21, 4.10, 6.46, Affidavits 3 and 6), found by meaning with pgvector. Check the clause before acting.
        </p>
      </Card>
    </div>
  );
}
