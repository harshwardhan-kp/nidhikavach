import { Sparkles } from "lucide-react";
import type { TrustResult } from "@/lib/rules/trust";
import { riskLine } from "@/modules/verify/risk";

/** A9: streamed in after the page; the case renders without waiting for the model. */
export async function RiskLine(props: { caseNo: string; trust: TrustResult; discrepancies: string[]; lanes: Record<string, string>; tamperScore: number | null }) {
  const line = await riskLine(props).catch(() => null);
  if (!line) return null;
  return (
    <p className="flex items-start gap-2 text-[13.5px] leading-snug">
      <Sparkles size={14} className="mt-0.5 shrink-0 text-red" />
      <span>{line}</span>
    </p>
  );
}

export function RiskLineSkeleton() {
  return <div className="h-9 animate-pulse rounded-[8px] bg-line-2" aria-label="Writing the risk summary" />;
}
