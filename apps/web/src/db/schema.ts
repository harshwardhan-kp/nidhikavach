/**
 * NidhiKavach database schema (v1).
 *
 * Conventions: money is stored in paise (bigint), timestamps are timestamptz,
 * calendar dates (issue/maturity) are `date`. Each instrument carries five
 * independent status lanes, so maturity can never imply release.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();

/* ----------------------------------------------------------------- enums -- */

export const roleEnum = pgEnum("role", [
  "institution",
  "maker",
  "checker",
  "authority",
  "auditor",
  "admin",
]);

export const instrumentTypeEnum = pgEnum("instrument_type", ["fdr", "efdr", "bg", "ebg", "dd"]);

export const recordStatusEnum = pgEnum("record_status", [
  "draft",
  "submitted",
  "under_scrutiny",
  "accepted",
  "returned",
  "rejected",
]);

export const verificationStatusEnum = pgEnum("verification_status", [
  "unverified",
  "pending_bank",
  "bank_confirmed",
  "mismatch",
  "unavailable",
  "manual_confirmed",
]);

export const validityStatusEnum = pgEnum("validity_status", [
  "valid",
  "expiring",
  "matured",
  "expired",
  "lien_unknown",
]);

export const renewalStatusEnum = pgEnum("renewal_status", [
  "not_due",
  "due",
  "requested",
  "renewed",
  "replaced",
  "overdue",
]);

export const releaseStatusEnum = pgEnum("release_status", [
  "none",
  "requested",
  "recommended",
  "checked",
  "approved",
  "released",
  "refunded",
  "rejected",
]);

export const riskBandEnum = pgEnum("risk_band", ["green", "amber", "red", "unscored"]);

export const documentKindEnum = pgEnum("document_kind", [
  "fdr_scan",
  "bank_letter",
  "renewal_scan",
  "release_order",
  "supporting",
]);

export const processingStatusEnum = pgEnum("processing_status", [
  "pending",
  "running",
  "done",
  "failed",
  "skipped",
]);

export const verificationMethodEnum = pgEnum("verification_method", [
  "account_aggregator",
  "nesl",
  "bank_letter",
  "manual",
]);

export const fieldMatchEnum = pgEnum("field_match", ["match", "soft_match", "mismatch", "missing"]);

export const severityEnum = pgEnum("severity", ["low", "medium", "high", "critical"]);

export const discrepancyStatusEnum = pgEnum("discrepancy_status", [
  "open",
  "awaiting_institution",
  "resolved_pending_check",
  "closed",
  "dismissed",
]);

export const releaseKindEnum = pgEnum("release_kind", ["release", "refund", "discharge"]);

export const approvalStepEnum = pgEnum("approval_step", ["recommend", "check", "approve"]);

export const decisionEnum = pgEnum("decision", ["approve", "return", "reject"]);

export const notificationChannelEnum = pgEnum("notification_channel", ["inbox", "email"]);

/* ------------------------------------------------------- people & places -- */

export const regions = pgTable("regions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  hqCity: text("hq_city").notNull(),
  states: text("states").array().notNull().default(sql`'{}'::text[]`),
});

export const institutions = pgTable(
  "institutions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    aicteId: text("aicte_id").notNull().unique(),
    name: text("name").notNull(),
    kind: text("kind").notNull(), // engineering, polytechnic, management, pharmacy, architecture...
    ownership: text("ownership").notNull(), // government, private, aided...
    state: text("state").notNull(),
    city: text("city").notNull(),
    regionId: integer("region_id")
      .notNull()
      .references(() => regions.id),
    nodalEmail: text("nodal_email"),
    createdAt: createdAt(),
  },
  (t) => [
    index("institutions_region_idx").on(t.regionId),
    index("institutions_name_trgm_idx").using("gin", sql`${t.name} gin_trgm_ops`),
  ],
);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  designation: text("designation").notNull(),
  passwordHash: text("password_hash").notNull(),
  institutionId: uuid("institution_id").references(() => institutions.id),
  regionId: integer("region_id").references(() => regions.id),
  isDemo: boolean("is_demo").notNull().default(false),
  active: boolean("active").notNull().default(true),
  lastLoginAt: ts("last_login_at"),
  createdAt: createdAt(),
});

/** A user may hold several roles; maker != checker is still enforced per record by user id. */
export const userRoles = pgTable(
  "user_roles",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: roleEnum("role").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

/* ----------------------------------------------------------- instruments -- */

export const ruleSets = pgTable("rule_sets", {
  id: serial("id").primaryKey(),
  version: integer("version").notNull().unique(),
  effectiveFrom: date("effective_from", { mode: "string" }).notNull(),
  body: jsonb("body").notNull(),
  notes: text("notes"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: createdAt(),
});

export const instruments = pgTable(
  "instruments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    caseNo: text("case_no").notNull().unique(), // FDR-26-04187
    institutionId: uuid("institution_id")
      .notNull()
      .references(() => institutions.id),
    programme: text("programme").notNull(),
    purpose: text("purpose").notNull().default("security_deposit"),
    type: instrumentTypeEnum("type").notNull().default("fdr"),

    // What the institution declared (source 1). Sources 2/3 live in instrument_fields.
    instrumentNo: text("instrument_no"),
    bankName: text("bank_name"),
    ifsc: text("ifsc"),
    branch: text("branch"),
    amountPaise: bigint("amount_paise", { mode: "number" }),
    issueDate: date("issue_date", { mode: "string" }),
    maturityDate: date("maturity_date", { mode: "string" }),
    depositorName: text("depositor_name"),
    lienHolder: text("lien_holder"),
    autoRenew: boolean("auto_renew"),

    // Five independent lanes.
    recordStatus: recordStatusEnum("record_status").notNull().default("draft"),
    verificationStatus: verificationStatusEnum("verification_status").notNull().default("unverified"),
    validityStatus: validityStatusEnum("validity_status").notNull().default("valid"),
    renewalStatus: renewalStatusEnum("renewal_status").notNull().default("not_due"),
    releaseStatus: releaseStatusEnum("release_status").notNull().default("none"),

    trustScore: integer("trust_score"),
    riskBand: riskBandEnum("risk_band").notNull().default("unscored"),
    trustBreakdown: jsonb("trust_breakdown"),

    replacesInstrumentId: uuid("replaces_instrument_id").references((): AnyPgColumn => instruments.id),
    ruleSetVersion: integer("rule_set_version"),
    ownerUserId: uuid("owner_user_id").references(() => users.id),
    nextAction: text("next_action"),
    nextActionDue: date("next_action_due", { mode: "string" }),

    submittedBy: uuid("submitted_by").references(() => users.id),
    submittedAt: ts("submitted_at"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    rowVersion: integer("row_version").notNull().default(1),
  },
  (t) => [
    index("instruments_institution_idx").on(t.institutionId),
    index("instruments_maturity_idx").on(t.maturityDate),
    index("instruments_lanes_idx").on(t.recordStatus, t.verificationStatus, t.validityStatus),
    index("instruments_risk_idx").on(t.riskBand, t.trustScore),
    index("instruments_owner_idx").on(t.ownerUserId),
    index("instruments_no_trgm_idx").using("gin", sql`${t.instrumentNo} gin_trgm_ops`),
  ],
);

/** Three-source comparison, one row per instrument field. */
export const instrumentFields = pgTable(
  "instrument_fields",
  {
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    declaredValue: text("declared_value"),
    scanValue: text("scan_value"),
    scanConfidence: real("scan_confidence"),
    scanSource: text("scan_source"), // "di", "llm", "di+llm"
    bankValue: text("bank_value"),
    bankSource: text("bank_source"),
    match: fieldMatchEnum("match").notNull().default("missing"),
    note: text("note"),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.instrumentId, t.field] })],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    kind: documentKindEnum("kind").notNull(),
    fileKey: text("file_key").notNull(), // path in sidecar storage
    filename: text("filename").notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    sha256: text("sha256").notNull(),
    version: integer("version").notNull().default(1),
    uploadedBy: uuid("uploaded_by").references(() => users.id),
    uploadedAt: ts("uploaded_at").notNull().defaultNow(),
    extractionStatus: processingStatusEnum("extraction_status").notNull().default("pending"),
    extraction: jsonb("extraction"),
    tamperStatus: processingStatusEnum("tamper_status").notNull().default("pending"),
    tamperScore: integer("tamper_score"),
    tamperFindings: jsonb("tamper_findings"),
    synthetic: boolean("synthetic").notNull().default(false),
  },
  (t) => [index("documents_instrument_idx").on(t.instrumentId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    method: verificationMethodEnum("method").notNull(),
    consentId: text("consent_id"),
    status: processingStatusEnum("status").notNull().default("pending"),
    result: verificationStatusEnum("result"),
    request: jsonb("request"),
    response: jsonb("response"),
    requestedBy: uuid("requested_by").references(() => users.id),
    confirmedBy: uuid("confirmed_by").references(() => users.id), // checker for manual/letter path
    requestedAt: ts("requested_at").notNull().defaultNow(),
    completedAt: ts("completed_at"),
  },
  (t) => [index("verifications_instrument_idx").on(t.instrumentId)],
);

export const discrepancies = pgTable(
  "discrepancies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // field_mismatch, tamper_flag, missing_document, lien_missing...
    field: text("field"),
    severity: severityEnum("severity").notNull(),
    status: discrepancyStatusEnum("status").notNull().default("open"),
    title: text("title").notNull(),
    detail: text("detail"),
    autoRaised: boolean("auto_raised").notNull().default(false),
    raisedBy: uuid("raised_by").references(() => users.id),
    raisedAt: ts("raised_at").notNull().defaultNow(),
    dueAt: ts("due_at"),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolution: text("resolution"),
    closedBy: uuid("closed_by").references(() => users.id),
    closedAt: ts("closed_at"),
  },
  (t) => [index("discrepancies_instrument_idx").on(t.instrumentId), index("discrepancies_status_idx").on(t.status)],
);

/** Scrutiny observations and threaded replies (internal or shared with the institution). */
export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    discrepancyId: uuid("discrepancy_id").references(() => discrepancies.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    body: text("body").notNull(),
    sharedWithInstitution: boolean("shared_with_institution").notNull().default(false),
    aiDrafted: boolean("ai_drafted").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("observations_instrument_idx").on(t.instrumentId)],
);

/* --------------------------------------------------------------- release -- */

export const releaseRequests = pgTable(
  "release_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    kind: releaseKindEnum("kind").notNull(),
    reason: text("reason").notNull(),
    conditions: jsonb("conditions"), // checklist evaluated from the rule set
    state: releaseStatusEnum("state").notNull().default("requested"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    requestedAt: ts("requested_at").notNull().defaultNow(),
    decidedAt: ts("decided_at"),
    orderNo: text("order_no").unique(),
    orderDocumentId: uuid("order_document_id").references(() => documents.id),
    orderHash: text("order_hash"),
  },
  (t) => [index("release_requests_instrument_idx").on(t.instrumentId)],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    releaseRequestId: uuid("release_request_id")
      .notNull()
      .references(() => releaseRequests.id, { onDelete: "cascade" }),
    step: approvalStepEnum("step").notNull(),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id),
    decision: decisionEnum("decision").notNull(),
    comment: text("comment"),
    signedPayload: text("signed_payload"),
    signature: text("signature"),
    keyId: text("key_id"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("approvals_request_step_idx").on(t.releaseRequestId, t.step)],
);

/** Public per-officer signing keys for the simulated eSign (private keys stay server-side). */
export const signingKeys = pgTable("signing_keys", {
  keyId: text("key_id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  publicKey: text("public_key").notNull(),
  createdAt: createdAt(),
});

/* -------------------------------------------------- reminders & messages -- */

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    instrumentId: uuid("instrument_id")
      .notNull()
      .references(() => instruments.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // maturity, renewal_overdue, discrepancy_sla, verification_sla
    offsetDays: integer("offset_days"),
    dueOn: date("due_on", { mode: "string" }).notNull(),
    escalationLevel: integer("escalation_level").notNull().default(0),
    ruleSetVersion: integer("rule_set_version"),
    firedAt: ts("fired_at"),
    createdAt: createdAt(),
  },
  (t) => [
    index("reminders_due_idx").on(t.dueOn),
    uniqueIndex("reminders_unique_idx").on(t.instrumentId, t.kind, t.offsetDays, t.escalationLevel),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    channel: notificationChannelEnum("channel").notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    institutionId: uuid("institution_id").references(() => institutions.id),
    instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "cascade" }),
    toAddress: text("to_address"),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    link: text("link"),
    readAt: ts("read_at"),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt)],
);

/* ----------------------------------------------------------- audit & AI -- */

/**
 * Append-only, hash-chained audit ledger. Rows are written only through the
 * SQL function ledger_append(); UPDATE and DELETE are blocked by trigger
 * (see the custom migration).
 */
export const auditLedger = pgTable(
  "audit_ledger",
  {
    seq: bigserial("seq", { mode: "number" }).primaryKey(),
    ts: ts("ts").notNull(),
    actorId: uuid("actor_id"),
    actorRole: text("actor_role"),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull().unique(),
  },
  (t) => [index("audit_ledger_entity_idx").on(t.entity, t.entityId)],
);

export const ledgerAnchors = pgTable("ledger_anchors", {
  id: serial("id").primaryKey(),
  seq: bigint("seq", { mode: "number" }).notNull(),
  hash: text("hash").notNull(),
  location: text("location").notNull(), // e.g. sidecar:/anchors/2026-11-07.json
  anchoredAt: ts("anchored_at").notNull().defaultNow(),
});

export const aiCalls = pgTable(
  "ai_calls",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    feature: text("feature").notNull(), // A1..A10 key
    model: text("model").notNull(),
    inputHash: text("input_hash").notNull(),
    output: jsonb("output"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    latencyMs: integer("latency_ms"),
    cached: boolean("cached").notNull().default(false),
    error: text("error"),
    actorId: uuid("actor_id").references(() => users.id),
    instrumentId: uuid("instrument_id").references(() => instruments.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("ai_calls_cache_idx").on(t.feature, t.model, t.inputHash)],
);

/** Key/value settings, e.g. the demo clock offset. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export type Role = (typeof roleEnum.enumValues)[number];
export type Instrument = typeof instruments.$inferSelect;
export type User = typeof users.$inferSelect;
