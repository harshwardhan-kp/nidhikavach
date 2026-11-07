"use client";

import Form from "next/form";
import { useRef } from "react";
import { label, LANE_VALUES } from "@/modules/cases/labels";

type Props = {
  values: Record<string, string | undefined>;
  regions: { id: number; code: string; name: string }[] | null;
};

const select = "rounded-[9px] border border-line bg-card px-2.5 py-1.5 font-mono text-[12px] text-ink outline-none focus:border-ink";

function LaneSelect({ name, options, all, value, onChange }: { name: string; options: readonly string[]; all: string; value?: string; onChange: () => void }) {
  return (
    <select name={name} defaultValue={value ?? ""} onChange={onChange} className={select} aria-label={name}>
      <option value="">{all}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );
}

export function FilterBar({ values, regions }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const submit = () => ref.current?.requestSubmit();
  return (
    <Form ref={ref} action="/app/cases" className="mb-4 flex flex-wrap items-center gap-2">
      <input
        name="q"
        defaultValue={values.q ?? ""}
        placeholder="case no., FDR no., institution, AICTE id"
        className="min-w-[260px] flex-1 rounded-[10px] border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-ink"
      />
      <select name="view" defaultValue={values.view ?? "open"} onChange={submit} className={select} aria-label="view">
        <option value="open">open cases</option>
        <option value="action">needs action</option>
        <option value="mine">assigned to me</option>
        <option value="all">all, incl. closed</option>
      </select>
      <LaneSelect name="risk" options={["red", "amber", "green", "unscored"]} all="any risk" value={values.risk} onChange={submit} />
      <LaneSelect name="record" options={LANE_VALUES.record} all="record: any" value={values.record} onChange={submit} />
      <LaneSelect name="verification" options={LANE_VALUES.verification} all="verification: any" value={values.verification} onChange={submit} />
      <LaneSelect name="validity" options={LANE_VALUES.validity} all="validity: any" value={values.validity} onChange={submit} />
      <LaneSelect name="renewal" options={LANE_VALUES.renewal} all="renewal: any" value={values.renewal} onChange={submit} />
      <LaneSelect name="release" options={LANE_VALUES.release} all="release: any" value={values.release} onChange={submit} />
      {regions ? (
        <select name="region" defaultValue={values.region ?? ""} onChange={submit} className={select} aria-label="region">
          <option value="">all regions</option>
          {regions.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      ) : null}
      <select name="sort" defaultValue={values.sort ?? "risk"} onChange={submit} className={select} aria-label="sort">
        <option value="risk">sort: risk</option>
        <option value="maturity">sort: maturity</option>
        <option value="amount">sort: amount</option>
        <option value="recent">sort: recent</option>
      </select>
      <button type="submit" className="rounded-[9px] bg-ink-2 px-3 py-1.5 font-mono text-[12px] text-white hover:opacity-85">
        [search]
      </button>
    </Form>
  );
}
