import { CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { Card, PageHeader, Pill } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { healthChecks } from "@/modules/oversight/health";

export const metadata: Metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  await requireUser();
  const checks = await healthChecks();
  return (
    <>
      <PageHeader title="integrations" italic="& status" sub="[checked live on every load · what is real, what is simulated, and what replaces it in production]" />
      <Card className="divide-y divide-line-2">
        {checks.map((c) => (
          <div key={c.name} className="grid gap-2 px-5 py-4 md:grid-cols-[28px_1.2fr_1.6fr_1.4fr] md:items-start">
            {c.ok === true ? <CheckCircle2 size={18} className="text-green" /> : c.ok === false ? <XCircle size={18} className="text-red" /> : <CircleDashed size={18} className="text-amber" />}
            <div>
              <div className="font-semibold">{c.name}</div>
              <Pill tone={c.kind === "real" ? "green" : c.kind === "simulated" ? "amber" : "blue"} className="mt-1">
                {c.kind}
              </Pill>
            </div>
            <div className={cn("font-mono text-[12px]", c.ok === false ? "text-red" : "text-txt")}>{c.detail}</div>
            <div className="text-[12.5px]">
              <span className="tag">[production]</span> {c.production}
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}
