"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, count, eq, inArray, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { distinctActor, type Permission } from "@/lib/auth/roles";
import { requirePermission, type SessionUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { ensureSigningKey, signPayload } from "@/lib/esign";
import { appendLedger } from "@/lib/ledger";
import { allMet, blockers, KIND_LABEL } from "@/lib/rules/release";
import { fileMeta, signedUploadUrl, uploadBytes } from "@/lib/sidecar";
import { formatDate, formatDateTime, formatPaise } from "@/lib/utils";
import { instrumentScope } from "@/modules/cases/scope";
import { recomputeInstrument } from "@/modules/verify/recompute";
import { buildOrderPdf } from "./order-pdf";
import { approvalsOf, type Attested, checklist, currentRequest, type StoredConditions } from "./service";

type Result = { ok: true; message: string } | { ok: false; message: string };
type Instrument = typeof schema.instruments.$inferSelect;

async function scoped(user: SessionUser, caseNo: string) {
  const [row] = await db
    .select({ i: schema.instruments, inst: schema.institutions, regionCode: schema.regions.code, regionName: schema.regions.name })
    .from(schema.instruments)
    .innerJoin(schema.institutions, eq(schema.institutions.id, schema.instruments.institutionId))
    .innerJoin(schema.regions, eq(schema.regions.id, schema.institutions.regionId))
    .where(and(eq(schema.instruments.caseNo, caseNo), instrumentScope(user)))
    .limit(1);
  if (!row) notFound();
  return row;
}

async function run(caseNo: string, perm: Permission, fn: (user: SessionUser, row: Awaited<ReturnType<typeof scoped>>) => Promise<string>): Promise<Result> {
  const user = await requirePermission(perm);
  const row = await scoped(user, caseNo);
  try {
    const message = await fn(user, row);
    revalidatePath(`/app/cases/${caseNo}`);
    return { ok: true, message };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Something went wrong" };
  }
}

/** Inbox for named officers of a role (region-scoped), plus inbox + email to the institution if asked. */
async function notify(i: Instrument, institution: { id: string; regionId: number; nodalEmail: string | null }, to: ("maker" | "checker" | "authority" | "institution")[], subject: string, body: string, sentBy: string) {
  const officers = await db
    .select({ id: schema.users.id, regionId: schema.users.regionId, institutionId: schema.users.institutionId, role: schema.userRoles.role })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .where(and(inArray(schema.userRoles.role, to), eq(schema.users.active, true)));
  const ids = officers
    .filter((o) => (o.role === "institution" ? o.institutionId === institution.id : o.role === "authority" || o.regionId === institution.regionId || o.regionId === null))
    .map((o) => o.id);
  const link = `/app/cases/${i.caseNo}`;
  const msgs: (typeof schema.notifications.$inferInsert)[] = [...new Set(ids)].map((userId) => ({ channel: "inbox" as const, userId, instrumentId: i.id, subject, body, link, sentBy }));
  if (to.includes("institution") && institution.nodalEmail) msgs.push({ channel: "email", institutionId: institution.id, toAddress: institution.nodalEmail, instrumentId: i.id, subject, body, link, sentBy });
  if (msgs.length) await db.insert(schema.notifications).values(msgs);
}

/* ------------------------------------------------------- institution -- */

export async function prepareDossierUpload(caseNo: string, mime: string, size: number) {
  const user = await requirePermission("release.request");
  await scoped(user, caseNo);
  z.enum(["application/pdf", "image/png", "image/jpeg"]).parse(mime);
  z.number().max(10 * 1024 * 1024).parse(size);
  const key = `uploads/${randomUUID()}.${mime === "application/pdf" ? "pdf" : mime === "image/png" ? "png" : "jpg"}`;
  return { key, url: signedUploadUrl(key) };
}

export async function requestReleaseAction(caseNo: string, input: { kind: string; reason: string; fileKey: string | null; filename: string | null }) {
  return run(caseNo, "release.request", async (user, { i, inst }) => {
    const v = z
      .object({ kind: z.enum(["release", "refund"]), reason: z.string().trim().min(10, "Give the reason in a sentence").max(1000), fileKey: z.string().regex(/^uploads\/[0-9a-f-]{36}\.(pdf|png|jpg)$/).nullable(), filename: z.string().max(160).nullable() })
      .parse(input);
    if (i.recordStatus !== "accepted") throw new Error("Only an accepted record can be released");
    if (!["none", "rejected"].includes(i.releaseStatus)) throw new Error("A release request is already in progress");
    if (["renewed", "replaced"].includes(i.renewalStatus)) throw new Error("This FDR was renewed; request release on the current one");

    const documentIds: string[] = [];
    if (v.fileKey) {
      const meta = await fileMeta(v.fileKey);
      if (!meta.exists) throw new Error("The dossier did not finish uploading");
      const [doc] = await db
        .insert(schema.documents)
        .values({ instrumentId: i.id, kind: "supporting", fileKey: v.fileKey, filename: v.filename?.replace(/[^\w.\- ]/g, "_") || "release-dossier", mime: meta.mime!, sizeBytes: meta.size!, sha256: meta.sha256!, uploadedBy: user.id, extractionStatus: "skipped", tamperStatus: "skipped" })
        .returning({ id: schema.documents.id });
      documentIds.push(doc.id);
    }
    const conditions: StoredConditions = { documentIds };
    const check = await checklist(i, { conditions } as never, v.kind);
    const blocking = blockers(check);
    if (blocking.length) throw new Error(`Not yet: ${blocking.map((b) => b.label.toLowerCase()).join("; ")}`);

    const [req] = await db.insert(schema.releaseRequests).values({ instrumentId: i.id, kind: v.kind, reason: v.reason, conditions, state: "requested", requestedBy: user.id }).returning();
    await db.update(schema.instruments).set({ releaseStatus: "requested" }).where(eq(schema.instruments.id, i.id));
    await appendLedger({ actor: user, action: "release.requested", entity: "instrument", entityId: i.id, payload: { requestId: req.id, kind: v.kind, documents: documentIds.length } });
    await recomputeInstrument(i.id, user, "release requested");
    await notify(i, inst, ["maker"], `${i.caseNo}: ${KIND_LABEL[v.kind]} requested`, `${inst.name} asked for the ${KIND_LABEL[v.kind]} of ${formatPaise(i.amountPaise)} (${i.bankName}). Reason: ${v.reason}`, user.id);
    return "Request sent. The dealing officer will check it against clause 6.46.";
  });
}

/* ---------------------------------------------------------- officers -- */

const STEP = {
  recommend: { perm: "release.recommend", from: "requested", to: "recommended", next: ["checker"], label: "recommended" },
  check: { perm: "release.check", from: "recommended", to: "checked", next: ["authority"], label: "checked" },
  approve: { perm: "release.approve", from: "checked", to: "approved", next: ["maker", "institution"], label: "approved" },
} as const;

export async function decideReleaseAction(caseNo: string, input: { step: string; decision: string; comment: string; attest?: Attested }) {
  const step = z.enum(["recommend", "check", "approve"]).parse(input.step);
  const s = STEP[step];
  return run(caseNo, s.perm, async (user, row) => {
    const { i, inst } = row;
    const decision = z.enum(["approve", "reject"]).parse(input.decision);
    const comment = z.string().trim().max(2000).parse(input.comment ?? "");
    const req = await currentRequest(i.id);
    if (!req || req.state !== s.from) throw new Error(`Nothing waiting for this step (request is ${req?.state ?? "missing"})`);
    const earlier = await approvalsOf(req.id);
    if (!distinctActor(user.id, [req.requestedBy, ...earlier.map((e) => e.a.actorId)])) throw new Error("You already acted on this request: a different officer must take this step");
    if (decision === "reject" && comment.length < 5) throw new Error("Give the reason for rejecting");

    const stored = (req.conditions ?? {}) as StoredConditions;
    if (step === "recommend" && decision === "approve") {
      stored.attested = { cell_clearances: !!input.attest?.cell_clearances, no_dues_or_penalty: !!input.attest?.no_dues_or_penalty };
    }
    const check = await checklist(i, { ...req, conditions: stored });
    if (decision === "approve" && !allMet(check)) {
      throw new Error(`Conditions not met: ${check.filter((c) => c.met !== true).map((c) => c.label.toLowerCase()).join("; ")}`);
    }

    if (decision === "reject") {
      await db.insert(schema.approvals).values({ releaseRequestId: req.id, step, actorId: user.id, decision: "reject", comment });
      await db.update(schema.releaseRequests).set({ state: "rejected", decidedAt: new Date(), conditions: stored }).where(eq(schema.releaseRequests.id, req.id));
      await db.update(schema.instruments).set({ releaseStatus: "rejected" }).where(eq(schema.instruments.id, i.id));
      await appendLedger({ actor: user, action: "release.rejected", entity: "instrument", entityId: i.id, payload: { requestId: req.id, step, comment } });
      await recomputeInstrument(i.id, user, "release rejected");
      await notify(i, inst, ["institution", "maker"], `${i.caseNo}: release request not approved`, `The ${step === "recommend" ? "dealing officer" : step === "check" ? "regional officer" : "competent authority"} did not approve the request: ${comment}`, user.id);
      return "Rejected. The institution has been told why.";
    }

    if (step !== "approve") {
      await db.insert(schema.approvals).values({ releaseRequestId: req.id, step, actorId: user.id, decision: "approve", comment: comment || null });
      await db.update(schema.releaseRequests).set({ state: s.to, conditions: stored }).where(eq(schema.releaseRequests.id, req.id));
      await db.update(schema.instruments).set({ releaseStatus: s.to }).where(eq(schema.instruments.id, i.id));
      await appendLedger({ actor: user, action: `release.${s.to}`, entity: "instrument", entityId: i.id, payload: { requestId: req.id, comment, attested: stored.attested ?? null } });
      await recomputeInstrument(i.id, user, `release ${s.to}`);
      await notify(i, inst, [...s.next], `${i.caseNo}: release ${s.label}, your turn`, `${user.name} ${s.label} the ${KIND_LABEL[req.kind as "release" | "refund"]} of ${formatPaise(i.amountPaise)} for ${inst.name}.`, user.id);
      return step === "recommend" ? "Recommended. The regional officer checks it next." : "Checked. The competent authority decides next.";
    }

    // Authority approves: sign the order, render it, store it, publish the verify link.
    const decidedAt = new Date();
    const [{ n }] = await db.select({ n: count() }).from(schema.releaseRequests).where(isNotNull(schema.releaseRequests.orderNo));
    const orderNo = `AICTE/${row.regionCode}/SD-${req.kind === "refund" ? "REF" : "REL"}/${(await today()).slice(0, 4)}/${String(n + 1).padStart(5, "0")}`;
    const h = await headers();
    const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;
    const verifyUrl = `${origin}/verify/${req.id}`;
    const chain = [...earlier, { a: { step, actorId: user.id, createdAt: decidedAt, comment: comment || null }, name: user.name, designation: user.designation }];
    const payload = JSON.stringify({
      orderNo,
      requestId: req.id,
      kind: req.kind,
      caseNo: i.caseNo,
      instrumentNo: i.instrumentNo,
      ifsc: i.ifsc,
      amountPaise: i.amountPaise,
      institution: { name: inst.name, aicteId: inst.aicteId },
      decidedAt: decidedAt.toISOString(),
      approvals: chain.map((c) => ({ step: c.a.step, actorId: c.a.actorId, at: new Date(c.a.createdAt).toISOString() })),
    });
    const key = await ensureSigningKey(user.id);
    const signature = signPayload(user.id, payload);
    const pdfBytes = await buildOrderPdf({
      orderNo,
      date: formatDate(await today()),
      region: `${row.regionName} Regional Office`,
      kind: req.kind === "refund" ? "refund" : "release",
      institution: { name: inst.name, aicteId: inst.aicteId, city: inst.city },
      fdr: { caseNo: i.caseNo, number: i.instrumentNo ?? "-", amount: `Rs. ${formatPaise(i.amountPaise).replace("₹", "")}`, bank: i.bankName ?? "-", branch: i.branch ?? "-", ifsc: i.ifsc ?? "-", issued: formatDate(i.issueDate), matures: formatDate(i.maturityDate) },
      approvals: chain.map((c) => ({ step: c.a.step, name: c.name, designation: c.designation, at: formatDateTime(new Date(c.a.createdAt)), comment: c.a.comment })),
      signer: { name: user.name, designation: user.designation, keyId: key.keyId, signature },
      verifyUrl,
    });
    const fileKey = `orders/${req.id}.pdf`;
    const meta = await uploadBytes(fileKey, pdfBytes, "application/pdf", `${orderNo.replaceAll("/", "-")}.pdf`);
    const orderHash = createHash("sha256").update(pdfBytes).digest("hex");
    const [doc] = await db
      .insert(schema.documents)
      .values({ instrumentId: i.id, kind: "release_order", fileKey, filename: `${orderNo.replaceAll("/", "-")}.pdf`, mime: "application/pdf", sizeBytes: meta.size ?? pdfBytes.length, sha256: orderHash, uploadedBy: user.id, extractionStatus: "skipped", tamperStatus: "skipped" })
      .returning({ id: schema.documents.id });
    await db.insert(schema.approvals).values({ releaseRequestId: req.id, step, actorId: user.id, decision: "approve", comment: comment || null, signedPayload: payload, signature, keyId: key.keyId, createdAt: decidedAt });
    await db.update(schema.releaseRequests).set({ state: "approved", decidedAt, orderNo, orderDocumentId: doc.id, orderHash, conditions: stored }).where(eq(schema.releaseRequests.id, req.id));
    await db.update(schema.instruments).set({ releaseStatus: "approved" }).where(eq(schema.instruments.id, i.id));
    await appendLedger({ actor: user, action: "release.approved", entity: "instrument", entityId: i.id, payload: { requestId: req.id, orderNo, orderSha256: orderHash, keyId: key.keyId } });
    await recomputeInstrument(i.id, user, "release approved");
    await notify(i, inst, ["maker", "institution"], `${i.caseNo}: release order ${orderNo} signed`, `The competent authority approved and signed release order ${orderNo}. Verify it at ${verifyUrl}. The bank will now remove the lien.`, user.id);
    return `Approved and signed. Order ${orderNo} is ready.`;
  });
}

/** Simulated: the bank confirms it removed the lien and paid out; the case closes. */
export async function recordLienReleasedAction(caseNo: string) {
  return run(caseNo, "release.recommend", async (user, { i, inst }) => {
    const req = await currentRequest(i.id);
    if (!req || req.state !== "approved") throw new Error("No approved order waiting for the bank");
    const final = req.kind === "refund" ? "refunded" : "released";
    await db.update(schema.releaseRequests).set({ state: final }).where(eq(schema.releaseRequests.id, req.id));
    await db.update(schema.instruments).set({ releaseStatus: final, nextAction: null, nextActionDue: null, ownerUserId: null }).where(eq(schema.instruments.id, i.id));
    await appendLedger({ actor: user, action: `release.${final}`, entity: "instrument", entityId: i.id, payload: { requestId: req.id, orderNo: req.orderNo, bank: "lien removed (simulated)" } });
    await recomputeInstrument(i.id, user, `release ${final}`);
    await notify(i, inst, ["institution"], `${i.caseNo}: security deposit ${final}`, `The bank has removed AICTE's lien on FDR ${i.instrumentNo} under order ${req.orderNo}. The security deposit is ${final}.`, user.id);
    return `Closed: the deposit is ${final}.`;
  });
}
