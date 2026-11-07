import "server-only";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { db, schema } from "@/db";

/**
 * The demo clock. Every lifecycle rule asks "what is today?" through here, so
 * the pitch can fast-forward time (T-90 -> T-7 -> matured) without fake data.
 */
export const DEMO_CLOCK_KEY = "demo_clock";

export const getClockOffsetDays = cache(async (): Promise<number> => {
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, DEMO_CLOCK_KEY)).limit(1);
  const v = row?.value as { offsetDays?: number } | undefined;
  return v?.offsetDays ?? 0;
});

/** Today's date in IST (YYYY-MM-DD), shifted by the demo clock. */
export async function today(): Promise<string> {
  const offset = await getClockOffsetDays();
  return istDate(new Date(Date.now() + offset * 86_400_000));
}

export function istDate(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

export async function setClockOffsetDays(offsetDays: number) {
  await db
    .insert(schema.settings)
    .values({ key: DEMO_CLOCK_KEY, value: { offsetDays } })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: { offsetDays }, updatedAt: new Date() } });
}
