"use server";

import { randomUUID } from "node:crypto";
import { and, eq, notInArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { can, distinctActor, type Permission } from "@/lib/auth/roles";
import { requirePermission, requireUser, type SessionUser } from "@/lib/auth/session";
import { appendLedger } from "@/lib/ledger";
import type { FieldKey } from "@/lib/rules/fields";
import { fileMeta, signedUploadUrl } from "@/lib/sidecar";
import { instrumentScope } from "@/modules/cases/scope";
import { confirmBankLetter, recordBankLetter, requestBankConfirmation } from "./bank";
import { readScan } from "./pipeline";
import { recomputeInstrument } from "./recompute";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

async function scoped(user: SessionUser, caseNo: string) {
  const [row] = await db
    .select({ i: schema.instruments })
    .from(schema.instruments)
    .innerJoin(schema.institutions, eq(schema.institutions.id, schema.instruments.institutionId))
    .where(and(eq(schema.instruments.caseNo, caseNo), instrumentScope(user)))
    .limit(1);
  if (!row) notFound();
  return row.i;
}

async function run(caseNo: string, perm: Permission, fn: (user: SessionUser, i: typeof schema.instruments.$inferSelect) => Promise<string>): Promise<ActionResult> {
  const user = await requirePermission(perm);
  const i = await scoped(user, caseNo);
  try {
    const message = await fn(user, i);
    revalidatePath(`/app/cases/${caseNo}`);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/* ----------------------------------------------------------- read scan -- */

export async function readScanAction(caseNo: string) {
  return run(caseNo, "instrument.scrutinise", async (user, i) => {
    const r = await readScan(i.id, user);
    const readers = [r.readers.di === "fulfilled" ? "Doc-AI" : null, r.readers.llm === "fulfilled" ? "gpt-6.1-terra" : null].filter(Boolean).join(" + ");
    return `Scan read by ${readers || "no reader"}: ${r.agreed}/8 fields agree between readers · tamper ${r.tamperScore}/100 · trust ${r.result?.trust.score ?? "—"}${r.result?.raised.length ? ` · ${r.result.raised.length} discrepancy raised` : ""}`;
  });
}

/* -------------------------------------------------------------- bank -- */

export async function requestBankAction(caseNo: string) {
  return run(caseNo, "verification.request", async (user, i) => {
    const r = await requestBankConfirmation(i.id, user);
    switch (r.outcome) {
      case "bank_confirmed":
        return `Bank confirmed the deposit via ${r.method === "nesl" ? "NeSL" : "Account Aggregator"} · trust ${r.trust}`;
      case "mismatch":
        return `Bank answered, but its record differs from the declaration · trust ${r.trust}`;
      case "no_record":
        return "The bank has no record of this FDR · critical discrepancy raised";
      case "letter_needed":
        return "This bank is not on the AA network: record the branch's confirmation letter";
      default:
        return "The bank rail was unavailable; try again or use a bank letter";
    }
  });
}

export async function prepareLetterUpload(caseNo: string, mime: string, size: number) {
  const user = await requirePermission("verification.request");
  await scoped(user, caseNo);
  z.enum(["application/pdf", "image/png", "image/jpeg"]).parse(mime);
  z.number().max(10 * 1024 * 1024).parse(size);
  const key = `uploads/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
  return { key, url: signedUploadUrl(key) };
}

const letterSchema = z.object({
  fileKey: z.string().regex(/^uploads\/[0-9a-f-]{36}\.(pdf|png|jpg)$/),
  amount: z.string().min(1),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lienHolder: z.string().min(2),
});

export async function recordLetterAction(caseNo: string, input: z.infer<typeof letterSchema>) {
  return run(caseNo, "verification.request", async (user, i) => {
    const v = letterSchema.parse(input);
    const meta = await fileMeta(v.fileKey);
    if (!meta.exists) throw new Error("The letter did not finish uploading");
    const [doc] = await db
      .insert(schema.documents)
      .values({ instrumentId: i.id, kind: "bank_letter", fileKey: v.fileKey, filename: "bank-confirmation-letter", mime: meta.mime!, sizeBytes: meta.size!, sha256: meta.sha256!, uploadedBy: user.id, extractionStatus: "skipped", tamperStatus: "skipped" })
      .returning({ id: schema.documents.id });
    const fields = await db.select().from(schema.instrumentFields).where(eq(schema.instrumentFields.instrumentId, i.id));
    const declared = Object.fromEntries(fields.map((f) => [f.field, f.declaredValue ?? ""])) as Record<FieldKey, string>;
    // The letter confirms the key facts; the rest follow the declaration.
    const letter = { ...declared, amount: v.amount, maturityDate: v.maturityDate, lienHolder: v.lienHolder };
    await recordBankLetter(i.id, user, letter, doc.id);
    return "Letter recorded. A checker must confirm it before it counts as the bank's word.";
  });
}

export async function confirmLetterAction(caseNo: string, verificationId: string) {
  return run(caseNo, "verification.confirm", async (user) => {
    const r = await confirmBankLetter(verificationId, user);
    return `Bank letter confirmed · trust ${r?.trust.score ?? "—"}`;
  });
}

/* ---------------------------------------------------------- scrutiny -- */

export async function acceptRecordAction(caseNo: string) {
  return run(caseNo, "instrument.scrutinise", async (user, i) => {
    if (!["bank_confirmed", "manual_confirmed"].includes(i.verificationStatus)) throw new Error("The bank has not confirmed this instrument yet");
    const open = await db
      .select({ id: schema.discrepancies.id })
      .from(schema.discrepancies)
      .where(and(eq(schema.discrepancies.instrumentId, i.id), notInArray(schema.discrepancies.status, ["closed", "dismissed"])));
    if (open.length) throw new Error(`Close the ${open.length} open discrepanc${open.length > 1 ? "ies" : "y"} first`);
    await db.update(schema.instruments).set({ recordStatus: "accepted" }).where(eq(schema.instruments.id, i.id));
    await appendLedger({ actor: user, action: "record.accepted", entity: "instrument", entityId: i.id, payload: {} });
    await recomputeInstrument(i.id, user, "record accepted");
    return "Record accepted into the registry";
  });
}

export async function returnRecordAction(caseNo: string, reason: string) {
  return run(caseNo, "instrument.scrutinise", async (user, i) => {
    const r = z.string().trim().min(5, "Give the institution a reason").max(1000).parse(reason);
    await db.update(schema.instruments).set({ recordStatus: "returned" }).where(eq(schema.instruments.id, i.id));
    await db.insert(schema.observations).values({ instrumentId: i.id, authorId: user.id, body: r, sharedWithInstitution: true });
    await appendLedger({ actor: user, action: "record.returned", entity: "instrument", entityId: i.id, payload: { reason: r } });
    await recomputeInstrument(i.id, user, "record returned");
    return "Returned to the institution with your reason";
  });
}

/* ------------------------------------------------------ discrepancies -- */

const SEVERITY = z.enum(["low", "medium", "high", "critical"]);

export async function raiseDiscrepancyAction(caseNo: string, input: { title: string; detail: string; severity: string; field?: string }) {
  return run(caseNo, "discrepancy.raise", async (user, i) => {
    const v = z.object({ title: z.string().trim().min(4).max(160), detail: z.string().trim().max(2000), severity: SEVERITY, field: z.string().optional() }).parse(input);
    const [d] = await db
      .insert(schema.discrepancies)
      .values({ instrumentId: i.id, kind: "manual", field: v.field || null, severity: v.severity, title: v.title, detail: v.detail, raisedBy: user.id, dueAt: new Date(Date.now() + 15 * 86_400_000) })
      .returning({ id: schema.discrepancies.id });
    await appendLedger({ actor: user, action: "discrepancy.raised", entity: "instrument", entityId: i.id, payload: { discrepancyId: d.id, severity: v.severity, title: v.title } });
    await recomputeInstrument(i.id, user, "discrepancy raised");
    return "Discrepancy raised";
  });
}

async function loadDiscrepancy(instrumentId: string, id: string) {
  const [d] = await db.select().from(schema.discrepancies).where(and(eq(schema.discrepancies.id, id), eq(schema.discrepancies.instrumentId, instrumentId)));
  if (!d) throw new Error("Discrepancy not found");
  return d;
}

/** One action per transition, each checked against role and (for closing) separation of duties. */
export async function discrepancyAction(caseNo: string, discrepancyId: string, op: "ask" | "respond" | "resolve" | "close" | "reopen", text: string) {
  const user = await requireUser();
  const need: Record<typeof op, Permission> = { ask: "discrepancy.raise", respond: "discrepancy.respond", resolve: "discrepancy.raise", close: "discrepancy.close", reopen: "discrepancy.close" };
  if (!can(user.roles, need[op])) return { ok: false, message: "Your role cannot do that" } as ActionResult;
  const i = await scoped(user, caseNo);
  try {
    const d = await loadDiscrepancy(i.id, discrepancyId);
    const body = text.trim();
    const set: Partial<typeof schema.discrepancies.$inferInsert> = {};
    let message = "";
    if (op === "ask") {
      if (body.length < 5) throw new Error("Write what the institution should clarify");
      set.status = "awaiting_institution";
      message = "Sent to the institution";
    } else if (op === "respond") {
      if (body.length < 5) throw new Error("Write your response");
      set.status = "open";
      message = "Response sent to the dealing officer";
    } else if (op === "resolve") {
      if (body.length < 5) throw new Error("Record how it was resolved");
      set.status = "resolved_pending_check";
      set.resolution = body;
      set.resolvedBy = user.id;
      message = "Marked resolved: a checker must close it";
    } else if (op === "close") {
      if (d.status !== "resolved_pending_check") throw new Error("Only a resolved discrepancy can be closed");
      if (!distinctActor(user.id, [d.resolvedBy])) throw new Error("The officer who resolved it cannot also close it");
      set.status = "closed";
      set.closedBy = user.id;
      set.closedAt = new Date();
      message = "Discrepancy closed";
    } else {
      set.status = "open";
      message = "Reopened";
    }
    await db.update(schema.discrepancies).set(set).where(eq(schema.discrepancies.id, d.id));
    if (body) {
      await db.insert(schema.observations).values({ instrumentId: i.id, discrepancyId: d.id, authorId: user.id, body, sharedWithInstitution: op !== "resolve" && op !== "close" });
    }
    await appendLedger({ actor: user, action: `discrepancy.${op}`, entity: "instrument", entityId: i.id, payload: { discrepancyId: d.id, to: set.status } });
    await recomputeInstrument(i.id, user, `discrepancy ${op}`);
    revalidatePath(`/app/cases/${caseNo}`);
    return { ok: true, message } as ActionResult;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" } as ActionResult;
  }
}

