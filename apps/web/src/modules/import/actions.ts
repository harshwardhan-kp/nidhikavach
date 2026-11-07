"use server";

import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { structured } from "@/lib/ai/client";
import { MODELS } from "@/lib/ai/models";
import { requirePermission } from "@/lib/auth/session";
import type { SessionUser } from "@/lib/auth/session";
import { today } from "@/lib/clock";
import { appendLedger } from "@/lib/ledger";
import { FIELDS, isAicteLien, normaliseAmount, normaliseDate } from "@/lib/rules/fields";
import { renewalLane, validityLane } from "@/lib/rules/lanes";
import { nextAction } from "@/lib/rules/next-action";
import { findBranch, IFSC_RE } from "@/modules/instruments/ifsc";
import { IMPORT_FIELDS, type ImportFieldKey, type Mapping, type MappingSuggestion, type RowResult } from "./fields";

const MAX_ROWS = 500;
const fieldKeys = IMPORT_FIELDS.map((f) => f.key) as [ImportFieldKey, ...ImportFieldKey[]];

/* ------------------------------------------------- A8: AI column mapping -- */

const suggestionSchema = z.object({
  mappings: z.array(
    z.object({
      field: z.enum(fieldKeys),
      column: z.string().nullable(),
      confidence: z.number(),
      note: z.string(),
    }),
  ),
  dateOrder: z.enum(["day-month-year", "month-day-year", "year-month-day", "mixed", "unknown"]),
});

export async function suggestMapping(headers: string[], sample: string[][]): Promise<{ suggestions: MappingSuggestion[]; dateOrder: string; cached: boolean }> {
  const user = await requirePermission("instrument.import");
  const H = z.array(z.string().max(120)).max(60).parse(headers);
  const S = z.array(z.array(z.string().max(200)).max(60)).max(8).parse(sample);

  const { data, cached } = await structured({
    feature: "A8.import_mapping",
    model: MODELS.fast,
    schemaName: "column_mapping",
    schema: suggestionSchema,
    actorId: user.id,
    instructions: [
      "You map columns of an old Indian government register of fixed deposit receipts (FDRs) onto a fixed schema.",
      "For every target field return the single source column header that holds it, copied exactly, or null if no column clearly holds it.",
      "Never invent a column and never map one column to two fields unless it truly holds both (then pick the better field and note it).",
      "confidence is 0 to 1. note is one short sentence on why, or on how values are written (for example 'dates like 12.03.2019', 'amount in lakh').",
      `Target fields: ${IMPORT_FIELDS.map((f) => `${f.key} (${f.label})`).join(", ")}.`,
    ].join("\n"),
    input: JSON.stringify({ headers: H, sampleRows: S }),
  });

  const valid = new Set(H);
  const suggestions = fieldKeys.map((field) => {
    const m = data.mappings.find((x) => x.field === field);
    const column = m?.column && valid.has(m.column) ? m.column : null;
    return { field, column, confidence: column ? Math.max(0, Math.min(1, m!.confidence)) : 0, note: m?.note ?? "" };
  });
  return { suggestions, dateOrder: data.dateOrder, cached };
}

/* ------------------------------------------------- validation & commit -- */

const ABBREVIATIONS: [RegExp, string][] = [
  [/\binst\b\.?/gi, "Institute"],
  [/\btech\b\.?/gi, "Technology"],
  [/\bengg\b\.?/gi, "Engineering"],
  [/\bcoll\b\.?/gi, "College"],
  [/\bmgmt\b\.?/gi, "Management"],
  [/\bpoly\b\.?/gi, "Polytechnic"],
  [/\bpharm\b\.?/gi, "Pharmacy"],
  [/\bsch\b\.?/gi, "School"],
];
const expand = (name: string) => ABBREVIATIONS.reduce((s, [re, rep]) => s.replace(re, rep), name).replace(/\s+/g, " ").trim();

const rowsSchema = z.array(z.record(z.string(), z.string().max(300))).max(MAX_ROWS);
const mappingSchema = z.record(z.string(), z.string().nullable());

async function matchInstitution(user: SessionUser, aicteId: string | null, name: string | null) {
  const region = user.regionId;
  if (aicteId) {
    const [hit] = await db
      .select({ id: schema.institutions.id, name: schema.institutions.name, regionId: schema.institutions.regionId })
      .from(schema.institutions)
      .where(eq(schema.institutions.aicteId, aicteId.trim()))
      .limit(1);
    if (hit && (!region || hit.regionId === region)) return { id: hit.id, name: hit.name, similarity: 1 };
  }
  if (!name) return null;
  const q = expand(name);
  const rows = await db.execute<{ id: string; name: string; sim: number }>(sql`
    select id, name, similarity(name, ${q}) as sim from institutions
    where ${region ? sql`region_id = ${region} and` : sql``} name % ${q}
    order by sim desc limit 1`);
  const r = rows[0];
  return r && Number(r.sim) >= 0.45 ? { id: r.id, name: r.name, similarity: Math.round(Number(r.sim) * 100) / 100 } : null;
}

async function validate(user: SessionUser, rows: Record<string, string>[], mapping: Mapping): Promise<RowResult[]> {
  const get = (r: Record<string, string>, k: ImportFieldKey) => {
    const col = mapping[k];
    const v = col ? r[col] : undefined;
    return v && v.trim() && !/^(na|n\/a|-|nil|null)$/i.test(v.trim()) ? v.trim() : null;
  };

  // Look up each distinct IFSC once (cache first, then the public API).
  const ifscs = [...new Set(rows.map((r) => get(r, "ifsc")?.toUpperCase()).filter((v): v is string => !!v && IFSC_RE.test(v)))].slice(0, 80);
  const branches = new Map((await Promise.all(ifscs.map(async (c) => [c, await findBranch(c)] as const))).filter(([, b]) => b));

  const existing = new Set(
    (
      await db
        .select({ no: schema.instruments.instrumentNo, ifsc: schema.instruments.ifsc })
        .from(schema.instruments)
        .where(inArray(schema.instruments.instrumentNo, rows.map((r) => (get(r, "instrumentNo") ?? "").toUpperCase()).filter(Boolean)))
    ).map((x) => `${x.no}|${x.ifsc}`),
  );

  const out: RowResult[] = [];
  for (const [idx, r] of rows.entries()) {
    const issues: string[] = [];
    const values: RowResult["values"] = {};
    let fatal = false;

    const institution = await matchInstitution(user, get(r, "aicteId"), get(r, "institutionName"));
    if (!institution) {
      issues.push(`Institution "${get(r, "institutionName") ?? "?"}" not found in your region`);
      fatal = true;
    } else if (institution.similarity < 1 && institution.similarity < 0.75) {
      issues.push(`Matched "${institution.name}" by name (${Math.round(institution.similarity * 100)}%): please confirm`);
    }

    const no = get(r, "instrumentNo")?.toUpperCase().replace(/\s+/g, "") ?? null;
    if (!no || !/^[A-Z0-9/-]{4,24}$/.test(no)) {
      issues.push("FDR number missing or unreadable");
      fatal = true;
    }
    values.instrumentNo = no;

    const amountRaw = get(r, "amount");
    const amount = amountRaw ? normaliseAmount(amountRaw) : null;
    if (!amount) {
      issues.push(`Amount ${amountRaw ? `"${amountRaw}" unreadable` : "missing"}`);
      fatal = true;
    }
    values.amount = amount ? String(amount) : null;

    for (const k of ["issueDate", "maturityDate"] as const) {
      const raw = get(r, k);
      const d = raw ? normaliseDate(raw) : null;
      if (raw && !d) issues.push(`${k === "issueDate" ? "Deposit" : "Maturity"} date "${raw}" unreadable: left unknown`);
      if (!raw) issues.push(`${k === "issueDate" ? "Deposit" : "Maturity"} date not recorded: left unknown`);
      values[k] = d;
    }
    if (values.issueDate && values.maturityDate && values.maturityDate <= values.issueDate) {
      issues.push("Maturity date is not after the deposit date");
      fatal = true;
    }

    const ifsc = get(r, "ifsc")?.toUpperCase() ?? null;
    if (ifsc && !IFSC_RE.test(ifsc)) issues.push(`IFSC "${ifsc}" is not valid: left unknown`);
    const branch = ifsc ? branches.get(ifsc) : undefined;
    if (ifsc && IFSC_RE.test(ifsc) && !branch) issues.push(`IFSC ${ifsc} not found in the bank directory`);
    if (!ifsc) issues.push("IFSC not recorded: left unknown");
    values.ifsc = branch ? ifsc : null;
    values.bankName = branch?.bank ?? get(r, "bankName");

    values.programme = get(r, "programme");
    values.depositorName = get(r, "depositorName") ?? institution?.name ?? null;
    const lien = get(r, "lienHolder");
    values.lienHolder = lien;
    if (!lien) issues.push("Lien not recorded: left unknown");
    else if (!isAicteLien(lien)) issues.push(`Lien "${lien}" is not in favour of AICTE`);
    const ar = get(r, "autoRenew");
    values.autoRenew = ar ? (/^(y|yes|true|1|auto)/i.test(ar) ? "Yes" : "No") : null;
    values.remarks = get(r, "remarks");

    if (no && existing.has(`${no}|${values.ifsc}`)) {
      issues.push("Already in the registry (same FDR number and IFSC)");
      fatal = true;
    }

    const unknown = issues.some((i) => i.includes("left unknown") || i.includes("not found in the bank") || i.includes("confirm") || i.includes("not in favour"));
    out.push({ row: idx + 2, status: fatal ? "error" : unknown ? "review" : "ok", institution, values, issues });
  }
  return out;
}

export async function validateImport(rawRows: Record<string, string>[], rawMapping: Record<string, string | null>) {
  const user = await requirePermission("instrument.import");
  return validate(user, rowsSchema.parse(rawRows), mappingSchema.parse(rawMapping) as Mapping);
}

export async function commitImport(fileName: string, rawRows: Record<string, string>[], rawMapping: Record<string, string | null>) {
  const user = await requirePermission("instrument.import");
  const results = await validate(user, rowsSchema.parse(rawRows), mappingSchema.parse(rawMapping) as Mapping);
  const todayIso = await today();
  const accepted = results.filter((r) => r.status !== "error" && r.institution);
  const created: string[] = [];

  await db.transaction(async (tx) => {
    const yy = todayIso.slice(2, 4);
    await tx.execute(sql`select pg_advisory_xact_lock(${2026_0000 + Number(yy)})`);
    const [{ max }] = await tx.execute<{ max: string | null }>(sql`select max(substring(case_no from 8)::int)::text as max from instruments where case_no like ${`FDR-${yy}-%`}`);
    let n = Number(max) || 0;

    for (const r of accepted) {
      const v = r.values;
      const caseNo = `FDR-${yy}-${String(++n).padStart(5, "0")}`;
      const lienKnown = v.lienHolder ? isAicteLien(v.lienHolder) : null;
      const record = r.status === "ok" ? "submitted" : "draft";
      const validity = validityLane({ maturityDate: v.maturityDate ?? null, today: todayIso, lienIsAicte: lienKnown, issueDate: v.issueDate ?? null });
      const renewal = renewalLane({ current: "not_due", release: "none", maturityDate: v.maturityDate ?? null, today: todayIso, issueDate: v.issueDate ?? null });
      const na =
        record === "draft"
          ? { text: "Complete the fields left unknown by the legacy import", due: todayIso }
          : nextAction({ recordStatus: record, verificationStatus: "unverified", validityStatus: validity, renewalStatus: renewal, releaseStatus: "none", maturityDate: v.maturityDate ?? null, openDiscrepancies: 0, today: todayIso });

      const [row] = await tx
        .insert(schema.instruments)
        .values({
          caseNo,
          institutionId: r.institution!.id,
          programme: v.programme ?? "Not recorded in legacy register",
          type: "fdr",
          instrumentNo: v.instrumentNo,
          bankName: v.bankName ?? null,
          ifsc: v.ifsc ?? null,
          amountPaise: v.amount ? Number(v.amount) * 100 : null,
          issueDate: v.issueDate ?? null,
          maturityDate: v.maturityDate ?? null,
          depositorName: v.depositorName ?? null,
          lienHolder: v.lienHolder ?? null,
          autoRenew: v.autoRenew ? v.autoRenew === "Yes" : null,
          recordStatus: record,
          verificationStatus: "unverified",
          validityStatus: validity,
          renewalStatus: renewal,
          ownerUserId: user.id,
          nextAction: na?.text ?? null,
          nextActionDue: na?.due ?? null,
          ruleSetVersion: 1,
          submittedBy: user.id,
          submittedAt: new Date(),
        })
        .returning({ id: schema.instruments.id });

      const declared: Record<string, string | null | undefined> = { ...v, amount: v.amount };
      await tx.insert(schema.instrumentFields).values(FIELDS.map((f) => ({ instrumentId: row.id, field: f.key, declaredValue: declared[f.key] ?? null, match: "missing" as const })));
      await appendLedger(
        { actor: user, action: "instrument.imported", entity: "instrument", entityId: row.id, payload: { caseNo, source: fileName, sourceRow: r.row, unknownFields: r.issues.filter((i) => i.includes("unknown")) } },
        tx,
      );
      created.push(caseNo);
    }
    await appendLedger(
      {
        actor: user,
        action: "import.completed",
        entity: "import",
        entityId: fileName.slice(0, 120),
        payload: { rows: results.length, imported: created.length, needsReview: results.filter((r) => r.status === "review").length, rejected: results.filter((r) => r.status === "error").length },
      },
      tx,
    );
  });

  return { created, rejected: results.filter((r) => r.status === "error").length };
}


