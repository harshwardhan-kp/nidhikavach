"use server";

import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { requirePermission } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { appendLedger } from "@/lib/ledger";
import { FIELDS, isAicteLien } from "@/lib/rules/fields";
import { renewalLane, validityLane } from "@/lib/rules/lanes";
import { nextAction } from "@/lib/rules/next-action";
import { fileMeta, signedUploadUrl } from "@/lib/sidecar";
import { readScan } from "@/modules/verify/pipeline";
import { findBranch, IFSC_RE, type Branch } from "./ifsc";

const MAX_BYTES = 10 * 1024 * 1024;
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg" };

/** Step 1: a one-time upload link straight to the document store (the file never passes through Vercel). */
export async function prepareUpload(input: { filename: string; size: number; mime: string }) {
  await requirePermission("instrument.submit");
  const { size, mime } = z.object({ filename: z.string().max(200), size: z.number().int().positive().max(MAX_BYTES), mime: z.enum(["application/pdf", "image/png", "image/jpeg"]) }).parse(input);
  const key = `uploads/${randomUUID()}.${EXT[mime]}`;
  return { key, url: signedUploadUrl(key, MAX_BYTES), maxBytes: MAX_BYTES, size };
}

export async function lookupIfsc(code: string): Promise<Branch | null> {
  await requirePermission("instrument.submit");
  return findBranch(code);
}

const rupees = z.coerce.number().int().min(1000, "Amount looks too small").max(1_00_00_00_000, "Amount looks too large");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");

const submitSchema = z
  .object({
    programme: z.string().trim().min(2).max(120),
    type: z.enum(["fdr", "efdr", "bg"]),
    instrumentNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9/-]{6,24}$/, "6–24 letters or digits"),
    ifsc: z.string().trim().toUpperCase().regex(IFSC_RE, "IFSC is 11 characters, like SBIN0001234"),
    amount: rupees,
    issueDate: isoDate,
    maturityDate: isoDate,
    depositorName: z.string().trim().min(3).max(200),
    lienHolder: z.string().trim().min(3).max(200),
    autoRenew: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
    replacesCaseNo: z.string().trim().optional().transform((v) => v || undefined),
    fileKey: z.string().regex(/^uploads\/[0-9a-f-]{36}\.(pdf|png|jpg)$/, "Upload the FDR scan first"),
    filename: z.string().max(200),
  })
  .refine((v) => v.maturityDate > v.issueDate, { path: ["maturityDate"], message: "Maturity must be after the issue date" });

export type SubmitState = { errors?: Record<string, string>; message?: string } | undefined;

async function nextCaseNo(tx: Pick<typeof db, "execute">, yy: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(${2026_0000 + Number(yy)})`);
  const [{ max }] = await tx.execute<{ max: string | null }>(sql`select max(substring(case_no from 8)::int)::text as max from instruments where case_no like ${`FDR-${yy}-%`}`);
  return `FDR-${yy}-${String((Number(max) || 0) + 1).padStart(5, "0")}`;
}

export async function submitInstrument(_prev: SubmitState, formData: FormData): Promise<SubmitState> {
  const user = await requirePermission("instrument.submit");
  if (!user.institutionId) return { message: "Your account is not linked to an institution." };

  const parsed = submitSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { errors };
  }
  const v = parsed.data;
  const todayIso = await today();
  if (v.issueDate > todayIso) return { errors: { issueDate: "Issue date cannot be in the future" } };

  // Trust the document store, not the browser: confirm the file exists and read its real hash/type.
  const meta = await fileMeta(v.fileKey).catch(() => null);
  if (!meta?.exists || !meta.sha256 || !meta.mime) return { errors: { fileKey: "The scan did not finish uploading. Try again." } };

  const branch = await findBranch(v.ifsc);
  if (!branch) return { errors: { ifsc: "No bank branch found for this IFSC" } };

  const [inst] = await db.select().from(schema.institutions).where(eq(schema.institutions.id, user.institutionId));

  let replaces: { id: string; caseNo: string } | null = null;
  if (v.replacesCaseNo) {
    const [old] = await db
      .select({ id: schema.instruments.id, caseNo: schema.instruments.caseNo })
      .from(schema.instruments)
      .where(and(eq(schema.instruments.caseNo, v.replacesCaseNo), eq(schema.instruments.institutionId, user.institutionId)));
    if (!old) return { errors: { replacesCaseNo: "That FDR is not one of yours" } };
    replaces = old;
  }

  const [maker] = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .where(and(eq(schema.userRoles.role, "maker"), eq(schema.users.regionId, inst.regionId), eq(schema.users.active, true)))
    .limit(1);

  const lienIsAicte = isAicteLien(v.lienHolder);
  const validity = validityLane({ maturityDate: v.maturityDate, today: todayIso, lienIsAicte, issueDate: v.issueDate });
  const renewal = renewalLane({ current: "not_due", release: "none", maturityDate: v.maturityDate, today: todayIso, issueDate: v.issueDate });
  const na = nextAction({
    recordStatus: "submitted", verificationStatus: "unverified", validityStatus: validity, renewalStatus: renewal,
    releaseStatus: "none", maturityDate: v.maturityDate, openDiscrepancies: 0, today: todayIso,
  });

  const declared: Record<(typeof FIELDS)[number]["key"], string> = {
    instrumentNo: v.instrumentNo,
    amount: String(v.amount),
    issueDate: v.issueDate,
    maturityDate: v.maturityDate,
    ifsc: v.ifsc,
    depositorName: v.depositorName,
    lienHolder: v.lienHolder,
    autoRenew: v.autoRenew ? "Yes" : "No",
  };

  const created = await db.transaction(async (tx) => {
    const caseNo = await nextCaseNo(tx, todayIso.slice(2, 4));
    const [row] = await tx
      .insert(schema.instruments)
      .values({
        caseNo,
        institutionId: inst.id,
        programme: v.programme,
        type: v.type,
        instrumentNo: v.instrumentNo,
        bankName: branch.bank,
        ifsc: v.ifsc,
        branch: branch.branch,
        amountPaise: v.amount * 100,
        issueDate: v.issueDate,
        maturityDate: v.maturityDate,
        depositorName: v.depositorName,
        lienHolder: v.lienHolder,
        autoRenew: v.autoRenew,
        recordStatus: "submitted",
        verificationStatus: "unverified",
        validityStatus: validity,
        renewalStatus: renewal,
        releaseStatus: "none",
        riskBand: "unscored",
        replacesInstrumentId: replaces?.id ?? null,
        ruleSetVersion: 1,
        ownerUserId: maker?.id ?? null,
        nextAction: na?.text ?? null,
        nextActionDue: na?.due ?? null,
        submittedBy: user.id,
        submittedAt: new Date(),
      })
      .returning({ id: schema.instruments.id });

    await tx.insert(schema.instrumentFields).values(FIELDS.map((f) => ({ instrumentId: row.id, field: f.key, declaredValue: declared[f.key], match: "missing" as const })));
    const [doc] = await tx
      .insert(schema.documents)
      .values({
        instrumentId: row.id,
        kind: replaces ? "renewal_scan" : "fdr_scan",
        fileKey: v.fileKey,
        filename: v.filename.replace(/[^\w.\- ]/g, "_").slice(0, 120) || "scan",
        mime: meta.mime!,
        sizeBytes: meta.size!,
        sha256: meta.sha256!,
        uploadedBy: user.id,
      })
      .returning({ id: schema.documents.id });

    if (replaces) {
      await tx.update(schema.instruments).set({ renewalStatus: "requested", updatedAt: new Date() }).where(eq(schema.instruments.id, replaces.id));
      await appendLedger({ actor: user, action: "renewal.submitted", entity: "instrument", entityId: replaces.id, payload: { renewedBy: caseNo } }, tx);
    }
    await appendLedger(
      {
        actor: user,
        action: "instrument.submitted",
        entity: "instrument",
        entityId: row.id,
        payload: { caseNo, amountPaise: v.amount * 100, ifsc: v.ifsc, maturityDate: v.maturityDate, replaces: replaces?.caseNo ?? null },
      },
      tx,
    );
    await appendLedger({ actor: user, action: "document.uploaded", entity: "instrument", entityId: row.id, payload: { documentId: doc.id, sha256: meta.sha256, size: meta.size } }, tx);

    if (maker) {
      await tx.insert(schema.notifications).values({
        channel: "inbox",
        userId: maker.id,
        instrumentId: row.id,
        subject: `New ${replaces ? "renewal" : "FDR"} submitted: ${caseNo}`,
        body: `${inst.name} submitted ${caseNo} for ₹${v.amount.toLocaleString("en-IN")} (${branch.bank}, ${v.ifsc}), maturing ${v.maturityDate}.`,
        link: `/app/cases/${caseNo}`,
      });
    }
    return { caseNo, id: row.id };
  });

  // Doc-AI and the model start reading as soon as the response is sent; the case page refreshes until they finish.
  after(() => readScan(created.id, null).catch((e) => console.error("auto read failed", created.caseNo, e)));
  redirect(`/app/cases/${created.caseNo}?submitted=1`);
}
