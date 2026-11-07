/**
 * Runs the lifecycle pass once from the command line.
 *   --silent : record due reminders as already sent, without messages (right after a reseed)
 */
import { today } from "@/lib/clock";
import { runLifecycle } from "@/modules/lifecycle/run";

const silent = process.argv.includes("--silent");
const stats = await runLifecycle(await today(), null, { reason: silent ? "after seed (silent)" : "manual run", notify: !silent });
console.log(stats);
process.exit(0);
