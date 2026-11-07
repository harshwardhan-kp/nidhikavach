"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { z } from "zod";
import { db, schema } from "@/db";
import { can } from "@/lib/auth/roles";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { appendLedger } from "@/lib/ledger";
import { getCase } from "@/modules/cases/queries";
import { type Brief, caseBrief } from "./brief";
import { DRAFT_KINDS, type DraftKind, draftLetter } from "./draft";

const officer = (u: SessionUser) => can(u.roles, "instrument.scrutinise") || can(u.roles, "verification.confirm") || can(u.roles, "release.approve");

async function load(caseNo: string) {
  const user = await requireUser();
  const c = await getCase(user, caseNo);
  if (!c) notFound();
  return { user, c };
}

export async function briefAction(caseNo: string): Promise<{ ok: true; brief: Brief & { cached: boolean } } | { ok: false; message: string }> {
  const { user, c } = await load(caseNo);
  if (!can(user.roles, "reports.view")) return { ok: false, message: "Briefs are for officers" };
  try {
    return { ok: true, brief: await caseBrief(c, await today(), user.id) };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "The model is unavailable" };
  }
}

export async function draftAction(caseNo: string, kind: string, lang: string) {
  const { user, c } = await load(caseNo);
  if (!officer(user)) return { ok: false as const, message: "Only officers draft letters" };
  try {
    const k = z.enum(DRAFT_KINDS).parse(kind);
    const l = z.enum(["en", "hi"]).parse(lang);
    const d = await draftLetter(c, k, l, { name: user.name, designation: user.designation }, await today());
    return { ok: true as const, draft: d, to: recipientsLabel(k, c.inst.nodalEmail, c.i.ifsc) };
  } catch (e) {
    return { ok: false as const, message: e instanceof Error ? e.message : "The model is unavailable" };
  }
}

const bankMailbox = (ifsc: string | null) => `branch.${(ifsc ?? "unknown").toLowerCase()}@bank.demo.nidhikavach.in`;

function recipientsLabel(kind: DraftKind, nodalEmail: string | null, ifsc: string | null) {
  if (kind === "discrepancy_letter") return nodalEmail ?? "the institution's nodal officer";
  if (kind === "bank_request") return bankMailbox(ifsc);
  return "regional officer and competent authority";
}

/** The officer's edited draft goes to the outbox (and inboxes); the ledger records who sent what. */
export async function sendDraftAction(caseNo: string, input: { kind: string; subject: string; body: string; callId: string | null }) {
  const { user, c } = await load(caseNo);
  if (!officer(user)) return { ok: false as const, message: "Only officers send letters" };
  const v = z.object({ kind: z.enum(DRAFT_KINDS), subject: z.string().trim().min(5).max(300), body: z.string().trim().min(20).max(8000), callId: z.string().uuid().nullable() }).safeParse(input);
  if (!v.success) return { ok: false as const, message: "Subject and letter text are needed" };
  const { kind, subject, body, callId } = v.data;
  const base = { instrumentId: c.i.id, subject, body, link: `/app/cases/${c.i.caseNo}`, sentBy: user.id };
  const msgs: (typeof schema.notifications.$inferInsert)[] = [];
  const to: string[] = [];

  if (kind === "discrepancy_letter") {
    const email = c.inst.nodalEmail;
    if (email) {
      msgs.push({ ...base, channel: "email", institutionId: c.inst.id, toAddress: email });
      to.push(email);
    }
    const instUsers = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.institutionId, c.inst.id));
    for (const u of instUsers) msgs.push({ ...base, channel: "inbox", userId: u.id });
  } else if (kind === "bank_request") {
    const email = bankMailbox(c.i.ifsc);
    msgs.push({ ...base, channel: "email", toAddress: email });
    to.push(email);
  } else {
    const officers = await db
      .select({ id: schema.users.id, email: schema.users.email, regionId: schema.users.regionId, role: schema.userRoles.role })
      .from(schema.users)
      .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
      .where(and(inArray(schema.userRoles.role, ["checker", "authority"]), eq(schema.users.active, true)));
    for (const o of officers.filter((o) => o.role === "authority" || o.regionId === c.inst.regionId)) {
      msgs.push({ ...base, channel: "inbox", userId: o.id }, { ...base, channel: "email", toAddress: o.email });
      to.push(o.email);
    }
  }
  if (!msgs.length) return { ok: false as const, message: "No recipient on record" };
  await db.insert(schema.notifications).values(msgs);
  await appendLedger({ actor: user, action: "letter.sent", entity: "instrument", entityId: c.i.id, payload: { kind, subject, to, aiDraft: callId } });
  revalidatePath(`/app/cases/${c.i.caseNo}`);
  return { ok: true as const, message: `Sent to ${to.join(", ") || "inboxes"} (see the email outbox)` };
}
