"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { discrepancyAction, type ActionResult } from "@/modules/verify/actions";

type Op = "ask" | "respond" | "resolve" | "close" | "reopen";

const OP_LABEL: Record<Op, string> = {
  ask: "ask the institution",
  respond: "send response",
  resolve: "mark resolved",
  close: "close as checker",
  reopen: "reopen",
};

const PLACEHOLDER: Record<Op, string> = {
  ask: "What should the institution clarify or upload?",
  respond: "Your explanation for the dealing officer",
  resolve: "How it was resolved (the checker will read this)",
  close: "Optional note",
  reopen: "Why it needs another look",
};

/** Buttons for the transitions this user may make on one discrepancy. */
export function DiscrepancyControls({ caseNo, id, ops, resolvedByMe }: { caseNo: string; id: string; ops: Op[]; resolvedByMe: boolean }) {
  const [op, setOp] = useState<Op | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);

  if (!ops.length) return null;

  function send(o: Op) {
    setResult(null);
    start(async () => {
      const r = await discrepancyAction(caseNo, id, o, text);
      setResult(r);
      if (r.ok) {
        setOp(null);
        setText("");
        router.refresh();
      }
    });
  }

  return (
    <div className="mt-2.5">
      <div className="flex flex-wrap gap-1.5">
        {ops.map((o) => (
          <Button
            key={o}
            size="sm"
            variant={op === o ? "dark" : "light"}
            disabled={pending || (o === "close" && resolvedByMe)}
            title={o === "close" && resolvedByMe ? "You resolved it, so another officer must close it" : undefined}
            onClick={() => (o === "close" ? send(o) : setOp(op === o ? null : o))}
          >
            {pending && (op === o || o === "close") ? <Loader2 size={12} className="animate-spin" /> : null}[{OP_LABEL[o]}]
          </Button>
        ))}
      </div>
      {op && op !== "close" ? (
        <div className="mt-2 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            placeholder={PLACEHOLDER[op]}
            className="w-full rounded-[9px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-ink"
          />
          <Button size="sm" className="w-fit" disabled={pending || text.trim().length < 5} onClick={() => send(op)}>
            [{OP_LABEL[op]}]
          </Button>
        </div>
      ) : null}
      {result ? <p className={cn("mt-1.5 text-[12px]", result.ok ? "text-green" : "text-red")}>{result.message}</p> : null}
    </div>
  );
}
