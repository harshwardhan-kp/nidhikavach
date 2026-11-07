"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui";
import { login, type LoginState } from "@/lib/auth/actions";

export function LoginForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1.5">
        <span className="tag text-[12px]">[email]</span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={state?.email}
          key={state?.email}
          required
          className="rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] outline-none focus:border-ink"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="tag text-[12px]">[password]</span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] outline-none focus:border-ink"
        />
      </label>
      {state?.error ? (
        <p role="alert" className="text-[13px] text-red">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "[signing in…]" : "[sign in]"}
      </Button>
    </form>
  );
}
