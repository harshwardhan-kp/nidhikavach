import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { Logo } from "@/components/logo";
import { Card, Simulated } from "@/components/ui";
import { db, schema } from "@/db";
import { verifyPayload } from "@/lib/esign";
import { fileMeta, signedGetUrl } from "@/lib/sidecar";
import { cn, formatDateTime, formatPaise } from "@/lib/utils";

export const metadata: Metadata = { title: "Verify a release order", robots: { index: false } };

function Check({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex gap-2.5">
      {ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-green" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-red" />}
      <div>
        <div className={cn("font-semibold", !ok && "text-red")}>{label}</div>
        <div className="text-[12.5px] text-txt">{detail}</div>
      </div>
    </li>
  );
}

/** Public: anyone holding the QR can check an order is genuine and unchanged. Shows only what the order itself states. */
export default async function VerifyPage({ params }: PageProps<"/verify/[id]">) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const [row] = await db
    .select({ r: schema.releaseRequests, i: schema.instruments, inst: schema.institutions })
    .from(schema.releaseRequests)
    .innerJoin(schema.instruments, eq(schema.instruments.id, schema.releaseRequests.instrumentId))
    .innerJoin(schema.institutions, eq(schema.institutions.id, schema.instruments.institutionId))
    .where(eq(schema.releaseRequests.id, id));
  if (!row?.r.orderNo) notFound();
  const { r, i, inst } = row;

  const [signed] = await db
    .select({ a: schema.approvals, signer: schema.users.name, designation: schema.users.designation, publicKey: schema.signingKeys.publicKey })
    .from(schema.approvals)
    .innerJoin(schema.users, eq(schema.users.id, schema.approvals.actorId))
    .leftJoin(schema.signingKeys, eq(schema.signingKeys.keyId, schema.approvals.keyId))
    .where(and(eq(schema.approvals.releaseRequestId, r.id), eq(schema.approvals.step, "approve")));
  const sigOk = !!(signed?.publicKey && signed.a.signedPayload && signed.a.signature && verifyPayload(signed.publicKey, signed.a.signedPayload, signed.a.signature));
  const payload = signed?.a.signedPayload ? (JSON.parse(signed.a.signedPayload) as { orderNo: string; instrumentNo: string; amountPaise: number; ifsc: string }) : null;
  const matchesRecord = !!payload && payload.orderNo === r.orderNo && payload.instrumentNo === i.instrumentNo && payload.amountPaise === i.amountPaise;

  const [doc] = r.orderDocumentId ? await db.select().from(schema.documents).where(eq(schema.documents.id, r.orderDocumentId)) : [];
  const stored = doc ? await fileMeta(doc.fileKey).catch(() => null) : null;
  const fileOk = !!(stored?.exists && stored.sha256 === r.orderHash);
  const genuine = sigOk && matchesRecord && fileOk;

  return (
    <main className="mx-auto flex min-h-screen max-w-[720px] flex-col gap-5 px-5 py-10">
      <div className="flex items-center justify-between">
        <Logo href="/" />
        <Simulated what="prototype · simulated eSign" />
      </div>
      <Card className={cn("p-6", genuine ? "border-green/50" : "border-red/50")}>
        <div className="flex items-center gap-3">
          <ShieldCheck size={28} className={genuine ? "text-green" : "text-red"} />
          <div>
            <div className="kicker">release order verification</div>
            <h1 className="font-serif text-[30px] leading-tight">{genuine ? "Genuine and unchanged" : "Could not verify this order"}</h1>
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-[150px_1fr] gap-x-3 gap-y-2 text-[13.5px]">
          <dt className="tag">[order no.]</dt>
          <dd className="font-mono">{r.orderNo}</dd>
          <dt className="tag">[decision]</dt>
          <dd>
            {r.kind === "refund" ? "Refund" : "Release"} approved {r.decidedAt ? formatDateTime(r.decidedAt) : ""} · now <b>{r.state}</b>
          </dd>
          <dt className="tag">[institution]</dt>
          <dd>
            {inst.name} <span className="tag">(AICTE id {inst.aicteId})</span>
          </dd>
          <dt className="tag">[deposit]</dt>
          <dd>
            FDR ending <span className="font-mono">{i.instrumentNo?.slice(-4)}</span> · {formatPaise(i.amountPaise)} · {i.bankName} <span className="font-mono">{i.ifsc}</span>
          </dd>
          <dt className="tag">[signed by]</dt>
          <dd>
            {signed?.signer}, {signed?.designation} <span className="tag">key {signed?.a.keyId}</span>
          </dd>
        </dl>
        <ul className="mt-5 flex flex-col gap-3 text-[13.5px]">
          <Check ok={sigOk} label="Signature valid" detail="The Ed25519 signature checks against the officer's published key." />
          <Check ok={matchesRecord} label="Matches the registry" detail="The signed order names this FDR, amount and order number." />
          <Check ok={fileOk} label="PDF unchanged" detail={`SHA-256 of the stored order ${r.orderHash?.slice(0, 16)}… matches the hash recorded on the audit ledger.`} />
        </ul>
        {doc && fileOk ? (
          <a href={signedGetUrl(doc.fileKey, doc.filename)} className="mt-5 inline-block rounded-[10px] bg-ink-2 px-4 py-2.5 font-mono text-[13px] text-white hover:opacity-85">
            [open the order pdf]
          </a>
        ) : null}
      </Card>
      <p className="tag text-[11.5px]">NidhiKavach prototype for SIH 2026 (SIH26265). Orders here are specimens, not legal instruments.</p>
    </main>
  );
}
