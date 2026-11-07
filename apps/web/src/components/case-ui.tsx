import { label, RISK_TONE, toneOf } from "@/modules/cases/labels";
import { cn } from "@/lib/utils";
import { Pill } from "./ui";

export function LanePill({ value, className }: { value: string; className?: string }) {
  return (
    <Pill tone={toneOf(value)} className={className}>
      {label(value)}
    </Pill>
  );
}

const BAR = { red: "bg-red", amber: "bg-amber", green: "bg-green", unscored: "bg-mut" } as const;

export function TrustMeter({ score, band, size = "sm" }: { score: number | null; band: string; size?: "sm" | "lg" }) {
  const b = (band in BAR ? band : "unscored") as keyof typeof BAR;
  if (size === "lg") {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline gap-2">
          <span className={cn("font-serif text-[56px] leading-none", b === "red" && "text-red", b === "amber" && "text-amber", b === "green" && "text-green")}>
            {score ?? "—"}
          </span>
          <span className="tag text-[12px]">/ 100</span>
        </div>
        <div className="h-1.5 w-40 overflow-hidden rounded-full bg-line-2">
          <div className={cn("h-full rounded-full", BAR[b])} style={{ width: `${score ?? 0}%` }} />
        </div>
        <Pill tone={RISK_TONE[b]} className="w-fit">
          {b === "unscored" ? "not scored yet" : `${b} band`}
        </Pill>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2" title={score === null ? "Not scored yet" : `Trust ${score}/100`}>
      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-line-2">
        <div className={cn("h-full", BAR[b])} style={{ width: `${score ?? 0}%` }} />
      </div>
      <span className={cn("w-7 text-right font-mono text-[12px]", b === "red" && "text-red")}>{score ?? "—"}</span>
    </div>
  );
}

export function DaysLeft({ days }: { days: number | null }) {
  if (days === null) return null;
  if (days < 0) return <span className="font-mono text-[11px] text-red">{-days}d past</span>;
  return <span className={cn("font-mono text-[11px]", days <= 90 ? "text-amber" : "text-mut")}>{days}d left</span>;
}
