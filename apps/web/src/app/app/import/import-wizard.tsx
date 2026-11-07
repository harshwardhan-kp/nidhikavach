"use client";

import { FileSpreadsheet, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/browser";
import { useState, useTransition } from "react";
import { Button, Card, Pill } from "@/components/ui";
import { cn } from "@/lib/utils";
import { commitImport, suggestMapping, validateImport } from "@/modules/import/actions";
import { IMPORT_FIELDS, type ImportFieldKey, type MappingSuggestion, type RowResult } from "@/modules/import/fields";

type Parsed = { name: string; headers: string[]; rows: Record<string, string>[] };

const cell = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? "" : String(v));

async function parseFile(file: File): Promise<Parsed> {
  if (/\.xlsx$/i.test(file.name)) {
    const sheet = (await readSheet(file)) as unknown[][];
    const [head = [], ...body] = sheet;
    const headers = head.map((h, i) => cell(h).trim() || `Column ${i + 1}`);
    const rows = body
      .filter((r) => r.some((c) => cell(c).trim()))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, cell(r[i]).trim()])));
    return { name: file.name, headers, rows };
  }
  return new Promise((resolve, reject) =>
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h, i) => h.trim() || `Column ${i + 1}`,
      complete: (res) => resolve({ name: file.name, headers: res.meta.fields ?? [], rows: res.data.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").trim()]))) }),
      error: reject,
    }),
  );
}

const STATUS_TONE = { ok: "green", review: "amber", error: "red" } as const;

export function ImportWizard() {
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<MappingSuggestion[] | null>(null);
  const [aiMeta, setAiMeta] = useState<{ dateOrder: string; cached: boolean } | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, string | null>>>({});
  const [results, setResults] = useState<RowResult[] | null>(null);
  const [done, setDone] = useState<{ created: string[]; rejected: number } | null>(null);
  const [pending, start] = useTransition();
  const [step, setStep] = useState<string>("");

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setResults(null);
    setDone(null);
    setSuggestions(null);
    start(async () => {
      try {
        setStep("reading the file");
        const p = await parseFile(file);
        if (!p.rows.length) throw new Error("No rows found in the file.");
        if (p.rows.length > 500) throw new Error("Import up to 500 rows at a time.");
        setParsed(p);
        setStep("asking the model to map columns");
        const s = await suggestMapping(p.headers, p.rows.slice(0, 6).map((r) => p.headers.map((h) => r[h] ?? "")));
        setSuggestions(s.suggestions);
        setAiMeta({ dateOrder: s.dateOrder, cached: s.cached });
        setMapping(Object.fromEntries(s.suggestions.map((x) => [x.field, x.column])));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not read the file.");
      } finally {
        setStep("");
      }
    });
  }

  function onValidate() {
    if (!parsed) return;
    start(async () => {
      setStep("checking every row");
      setResults(await validateImport(parsed.rows, mapping as Record<string, string | null>));
      setStep("");
    });
  }

  function onCommit() {
    if (!parsed) return;
    start(async () => {
      setStep("creating cases");
      setDone(await commitImport(parsed.name, parsed.rows, mapping as Record<string, string | null>));
      setStep("");
    });
  }

  const counts = results ? { ok: results.filter((r) => r.status === "ok").length, review: results.filter((r) => r.status === "review").length, error: results.filter((r) => r.status === "error").length } : null;

  return (
    <div className="flex flex-col gap-4">
      <Card className="p-5">
        <div className="kicker">1 · legacy register</div>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <label className="flex cursor-pointer items-center gap-3 rounded-[12px] border border-dashed border-line px-5 py-4 hover:border-ink">
            <FileSpreadsheet size={20} className="text-txt" />
            <span className="text-[13px]">{parsed ? `${parsed.name} · ${parsed.rows.length} rows · ${parsed.headers.length} columns` : "Choose an Excel (.xlsx) or CSV register"}</span>
            <input type="file" accept=".xlsx,.csv,text/csv" className="sr-only" onChange={(e) => onFile(e.currentTarget.files?.[0])} />
          </label>
          <a href="/samples/legacy-register-western.xlsx" className="tag hover:text-ink" download>
            [download a sample messy register]
          </a>
          {pending && step ? (
            <span className="flex items-center gap-1.5 text-[12.5px] text-txt">
              <Loader2 size={14} className="animate-spin" /> {step}…
            </span>
          ) : null}
        </div>
        {error ? <p className="mt-3 text-[13px] text-red">{error}</p> : null}
      </Card>

      {suggestions && parsed ? (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="kicker">2 · column mapping</div>
            <div className="flex items-center gap-2">
              <Pill tone="blue">
                <Sparkles size={11} className="mr-1" /> suggested by gpt-6-luna{aiMeta?.cached ? " · cached" : ""}
              </Pill>
              <span className="tag">[dates read as {aiMeta?.dateOrder}]</span>
            </div>
          </div>
          <p className="mt-2 text-[13px] text-txt">The model only proposes; check each row and change anything that is wrong. Fields with no column stay unknown.</p>
          <div className="mt-3 grid gap-x-6 gap-y-2 md:grid-cols-2">
            {IMPORT_FIELDS.map((f) => {
              const s = suggestions.find((x) => x.field === f.key);
              return (
                <div key={f.key} className="flex items-center gap-3 border-b border-line-2 py-1.5">
                  <span className="w-36 shrink-0 text-[13px]">
                    {f.label}
                    {f.required ? <span className="text-red"> *</span> : null}
                  </span>
                  <select
                    value={mapping[f.key] ?? ""}
                    onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value || null }))}
                    className="min-w-0 flex-1 rounded-[8px] border border-line bg-white px-2 py-1 font-mono text-[12px]"
                    aria-label={`Column for ${f.label}`}
                  >
                    <option value="">— not in this register —</option>
                    {parsed.headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                  <span className="w-24 shrink-0 truncate text-right" title={s?.note}>
                    {s?.column ? <span className={cn("tag", s.confidence < 0.6 && "text-amber")}>{Math.round(s.confidence * 100)}%</span> : <span className="tag">—</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <Button className="mt-4" onClick={onValidate} disabled={pending}>
            [check {parsed.rows.length} rows]
          </Button>
        </Card>
      ) : null}

      {results && counts ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <div className="kicker">3 · review</div>
            <div className="flex items-center gap-2">
              <Pill tone="green">{counts.ok} ready</Pill>
              <Pill tone="amber">{counts.review} need review (imported as drafts)</Pill>
              <Pill tone="red">{counts.error} rejected</Pill>
            </div>
          </div>
          <div className="max-h-[460px] overflow-auto">
            <table className="w-full min-w-[900px] text-left text-[12.5px]">
              <thead className="sticky top-0 bg-card">
                <tr className="tag border-y border-line-2 text-[11px]">
                  <th className="px-5 py-2 font-normal">[row]</th>
                  <th className="px-3 py-2 font-normal">[status]</th>
                  <th className="px-3 py-2 font-normal">[institution]</th>
                  <th className="px-3 py-2 font-normal">[fdr · amount]</th>
                  <th className="px-3 py-2 font-normal">[dates]</th>
                  <th className="px-5 py-2 font-normal">[issues]</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-2">
                {results.map((r) => (
                  <tr key={r.row} className="align-top">
                    <td className="px-5 py-2 font-mono">{r.row}</td>
                    <td className="px-3 py-2">
                      <Pill tone={STATUS_TONE[r.status]}>{r.status}</Pill>
                    </td>
                    <td className="max-w-[240px] px-3 py-2">{r.institution?.name ?? <span className="text-red">no match</span>}</td>
                    <td className="px-3 py-2 font-mono">
                      {r.values.instrumentNo ?? "?"}
                      <div className="text-txt">{r.values.amount ? `₹${Number(r.values.amount).toLocaleString("en-IN")}` : "?"}</div>
                    </td>
                    <td className="px-3 py-2 font-mono whitespace-nowrap">
                      {r.values.issueDate ?? "unknown"}
                      <div className="text-txt">→ {r.values.maturityDate ?? "unknown"}</div>
                    </td>
                    <td className="px-5 py-2 text-[12px] text-txt">{r.issues.length ? r.issues.join(" · ") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 border-t border-line-2 px-5 py-3">
            <Button onClick={onCommit} disabled={pending || counts.ok + counts.review === 0 || !!done}>
              [import {counts.ok + counts.review} rows]
            </Button>
            <span className="tag">[every imported row gets its own ledger entry with the source file and row number]</span>
          </div>
        </Card>
      ) : null}

      {done ? (
        <Card className="border-green/40 bg-green-soft p-5">
          <div className="kicker">done</div>
          <p className="mt-2 text-[14px]">
            Imported {done.created.length} records ({done.rejected} rejected rows were not imported).
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {done.created.slice(0, 30).map((c) => (
              <Link key={c} href={`/app/cases/${c}`} className="rounded-[8px] bg-card px-2 py-1 font-mono text-[12px] hover:underline">
                {c}
              </Link>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
