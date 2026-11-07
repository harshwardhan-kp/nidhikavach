import { Sparkles } from "lucide-react";
import { Card } from "@/components/ui";
import type { SessionUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils";
import { bureauBriefing } from "@/modules/assist/briefing";
import { briefingFacts } from "@/modules/oversight/queries";

const DOT = { risk: "bg-red", progress: "bg-green", watch: "bg-amber" } as const;

export async function BriefingCard({ user, today }: { user: SessionUser; today: string }) {
  const b = await bureauBriefing(await briefingFacts(user, today), user.id).catch(() => null);
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="kicker">weekly bureau briefing</div>
        <span className="tag">[a10 · gpt-6.1-terra · aggregates only{b?.cached ? " · cached" : ""}]</span>
      </div>
      {b ? (
        <>
          <p className="mt-3 font-serif text-[22px] leading-snug">{b.headline}</p>
          <ul className="mt-3 flex flex-col gap-2 text-[13px]">
            {b.points.map((p) => (
              <li key={p.text} className="flex gap-2">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", DOT[p.tone])} />
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
          {b.asks.length ? (
            <div className="mt-3 rounded-[10px] border border-line-2 bg-panel px-3 py-2 text-[12.5px]">
              <span className="tag">[for your decision]</span>
              <ul className="mt-1 flex flex-col gap-1">
                {b.asks.map((a) => (
                  <li key={a} className="flex gap-1.5">
                    <Sparkles size={12} className="mt-0.5 shrink-0 text-red" /> {a}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : (
        <p className="mt-3 text-[13px] text-txt">The briefing could not be written right now.</p>
      )}
    </Card>
  );
}

export function BriefingSkeleton() {
  return (
    <Card className="p-5">
      <div className="kicker">weekly bureau briefing</div>
      <div className="mt-3 h-6 w-3/4 animate-pulse rounded bg-line-2" />
      <div className="mt-3 flex flex-col gap-2">
        {[0, 1, 2, 3].map((k) => (
          <div key={k} className="h-4 animate-pulse rounded bg-line-2" />
        ))}
      </div>
    </Card>
  );
}
