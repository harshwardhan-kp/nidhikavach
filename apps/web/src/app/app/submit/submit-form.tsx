"use client";

import { CheckCircle2, FileUp, Loader2 } from "lucide-react";
import { useActionState, useState } from "react";
import { Button, Card } from "@/components/ui";
import type { Branch } from "@/modules/instruments/ifsc";
import { lookupIfsc, prepareUpload, submitInstrument, type SubmitState } from "@/modules/instruments/actions";
import { cn } from "@/lib/utils";

type Props = {
  institutionName: string;
  programmes: string[];
  renewable: { caseNo: string; label: string }[];
  defaultReplaces?: string;
  lienDefault: string;
};

const input = "w-full rounded-[10px] border border-line bg-white px-3 py-2.5 text-[14px] outline-none focus:border-ink aria-[invalid=true]:border-red";

function Field({ name, label, hint, error, children }: { name: string; label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5" htmlFor={name}>
      <span className="tag text-[12px]">[{label}]</span>
      {children}
      {error ? (
        <span role="alert" className="text-[12px] text-red">
          {error}
        </span>
      ) : hint ? (
        <span className="text-[12px] text-mut">{hint}</span>
      ) : null}
    </label>
  );
}

async function uploadScan(file: File): Promise<{ key: string } | { error: string }> {
  const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
  if (!["application/pdf", "image/png", "image/jpeg"].includes(mime)) return { error: "Upload a PDF, PNG or JPEG scan" };
  if (file.size > 10 * 1024 * 1024) return { error: "The scan must be under 10 MB" };
  const { key, url } = await prepareUpload({ filename: file.name, size: file.size, mime });
  const body = new FormData();
  body.set("file", file);
  const res = await fetch(url, { method: "POST", body });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    return { error: typeof detail.detail === "string" ? detail.detail : `Upload failed (${res.status})` };
  }
  return { key };
}

export function SubmitForm({ institutionName, programmes, renewable, defaultReplaces, lienDefault }: Props) {
  const [stage, setStage] = useState<"idle" | "uploading" | "saving">("idle");
  const [branch, setBranch] = useState<Branch | null | "loading" | "none">(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const [state, action] = useActionState<SubmitState, FormData>(async (prev, fd) => {
    const file = fd.get("scan");
    if (!(file instanceof File) || file.size === 0) return { errors: { fileKey: "Attach the FDR scan" } };
    setStage("uploading");
    const up = await uploadScan(file).catch(() => ({ error: "Could not reach the document store" }));
    if ("error" in up) {
      setStage("idle");
      return { errors: { fileKey: up.error } };
    }
    fd.delete("scan");
    fd.set("fileKey", up.key);
    fd.set("filename", file.name);
    setStage("saving");
    const result = await submitInstrument(prev, fd);
    setStage("idle");
    return result;
  }, undefined);

  const e = state?.errors ?? {};
  const busy = stage !== "idle";

  async function checkIfsc(value: string) {
    const v = value.trim().toUpperCase();
    if (v.length !== 11) return setBranch(null);
    setBranch("loading");
    setBranch((await lookupIfsc(v)) ?? "none");
  }

  return (
    <form action={action} className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
      <Card className="flex flex-col gap-4 p-5">
        <div className="kicker">instrument details</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="programme" label="programme" error={e.programme}>
            <input id="programme" name="programme" list="programmes" required className={input} aria-invalid={!!e.programme} placeholder="e.g. B.Tech Computer Engineering" />
            <datalist id="programmes">
              {programmes.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field name="type" label="instrument type" error={e.type}>
            <select id="type" name="type" className={input} defaultValue="fdr">
              <option value="fdr">Fixed deposit receipt (FDR)</option>
              <option value="efdr">e-FDR</option>
              <option value="bg">Bank guarantee</option>
            </select>
          </Field>
          <Field name="instrumentNo" label="fdr / receipt number" error={e.instrumentNo}>
            <input id="instrumentNo" name="instrumentNo" required className={cn(input, "font-mono")} aria-invalid={!!e.instrumentNo} />
          </Field>
          <Field name="amount" label="amount (₹)" error={e.amount}>
            <input id="amount" name="amount" type="number" min={1000} step={1} required className={cn(input, "font-mono")} aria-invalid={!!e.amount} placeholder="1000000" />
          </Field>
          <Field name="issueDate" label="date of deposit" error={e.issueDate}>
            <input id="issueDate" name="issueDate" type="date" required className={input} aria-invalid={!!e.issueDate} />
          </Field>
          <Field name="maturityDate" label="maturity date" error={e.maturityDate}>
            <input id="maturityDate" name="maturityDate" type="date" required className={input} aria-invalid={!!e.maturityDate} />
          </Field>
        </div>

        <Field name="ifsc" label="ifsc of issuing branch" error={e.ifsc}>
          <input
            id="ifsc"
            name="ifsc"
            required
            maxLength={11}
            className={cn(input, "font-mono uppercase")}
            aria-invalid={!!e.ifsc || branch === "none"}
            placeholder="SBIN0001234"
            onBlur={(ev) => checkIfsc(ev.currentTarget.value)}
          />
        </Field>
        {branch === "loading" ? (
          <p className="-mt-2 flex items-center gap-1.5 text-[12px] text-txt">
            <Loader2 size={13} className="animate-spin" /> looking up branch…
          </p>
        ) : branch === "none" ? (
          <p className="-mt-2 text-[12px] text-red">No branch found for this IFSC.</p>
        ) : branch ? (
          <p className="-mt-2 flex items-start gap-1.5 text-[12.5px] text-green">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
            <span>
              {branch.bank}, {branch.branch} · <span className="text-txt">{branch.address}</span>
            </span>
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="depositorName" label="depositor (as on the receipt)" error={e.depositorName}>
            <input id="depositorName" name="depositorName" required defaultValue={institutionName} className={input} />
          </Field>
          <Field name="lienHolder" label="lien marked in favour of" error={e.lienHolder} hint="Must be AICTE for a security deposit">
            <input id="lienHolder" name="lienHolder" required defaultValue={lienDefault} className={input} />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" name="autoRenew" className="h-4 w-4 accent-[var(--color-ink)]" /> The deposit renews automatically at maturity
        </label>
      </Card>

      <div className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3 p-5">
          <div className="kicker">fdr scan</div>
          <label
            htmlFor="scan"
            className={cn(
              "flex cursor-pointer flex-col items-center gap-2 rounded-[12px] border border-dashed px-4 py-8 text-center transition-colors hover:border-ink",
              e.fileKey ? "border-red" : "border-line",
            )}
          >
            <FileUp size={22} className="text-txt" />
            <span className="text-[13px]">{fileName ?? "Choose the scanned FDR (PDF, JPG or PNG, up to 10 MB)"}</span>
            <span className="tag">[sent straight to the encrypted document store]</span>
          </label>
          <input id="scan" name="scan" type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" onChange={(ev) => setFileName(ev.currentTarget.files?.[0]?.name ?? null)} />
          {e.fileKey ? (
            <p role="alert" className="text-[12px] text-red">
              {e.fileKey}
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col gap-3 p-5">
          <div className="kicker">renewal or replacement?</div>
          <select name="replacesCaseNo" defaultValue={defaultReplaces ?? ""} className={input} aria-label="Replaces an existing FDR">
            <option value="">No, this is a new deposit</option>
            {renewable.map((r) => (
              <option key={r.caseNo} value={r.caseNo}>
                Renews {r.label}
              </option>
            ))}
          </select>
          {e.replacesCaseNo ? <p className="text-[12px] text-red">{e.replacesCaseNo}</p> : null}
          <p className="text-[12px] text-txt">Linking a renewal keeps one history for the deposit and stops its reminders.</p>
        </Card>

        {state?.message ? <p className="text-[13px] text-red">{state.message}</p> : null}
        <Button type="submit" disabled={busy}>
          {stage === "uploading" ? "[uploading scan…]" : stage === "saving" ? "[submitting…]" : "[submit for verification]"}
        </Button>
        <p className="tag">[after you submit, the dealing officer is notified and the scan is read by doc-ai]</p>
      </div>
    </form>
  );
}
