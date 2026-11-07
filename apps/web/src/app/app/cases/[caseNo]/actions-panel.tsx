"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import {
  acceptRecordAction,
  confirmLetterAction,
  prepareLetterUpload,
  raiseDiscrepancyAction,
  readScanAction,
  recordLetterAction,
  requestBankAction,
  returnRecordAction,
  type ActionResult,
} from "@/modules/verify/actions";

export type PendingLetter = { id: string; recordedBy: string | null; recordedByMe: boolean; amount: string; maturityDate: string; lienHolder: string; documentUrl: string | null };

type Props = {
  caseNo: string;
  can: { scrutinise: boolean; request: boolean; confirm: boolean; raise: boolean };
  hasScan: boolean;
  scanRead: boolean;
  /** Read at some point (seeded history counts), which is what acceptance requires. */
  scanChecked: boolean;
  scanRunning: boolean;
  recordStatus: string;
  verificationStatus: string;
  openDiscrepancies: number;
  letterNeeded: boolean;
  pendingLetter: PendingLetter | null;
  declared: { amount: string; maturityDate: string; lienHolder: string };
};

const READ_STAGES = [
  "sending the scan to Azure Document Intelligence…",
  "gpt-6.1-terra is reading the receipt…",
  "looking for compression traces of pasted text…",
  "asking the model for a second opinion on tampering…",
  "comparing the two readings field by field…",
  "rescoring the case…",
];

const input = "w-full rounded-[9px] border border-line bg-white px-2.5 py-2 text-[13px] outline-none focus:border-ink";

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return (
    <p role="status" className={cn("mt-3 flex items-start gap-1.5 text-[12.5px]", r.ok ? "text-green" : "text-red")}>
      {r.ok ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
      <span>{r.message}</span>
    </p>
  );
}

/** Cycles through what the pipeline is doing while the ~13 s read runs. */
function useStages(active: boolean) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setN((x) => Math.min(x + 1, READ_STAGES.length - 1)), 2300);
    return () => {
      clearInterval(t);
      setN(0);
    };
  }, [active]);
  return READ_STAGES[n];
}

export function ActionsPanel(p: Props) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [form, setForm] = useState<"letter" | "return" | "raise" | null>(null);
  const stage = useStages(busy === "read");

  function go(name: string, fn: () => Promise<ActionResult>) {
    setBusy(name);
    setResult(null);
    start(async () => {
      const r = await fn().catch((e: unknown) => ({ ok: false as const, message: e instanceof Error ? e.message : "Request failed" }));
      setResult(r);
      setBusy(null);
      if (r.ok) {
        setForm(null);
        router.refresh();
      }
    });
  }

  const closed = ["accepted", "rejected"].includes(p.recordStatus);
  const bankDone = ["bank_confirmed", "manual_confirmed"].includes(p.verificationStatus);
  const acceptBlock = p.hasScan && !p.scanChecked ? "the scan has not been read" : !bankDone ? "the bank has not confirmed it yet" : p.openDiscrepancies ? `${p.openDiscrepancies} discrepanc${p.openDiscrepancies > 1 ? "ies are" : "y is"} still open` : null;
  const any = p.can.scrutinise || p.can.request || p.can.confirm;

  if (!any) {
    return <p className="text-[13px] text-txt">Your role follows this case; the dealing and regional officers act on it.</p>;
  }
  if (!p.can.scrutinise && !p.can.request && !p.pendingLetter) {
    return <p className="text-[13px] text-txt">Nothing waits for a checker here. Resolved discrepancies to close appear in the list on the left.</p>;
  }

  return (
    <div>
      <div className="flex flex-col gap-2">
        {p.can.scrutinise && p.hasScan ? (
          <Button onClick={() => go("read", () => readScanAction(p.caseNo))} disabled={pending} variant={p.scanRead ? "light" : "dark"} className="justify-start">
            {busy === "read" ? <Loader2 size={14} className="animate-spin" /> : null}
            {p.scanRunning ? "[being read… · read again]" : p.scanRead ? "[read the scan again]" : "[read scan · doc-ai + gpt-6.1-terra]"}
          </Button>
        ) : null}
        {busy === "read" ? <p className="font-mono text-[11.5px] text-txt">{stage}</p> : null}

        {p.can.request && !bankDone && !p.pendingLetter ? (
          p.letterNeeded ? (
            <Button onClick={() => setForm(form === "letter" ? null : "letter")} disabled={pending} variant="dark" className="justify-start">
              [record the bank&apos;s confirmation letter]
            </Button>
          ) : (
            <Button onClick={() => go("bank", () => requestBankAction(p.caseNo))} disabled={pending} variant={p.scanRead ? "dark" : "light"} className="justify-start">
              {busy === "bank" ? <Loader2 size={14} className="animate-spin" /> : null}
              [ask the bank to confirm]
            </Button>
          )
        ) : null}

        {p.pendingLetter ? (
          <div className="rounded-[10px] border border-amber/40 bg-amber-soft/50 p-3 text-[12.5px]">
            <div className="tag">[bank letter awaiting a checker]</div>
            <dl className="mt-1.5 grid grid-cols-[90px_1fr] gap-y-0.5 font-mono text-[12px]">
              <dt className="text-txt">amount</dt>
              <dd>₹{Number(p.pendingLetter.amount).toLocaleString("en-IN")}</dd>
              <dt className="text-txt">matures</dt>
              <dd>{p.pendingLetter.maturityDate}</dd>
              <dt className="text-txt">lien</dt>
              <dd>{p.pendingLetter.lienHolder}</dd>
            </dl>
            <p className="tag mt-1.5">
              recorded by {p.pendingLetter.recordedBy ?? "an officer"}
              {p.pendingLetter.documentUrl ? (
                <>
                  {" · "}
                  <a href={p.pendingLetter.documentUrl} target="_blank" rel="noreferrer" className="underline hover:text-ink">
                    open letter
                  </a>
                </>
              ) : null}
            </p>
            {p.can.confirm ? (
              p.pendingLetter.recordedByMe ? (
                <p className="mt-2 text-[12px] text-txt">You recorded this letter, so another officer must confirm it.</p>
              ) : (
                <Button size="sm" className="mt-2" onClick={() => go("confirm", () => confirmLetterAction(p.caseNo, p.pendingLetter!.id))} disabled={pending}>
                  {busy === "confirm" ? <Loader2 size={13} className="animate-spin" /> : null}
                  [confirm the letter as checker]
                </Button>
              )
            ) : null}
          </div>
        ) : null}

        {p.can.scrutinise && !closed ? (
          <div className="mt-1 flex flex-wrap gap-2">
            <Button size="sm" variant={acceptBlock ? "light" : "dark"} disabled={pending || !!acceptBlock} title={acceptBlock ?? undefined} onClick={() => go("accept", () => acceptRecordAction(p.caseNo))}>
              {busy === "accept" ? <Loader2 size={13} className="animate-spin" /> : null}
              [accept record]
            </Button>
            <Button size="sm" variant="light" disabled={pending} onClick={() => setForm(form === "return" ? null : "return")}>
              [return to institution]
            </Button>
            {p.can.raise ? (
              <Button size="sm" variant="light" disabled={pending} onClick={() => setForm(form === "raise" ? null : "raise")}>
                [raise discrepancy]
              </Button>
            ) : null}
          </div>
        ) : null}
        {p.can.scrutinise && !closed && acceptBlock ? <p className="tag">[accept unlocks once {acceptBlock.replace("the bank has not confirmed it yet", "the bank confirms").replace("the scan has not been read", "the scan is read")}]</p> : null}
      </div>

      {form === "letter" ? <LetterForm caseNo={p.caseNo} declared={p.declared} pending={pending} busy={busy} go={go} /> : null}
      {form === "return" ? <ReturnForm caseNo={p.caseNo} pending={pending} go={go} /> : null}
      {form === "raise" ? <RaiseForm caseNo={p.caseNo} pending={pending} go={go} /> : null}
      <Result r={result} />
    </div>
  );
}

type Go = (name: string, fn: () => Promise<ActionResult>) => void;

function LetterForm({ caseNo, declared, pending, busy, go }: { caseNo: string; declared: Props["declared"]; pending: boolean; busy: string | null; go: Go }) {
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    const file = fd.get("letter");
    if (!(file instanceof File) || !file.size) return setErr("Attach the scanned letter");
    const mime = file.type === "image/jpg" ? "image/jpeg" : file.type;
    go("letter", async () => {
      const { key, url } = await prepareLetterUpload(caseNo, mime, file.size);
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(url, { method: "POST", body });
      if (!res.ok) return { ok: false, message: `Upload failed (${res.status})` };
      return recordLetterAction(caseNo, { fileKey: key, amount: String(fd.get("amount")), maturityDate: String(fd.get("maturityDate")), lienHolder: String(fd.get("lienHolder")) });
    });
  }
  return (
    <form action={submit} className="mt-3 flex flex-col gap-2.5 rounded-[10px] border border-line-2 bg-panel p-3">
      <p className="text-[12.5px] text-txt">Enter what the branch&apos;s letter states. It counts only after a different officer confirms it.</p>
      <label className="flex flex-col gap-1">
        <span className="tag">[amount, ₹]</span>
        <input name="amount" defaultValue={declared.amount} className={input} inputMode="numeric" required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="tag">[maturity date]</span>
        <input name="maturityDate" type="date" defaultValue={declared.maturityDate} className={input} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="tag">[lien marked to]</span>
        <input name="lienHolder" defaultValue={declared.lienHolder} className={input} required />
      </label>
      <label className="flex flex-col gap-1">
        <span className="tag">[scanned letter · pdf / png / jpeg]</span>
        <input name="letter" type="file" accept="application/pdf,image/png,image/jpeg" className="text-[12px]" required />
      </label>
      {err ? <p className="text-[12px] text-red">{err}</p> : null}
      <Button size="sm" disabled={pending} className="w-fit">
        {busy === "letter" ? <Loader2 size={13} className="animate-spin" /> : null}
        [record letter]
      </Button>
    </form>
  );
}

function ReturnForm({ caseNo, pending, go }: { caseNo: string; pending: boolean; go: Go }) {
  return (
    <form action={(fd) => go("return", () => returnRecordAction(caseNo, String(fd.get("reason") ?? "")))} className="mt-3 flex flex-col gap-2 rounded-[10px] border border-line-2 bg-panel p-3">
      <label className="flex flex-col gap-1">
        <span className="tag">[reason the institution will see]</span>
        <textarea name="reason" rows={3} className={input} required minLength={5} />
      </label>
      <Button size="sm" disabled={pending} className="w-fit">
        [return record]
      </Button>
    </form>
  );
}

function RaiseForm({ caseNo, pending, go }: { caseNo: string; pending: boolean; go: Go }) {
  return (
    <form
      action={(fd) =>
        go("raise", () => raiseDiscrepancyAction(caseNo, { title: String(fd.get("title") ?? ""), detail: String(fd.get("detail") ?? ""), severity: String(fd.get("severity") ?? "medium") }))
      }
      className="mt-3 flex flex-col gap-2 rounded-[10px] border border-line-2 bg-panel p-3"
    >
      <label className="flex flex-col gap-1">
        <span className="tag">[what is wrong]</span>
        <input name="title" className={input} required minLength={4} maxLength={160} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="tag">[detail]</span>
        <textarea name="detail" rows={2} className={input} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="tag">[severity]</span>
        <select name="severity" defaultValue="medium" className={input}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </select>
      </label>
      <Button size="sm" disabled={pending} className="w-fit">
        [raise]
      </Button>
    </form>
  );
}
