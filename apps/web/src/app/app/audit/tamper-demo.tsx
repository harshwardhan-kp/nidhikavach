"use client";

import { ShieldAlert } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { simulateTamper, type TamperDemo as Demo } from "./actions";

export function TamperDemo() {
  const [state, action, pending] = useActionState<Demo>(simulateTamper, undefined);
  return (
    <div className="flex flex-col gap-3">
      <form action={action}>
        <Button type="submit" variant="light" disabled={pending}>
          {pending ? "[trying…]" : "[try to alter a past entry]"}
        </Button>
      </form>
      {state ? (
        <div className="rounded-[10px] border border-red/40 bg-red-soft/30 p-3 font-mono text-[12px]">
          <div className="flex items-center gap-1.5 font-sans text-[13px] font-semibold text-red">
            <ShieldAlert size={15} /> Entry #{state.seq} ({state.action}): change {state.field} {state.before} → {state.after}
          </div>
          <ol className="mt-2 flex flex-col gap-1.5">
            <li>
              1. database: <span className="text-red">{state.dbRefused ? `refused (${state.dbRefused})` : "accepted the write!"}</span>
            </li>
            <li>
              2. even with raw disk access, the content no longer matches its hash:
              <div className="pl-4 text-txt">stored&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{state.storedHash.slice(0, 32)}…</div>
              <div className="pl-4 text-red">recomputed {state.recomputed.slice(0, 32)}…</div>
            </li>
            <li>3. and the {state.later.toLocaleString("en-IN")} entries after it all point at the original hash, so verify-chain stops at #{state.seq}.</li>
          </ol>
        </div>
      ) : null}
    </div>
  );
}
