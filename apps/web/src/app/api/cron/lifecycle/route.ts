import { today } from "@/lib/clock";
import { env } from "@/lib/env";
import { runLifecycle } from "@/modules/lifecycle/run";

export const maxDuration = 60;

/** Daily lifecycle pass, called by Vercel Cron with the project's CRON_SECRET. */
export async function GET(req: Request) {
  if (!env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${env.CRON_SECRET}`) {
    return new Response("unauthorised", { status: 401 });
  }
  const stats = await runLifecycle(await today(), null, { reason: "daily cron" });
  return Response.json(stats);
}
