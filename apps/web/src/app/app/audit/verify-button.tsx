"use client";

import { ShieldCheck, ShieldAlert } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui";
import { verifyChain, type VerifyState } from "./actions";

export function VerifyButton() {
  const [state, action, pending] = useActionState<VerifyState>(verifyChain, undefined);
  return (
    <div className="flex flex-wrap items-center gap-3">
      {state ? (
        state.ok ? (
          <span className="flex items-center gap-1.5 font-mono text-[12px] text-green">
            <ShieldCheck size={15} /> chain intact · {state.checked} entries checked
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-mono text-[12px] text-red">
            <ShieldAlert size={15} /> broken at #{state.firstBadSeq}: {state.reason}
          </span>
        )
      ) : null}
      <form action={action}>
        <Button type="submit" disabled={pending}>
          {pending ? "[verifying…]" : "[verify chain]"}
        </Button>
      </form>
    </div>
  );
}
