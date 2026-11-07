"use client";

import { CheckCircle2, CircleDashed, Loader2, ShieldCheck, Sparkles, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LanePill } from "@/components/case-ui";
import { Button, Pill, Simulated } from "@/components/ui";
import type { Condition } from "@/lib/rules/release";
import { cn } from "@/lib/utils";
import { remarksAction } from "@/modules/assist/actions";
import { decideReleaseAction, prepareDossierUpload, recordLienReleasedAction, requestReleaseAction } from "@/modules/release/actions";

type Props = {
  caseNo: string;
  request: { kind: string; reason: string; state: string; requestedAt: string; orderNo: string | null; orderUrl: string | null; verifyPath: string | null; verifyUrl: string | null } | null;
  approvals: { step: string; decision: string; name: string; designation: string; at: string; comment: string | null; signed: boolean; keyId: string | null }[];
  checklist: Condition[];
  action: { step: "recommend" | "check" | "approve"; blocked: string | null } | null;
  canRequest: boolean;
  canRecordLien: boolean;
};

const STEPS = [
  ["recommend", "dealing officer"],
  ["check", "regional officer"],
  ["approve", "competent authority"],
] as const;
const field = "w-full rounded-[9px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-ink";

function Checklist({ items, caseNo }: { items: Condition[]; caseNo: string }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((c) => (
        <li key={c.key} className="flex gap-2 text-[12.5px]">
          {c.met === true ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green" /> : c.met === false ? <XCircle size={15} className="mt-0.5 shrink-0 text-red" /> : <CircleDashed size={15} className="mt-0.5 shrink-0 text-amber" />}
          <div>
            <span className={cn(c.met === false && "text-red")}>{c.label}</span> <span className="tag">[{c.clause}]</span>
            <div className="text-txt">
              {c.detail}{" "}
              {c.met !== true ? (
                <Link href={`/app/rules?case=${caseNo}&q=${encodeURIComponent(`${c.label}: what does the handbook require here? (${c.clause})`)}`} className="tag underline hover:text-ink">
                  ask the handbook
                </Link>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function ReleasePanel(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [comment, setComment] = useState("");
  const [attest, setAttest] = useState({ cell_clearances: false, no_dues_or_penalty: false });
  const [showRequest, setShowRequest] = useState(false);

  const done = (r: { ok: boolean; message: string }) => {
    setMsg({ ok: r.ok, text: r.message });
    if (r.ok) {
      setComment("");
      setShowRequest(false);
      router.refresh();
    }
  };
  const decide = (decision: "approve" | "reject") =>
    start(async () => done(await decideReleaseAction(p.caseNo, { step: p.action!.step, decision, comment, attest })));
  const draftRemarks = () =>
    start(async () => {
      const r = await remarksAction(p.caseNo, p.action!.step);
      if (r.ok) setComment(r.remarks);
      else setMsg({ ok: false, text: r.message });
    });

  async function submitRequest(fd: FormData) {
    const file = fd.get("dossier");
    start(async () => {
      let fileKey: string | null = null;
      let filename: string | null = null;
      if (file instanceof File && file.size) {
        const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
        const { key, url } = await prepareDossierUpload(p.caseNo, mime, file.size);
        const body = new FormData();
        body.set("file", file);
        const res = await fetch(url, { method: "POST", body });
        if (!res.ok) return setMsg({ ok: false, text: `Upload failed (${res.status})` });
        fileKey = key;
        filename = file.name;
      }
      done(await requestReleaseAction(p.caseNo, { kind: String(fd.get("kind")), reason: String(fd.get("reason") ?? ""), fileKey, filename }));
    });
  }

  const r = p.request;
  const live = r && !["rejected"].includes(r.state);
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      {r ? (
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="dark">{r.kind}</Pill>
            <LanePill value={r.state} />
            <span className="tag">requested {r.requestedAt}</span>
          </div>
          <p className="mt-1.5 text-txt">{r.reason}</p>
        </div>
      ) : null}

      {live || !r ? (
        <div>
          <div className="tag mb-1.5">[conditions · clause 6.46 and Affidavit 6]</div>
          <Checklist items={p.checklist} caseNo={p.caseNo} />
        </div>
      ) : null}

      {r ? (
        <ol className="grid gap-2 sm:grid-cols-3">
          {STEPS.map(([step, who]) => {
            const a = p.approvals.find((x) => x.step === step);
            return (
              <li key={step} className={cn("rounded-[10px] border px-3 py-2.5", a?.decision === "approve" ? "border-green/40 bg-green-soft/40" : a?.decision === "reject" ? "border-red/40 bg-red-soft/40" : "border-dashed border-line")}>
                <div className="tag">[{who}]</div>
                <div className="mt-1 font-semibold">{a?.decision === "reject" ? "rejected" : step}</div>
                {a ? (
                  <>
                    <div className="text-[12px]">{a.name}</div>
                    <div className="tag">{a.at}</div>
                    {a.signed ? (
                      <div className="tag mt-0.5 flex items-center gap-1 text-green">
                        <ShieldCheck size={11} /> eSigned
                      </div>
                    ) : null}
                    {a.comment ? <p className="mt-1 text-[11.5px] text-txt">“{a.comment}”</p> : null}
                  </>
                ) : (
                  <div className="tag">pending</div>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}

      {r?.orderNo ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-green/40 bg-green-soft/40 px-3 py-2.5">
          <ShieldCheck size={16} className="text-green" />
          <span>
            Order <b className="font-mono">{r.orderNo}</b>
          </span>
          {r.orderUrl ? (
            <a href={r.orderUrl} target="_blank" rel="noreferrer" className="tag underline hover:text-ink">
              open pdf
            </a>
          ) : null}
          {r.verifyPath ? (
            <a href={r.verifyPath} target="_blank" rel="noreferrer" className="tag underline hover:text-ink">
              public verify page
            </a>
          ) : null}
        </div>
      ) : null}

      {p.action ? (
        p.action.blocked ? (
          <p className="text-txt">{p.action.blocked}</p>
        ) : (
          <div className="flex flex-col gap-2 rounded-[10px] border border-line-2 bg-panel p-3">
            <div className="tag">[your step: {p.action.step === "recommend" ? "recommend" : p.action.step === "check" ? "check" : "decide and eSign"}]</div>
            {p.action.step === "recommend" ? (
              <div className="flex flex-col gap-1">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={attest.cell_clearances} onChange={(e) => setAttest({ ...attest, cell_clearances: e.target.checked })} className="mt-0.5" />
                  <span>
                    PGRC, Vigilance and other cells have cleared the institution <Simulated what="simulated clearance" />
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={attest.no_dues_or_penalty} onChange={(e) => setAttest({ ...attest, no_dues_or_penalty: e.target.checked })} className="mt-0.5" />
                  <span>No embezzlement complaint, fee-refund case or unpaid closure penalty (cl. 2.21)</span>
                </label>
              </div>
            ) : null}
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Remarks for the file" className={field} />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => decide("approve")} disabled={pending}>
                {pending ? <Loader2 size={13} className="animate-spin" /> : p.action.step === "approve" ? <ShieldCheck size={13} /> : null}
                {p.action.step === "recommend" ? "[recommend]" : p.action.step === "check" ? "[check and forward]" : "[approve and eSign the order]"}
              </Button>
              <Button size="sm" variant="light" onClick={() => decide("reject")} disabled={pending}>
                [reject]
              </Button>
              <Button size="sm" variant="ghost" onClick={draftRemarks} disabled={pending}>
                <Sparkles size={13} /> [draft remarks]
              </Button>
            </div>
          </div>
        )
      ) : null}

      {p.canRecordLien ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => start(async () => done(await recordLienReleasedAction(p.caseNo)))} disabled={pending}>
            [bank removed the lien: close the case]
          </Button>
          <Simulated what="bank confirmation simulated" />
        </div>
      ) : null}

      {p.canRequest ? (
        showRequest ? (
          <form action={submitRequest} className="flex flex-col gap-2 rounded-[10px] border border-line-2 bg-panel p-3">
            <label className="flex flex-col gap-1">
              <span className="tag">[what are you asking for]</span>
              <select name="kind" className={field} defaultValue="release">
                <option value="release">Release after the 10-year hold</option>
                <option value="refund">Refund on closure or merger (university / board certificate)</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="tag">[reason]</span>
              <textarea name="reason" rows={2} className={field} required minLength={10} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="tag">[dossier: request letter, Affidavit 6, FDR copy, latest LoA / EoA · one pdf]</span>
              <input name="dossier" type="file" accept="application/pdf,image/png,image/jpeg" className="text-[12px]" />
            </label>
            <Button size="sm" className="w-fit" disabled={pending}>
              {pending ? <Loader2 size={13} className="animate-spin" /> : null}[send request]
            </Button>
          </form>
        ) : (
          <Button size="sm" className="w-fit" onClick={() => setShowRequest(true)}>
            [request release / refund]
          </Button>
        )
      ) : null}

      {msg ? <p className={cn("text-[12.5px]", msg.ok ? "text-green" : "text-red")}>{msg.text}</p> : null}
    </div>
  );
}
