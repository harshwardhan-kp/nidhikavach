"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/lib/auth/session";
import { getClockOffsetDays, istDate, setClockOffsetDays } from "@/lib/clock";
import { appendLedger } from "@/lib/ledger";
import { runLifecycle } from "@/modules/lifecycle/run";

export async function moveClock(formData: FormData) {
  const user = await requirePermission("admin.clock");
  const mode = z.enum(["add", "reset"]).parse(formData.get("mode"));
  const days = z.coerce.number().int().min(-3650).max(3650).parse(formData.get("days") ?? 0);
  const before = await getClockOffsetDays();
  const after = mode === "reset" ? 0 : before + days;
  await setClockOffsetDays(after);
  await appendLedger({ actor: user, action: "demo_clock.moved", entity: "settings", entityId: "demo_clock", payload: { before, after } });
  // Time moved: re-derive lanes and send whatever reminders have now fallen due.
  // (today() is cached per request, so compute the new date directly.)
  await runLifecycle(istDate(new Date(Date.now() + after * 86_400_000)), user, { reason: `demo clock ${before} -> ${after} days` });
  revalidatePath("/app", "layout");
}
