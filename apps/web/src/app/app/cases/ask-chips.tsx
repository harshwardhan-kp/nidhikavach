import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { label } from "@/modules/cases/labels";

const NAMES: Record<string, (v: string, regions: { id: number; name: string }[] | null) => string> = {
  q: (v) => `matches “${v}”`,
  view: (v) => ({ action: "needs action", mine: "assigned to me", all: "incl. closed", open: "open" })[v] ?? v,
  risk: (v) => `${v} risk`,
  record: (v) => `record ${label(v)}`,
  verification: (v) => `bank ${label(v)}`,
  validity: (v) => label(v),
  renewal: (v) => `renewal ${label(v)}`,
  release: (v) => `release ${label(v)}`,
  region: (v, r) => r?.find((x) => String(x.id) === v)?.name ?? `region ${v}`,
  within: (v) => `matures within ${v} days`,
  maturedAgo: (v) => `matured ${v}+ days ago`,
  minLakh: (v) => `≥ ₹${v} lakh`,
  sort: (v) => `sorted by ${v}`,
};

/** Shows what a plain-language ask turned into, each chip removable. */
export function AskChips({ values, regions }: { values: Record<string, string | undefined>; regions: { id: number; name: string }[] | null }) {
  if (!values.ask) return null;
  const keys = Object.keys(NAMES).filter((k) => values[k]);
  const without = (key: string) => {
    const qs = new URLSearchParams(Object.entries(values).filter(([k, v]) => v && k !== key && k !== "page") as [string, string][]);
    return `/app/cases?${qs}`;
  };
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[12px] border border-line bg-card px-3 py-2.5 text-[12.5px]">
      <Sparkles size={14} className="text-red" />
      <span className="text-txt">“{values.ask}” →</span>
      {keys.map((k) => (
        <Link key={k} href={without(k)} className="inline-flex items-center gap-1 rounded-full bg-chip px-2 py-0.5 font-mono text-[11.5px] hover:bg-red-soft hover:text-red" title="remove">
          {NAMES[k](values[k]!, regions)} <X size={11} />
        </Link>
      ))}
      <span className="tag ml-auto">[a3 · gpt-6-luna read only your words · edit any chip]</span>
    </div>
  );
}
